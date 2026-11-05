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

function runPlan(
  team: ReturnType<typeof buildTeam>,
  objective: string,
  input: string,
  executeTask: any,
  opts: { maxRetries?: number } = {}
) {
  const plan = buildPlan(team, objective, input)
  const events: TeamEvent[] = []
  const { promise } = executePlan({
    runId: 'run-1',
    plan,
    team,
    executeTask,
    signal: createCancellationController().signal,
    onEvent: (e: TeamEvent) => {
      events.push(e)
    },
    maxRetries: opts.maxRetries,
    sharedContext: createSharedContext(),
    onApprovalRequest: async () => ({ approved: true })
  })
  return { promise, events }
}

describe('executePlan', () => {
  it('runs all tasks and emits lifecycle events', async () => {
    const team = buildTeam()
    const { promise, events } = runPlan(
      team,
      'o',
      '- task one\n- task two',
      async (task: any) => `output:${task.title}`
    )
    const result = await promise
    expect(result.status).toBe('completed')
    expect(result.tasks).toHaveLength(2)
    expect(result.tasks.every((t: any) => t.status === 'completed')).toBe(true)
    expect(events.some((e) => e.type === 'task_started')).toBe(true)
    expect(events.some((e) => e.type === 'task_completed')).toBe(true)
  })

  it('emits task_progress on delta', async () => {
    const team = buildTeam()
    const { promise, events } = runPlan(
      team,
      'o',
      '- task one',
      async (_task: any, _spec: any, _signal: any, onDelta: (d: string) => void) => {
        onDelta('partial')
        return 'done'
      }
    )
    await promise
    expect(events.some((e) => e.type === 'task_progress' && e.delta === 'partial')).toBe(true)
  })

  it('fails a task and retries then fails', async () => {
    const team = buildTeam()
    let calls = 0
    const { promise, events } = runPlan(
      team,
      'o',
      '- boom',
      async () => {
        calls++
        throw new Error('explode')
      },
      { maxRetries: 1 }
    )
    const result = await promise
    expect(result.status).toBe('failed')
    expect(result.tasks[0].status).toBe('failed')
    expect(calls).toBe(2) // initial + 1 retry
    expect(events.some((e) => e.type === 'task_failed' && e.willRetry === true)).toBe(true)
    expect(events.some((e) => e.type === 'task_failed' && e.willRetry === false)).toBe(true)
  })

  it('succeeds on retry', async () => {
    const team = buildTeam()
    let calls = 0
    const { promise } = runPlan(
      team,
      'o',
      '- flaky',
      async () => {
        calls++
        if (calls < 2) throw new Error('first fails')
        return 'recovered'
      },
      { maxRetries: 2 }
    )
    const result = await promise
    expect(result.status).toBe('completed')
    expect(result.tasks[0].status).toBe('completed')
    expect(calls).toBe(2)
  })

  it('respects concurrency limit', async () => {
    const team = makeTeam({
      name: 'Wide',
      description: '',
      strategy: 'parallel',
      maxConcurrency: 2,
      leader: {
        name: 'L',
        modelConfig: makeModelConfig('a', 'b'),
        systemPrompt: 'x'
      },
      specialists: [
        {
          name: 'S',
          role: 'general',
          modelConfig: makeModelConfig('a', 'b'),
          systemPrompt: 'x',
          toolPermissions: {},
          enabled: true
        }
      ]
    })
    let active = 0
    let maxActive = 0
    const { promise } = runPlan(team, 'o', '- a\n- b\n- c\n- d', async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 20))
      active--
      return 'ok'
    })
    await promise
    expect(maxActive).toBeLessThanOrEqual(2)
    expect(maxActive).toBe(2)
  })

  it('cancels on abort signal', async () => {
    const team = buildTeam()
    const controller = createCancellationController()
    const plan = buildPlan(team, 'o', '- slow task')
    const events: TeamEvent[] = []
    const { promise } = executePlan({
      runId: 'run-1',
      plan,
      team,
      executeTask: async () => {
        await new Promise((r) => setTimeout(r, 5000))
        return 'never'
      },
      signal: controller.signal,
      onEvent: (e: TeamEvent) => {
        events.push(e)
      },
      sharedContext: createSharedContext(),
      onApprovalRequest: async () => ({ approved: true })
    })
    setTimeout(() => controller.cancel(), 20)
    const result = await promise
    expect(result.status).toBe('cancelled')
    expect(events.some((e) => e.type === 'run_cancelled')).toBe(true)
  })

  it('pauses when shouldPause returns true with no active tasks', async () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- task one')
    const events: TeamEvent[] = []
    let resolveResume: () => void = () => {}
    const resumePromise = new Promise<void>((r) => {
      resolveResume = r
    })
    let paused = true
    const { promise, step } = executePlan({
      runId: 'run-1',
      plan,
      team,
      executeTask: async () => 'ok',
      signal: createCancellationController().signal,
      onEvent: (e: TeamEvent) => {
        events.push(e)
      },
      shouldPause: () => paused,
      waitForResume: () => resumePromise,
      sharedContext: createSharedContext(),
      onApprovalRequest: async () => ({ approved: true })
    })
    // Let the first tick dispatch and hit the pause point.
    await new Promise((r) => setTimeout(r, 30))
    step()
    await new Promise((r) => setTimeout(r, 30))
    // Nothing completed yet because we paused before dispatch.
    resolveResume()
    paused = false
    step()
    const result = await promise
    expect(result.status).toBe('completed')
  })
})
