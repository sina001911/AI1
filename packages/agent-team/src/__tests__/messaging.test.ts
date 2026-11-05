import { describe, it, expect } from 'vitest'

import { createSharedContext } from '../context'
import { buildPlan } from '../plan'
import { executePlan, createCancellationController, parseAgentMessages } from '../scheduler'
import { makeTeam, makeModelConfig, defaultSystemPrompt, defaultToolPermissions } from '../team'
import type { TeamEvent } from '../types'

function buildTeam() {
  return makeTeam({
    name: 'Squad',
    description: '',
    strategy: 'sequential',
    maxConcurrency: 2,
    leader: {
      name: 'Leader',
      modelConfig: makeModelConfig('anthropic', 'claude-sonnet-4-5'),
      systemPrompt: 'leader'
    },
    specialists: [
      {
        name: 'Coder',
        role: 'coding',
        modelConfig: makeModelConfig('anthropic', 'claude-sonnet-4-5'),
        systemPrompt: defaultSystemPrompt('coding'),
        toolPermissions: defaultToolPermissions('coding'),
        enabled: true
      },
      {
        name: 'Reviewer',
        role: 'reviewer',
        modelConfig: makeModelConfig('anthropic', 'claude-sonnet-4-5'),
        systemPrompt: defaultSystemPrompt('reviewer'),
        toolPermissions: defaultToolPermissions('reviewer'),
        enabled: true
      }
    ]
  })
}

describe('parseAgentMessages', () => {
  it('extracts a single message', () => {
    const raw = 'Here is the result.\n<agent_message to="t2">Please review this code</agent_message>'
    const parsed = parseAgentMessages(raw, new Set(['t1', 't2']))
    expect(parsed).toHaveLength(1)
    expect(parsed[0].toTaskId).toBe('t2')
    expect(parsed[0].content).toBe('Please review this code')
  })

  it('extracts multiple messages', () => {
    const raw = '<agent_message to="t2">First</agent_message> some text <agent_message to="t3">Second</agent_message>'
    const parsed = parseAgentMessages(raw, new Set(['t2', 't3']))
    expect(parsed).toHaveLength(2)
    expect(parsed[0].content).toBe('First')
    expect(parsed[1].content).toBe('Second')
  })

  it('drops messages to unknown task ids', () => {
    const raw = '<agent_message to="ghost">Hello</agent_message>'
    const parsed = parseAgentMessages(raw, new Set(['t1']))
    expect(parsed).toHaveLength(0)
  })

  it('drops empty-content messages', () => {
    const raw = '<agent_message to="t2">   </agent_message>'
    const parsed = parseAgentMessages(raw, new Set(['t2']))
    expect(parsed).toHaveLength(0)
  })

  it('returns empty when no tags present', () => {
    const parsed = parseAgentMessages('just plain text', new Set(['t1']))
    expect(parsed).toHaveLength(0)
  })
})

describe('inter-agent direct messaging', () => {
  it('routes a message from one task to another', async () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- task one\n- task two')
    const events: TeamEvent[] = []
    const sent: any[] = []
    const { promise } = executePlan({
      runId: 'run-1',
      plan,
      team,
      executeTask: async (task) => {
        if (task.id === plan.tasks[0].id) {
          return 'done <agent_message to="' + plan.tasks[1].id + '">help me with this</agent_message>'
        }
        return 'reviewed'
      },
      signal: createCancellationController().signal,
      onEvent: (e) => events.push(e),
      sharedContext: createSharedContext(),
      onApprovalRequest: async () => ({ approved: true }),
      sendMessage: (msg) => sent.push(msg)
    })
    await promise
    expect(sent).toHaveLength(1)
    expect(sent[0].toTaskId).toBe(plan.tasks[1].id)
    expect(sent[0].content).toBe('help me with this')
    expect(sent[0].fromTaskId).toBe(plan.tasks[0].id)
    expect(events.some((e) => e.type === 'task_message_sent')).toBe(true)
    expect(events.some((e) => e.type === 'task_message_received')).toBe(true)
  })

  it('buffers a message for a task that has not started yet', async () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- task one\n- task two')
    // Make task two depend on task one so it cannot start until task one finishes.
    plan.tasks[1].dependencies = [plan.tasks[0].id]
    const events: TeamEvent[] = []
    const { promise } = executePlan({
      runId: 'run-1',
      plan,
      team,
      executeTask: async (task) => {
        if (task.id === plan.tasks[0].id) {
          return 'output <agent_message to="' + plan.tasks[1].id + '">later please</agent_message>'
        }
        return 'received'
      },
      signal: createCancellationController().signal,
      onEvent: (e) => events.push(e),
      sharedContext: createSharedContext(),
      onApprovalRequest: async () => ({ approved: true })
    })
    await promise
    const received = events.filter((e) => e.type === 'task_message_received') as any
    expect(received).toHaveLength(1)
    expect(received[0].taskId).toBe(plan.tasks[1].id)
    expect(received[0].message.content).toBe('later please')
  })

  it('still completes the run when no messages are sent', async () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- task one\n- task two')
    const events: TeamEvent[] = []
    const { promise } = executePlan({
      runId: 'run-1',
      plan,
      team,
      executeTask: async () => 'plain output',
      signal: createCancellationController().signal,
      onEvent: (e) => events.push(e),
      sharedContext: createSharedContext(),
      onApprovalRequest: async () => ({ approved: true })
    })
    const result = await promise
    expect(result.status).toBe('completed')
    expect(events.some((e) => e.type === 'task_message_sent')).toBe(false)
    expect(events.some((e) => e.type === 'task_message_received')).toBe(false)
  })
})
