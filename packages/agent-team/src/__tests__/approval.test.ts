import { describe, it, expect } from 'vitest'

import { createSharedContext } from '../context'
import { buildPlan } from '../plan'
import { executePlan, createCancellationController } from '../scheduler'
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
      }
    ]
  })
}

describe('shared context', () => {
  it('is empty initially', () => {
    const ctx = createSharedContext()
    expect(ctx.snapshot()).toBe('')
    expect(ctx.entries).toHaveLength(0)
  })

  it('appends non-empty output', () => {
    const ctx = createSharedContext()
    const task = { id: 't1', title: 'Task One', status: 'completed' as const, output: 'result' } as any
    const entry = ctx.append(task, 'some output')
    expect(entry.delta).toBe('some output')
    expect(ctx.snapshot()).toContain('Task One')
    expect(ctx.snapshot()).toContain('some output')
  })

  it('skips empty deltas', () => {
    const ctx = createSharedContext()
    const task = { id: 't1', title: 'T', status: 'completed' as const } as any
    ctx.append(task, '')
    ctx.append(task, '   ')
    expect(ctx.snapshot()).toBe('')
  })
})

describe('approval gating', () => {
  it('blocks task when gate is approval and user rejects', async () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- sensitive task')
    plan.tasks[0].gate = 'approval'
    const events: TeamEvent[] = []
    const { promise } = executePlan({
      runId: 'run-1',
      plan,
      team,
      executeTask: async () => 'should not run',
      signal: createCancellationController().signal,
      onEvent: (e) => events.push(e),
      sharedContext: createSharedContext(),
      onApprovalRequest: async () => ({ approved: false, reason: 'denied' })
    })
    const result = await promise
    expect(result.status).toBe('failed')
    expect(result.tasks[0].status).toBe('failed')
    expect(events.some((e) => e.type === 'task_approval_requested')).toBe(true)
    expect(
      events.some((e) => e.type === 'task_approval_resolved' && !('approved' in e ? (e as any).approved : true))
    ).toBe(true)
  })

  it('allows task when gate is approval and user approves', async () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- approved task')
    plan.tasks[0].gate = 'approval'
    const events: TeamEvent[] = []
    const { promise } = executePlan({
      runId: 'run-1',
      plan,
      team,
      executeTask: async () => 'ok',
      signal: createCancellationController().signal,
      onEvent: (e) => events.push(e),
      sharedContext: createSharedContext(),
      onApprovalRequest: async () => ({ approved: true })
    })
    const result = await promise
    expect(result.status).toBe('completed')
    expect(result.tasks[0].status).toBe('completed')
    expect(events.some((e) => e.type === 'task_approval_requested')).toBe(true)
    const resolved = events.find((e) => e.type === 'task_approval_resolved') as any
    expect(resolved?.approved).toBe(true)
  })

  it('passes through when gate is none', async () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- normal task')
    plan.tasks[0].gate = 'none'
    const events: TeamEvent[] = []
    const { promise } = executePlan({
      runId: 'run-1',
      plan,
      team,
      executeTask: async () => 'ok',
      signal: createCancellationController().signal,
      onEvent: (e) => events.push(e),
      sharedContext: createSharedContext(),
      onApprovalRequest: async () => {
        throw new Error('should not be called')
      }
    })
    const result = await promise
    expect(result.status).toBe('completed')
    expect(events.some((e) => e.type === 'task_approval_requested')).toBe(false)
  })
})

describe('task plan parsing', () => {
  it('detects requires approval marker', () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- write code requires approval')
    expect(plan.tasks[0].gate).toBe('approval')
  })

  it('detects needs review marker', () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- review the changes needs review')
    expect(plan.tasks[0].gate).toBe('review')
  })

  it('defaults to none when no marker', () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- normal task')
    expect(plan.tasks[0].gate).toBe('none')
  })
})
