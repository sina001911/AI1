import { describe, it, expect } from 'vitest'

import { orchestrate, startOrchestrate, createRunController } from '../execution'
import { buildPlan } from '../plan'
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

function signalAwareSlow(): any {
  return async (_task: any, _spec: any, signal: AbortSignal) =>
    new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => resolve('never'), 5000)
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          reject(new Error('aborted'))
        },
        { once: true }
      )
    })
}

describe('orchestrate', () => {
  it('runs a plan end-to-end with synthesis', async () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'summarize', '- task one\n- task two')
    const events: TeamEvent[] = []
    const result = await orchestrate({
      runId: 'run-1',
      plan,
      team,
      executeTask: async (task) => `out:${task.title}`,
      synthesize: async ({ tasks }) => `synthesis of ${tasks.filter((t) => t.status === 'completed').length} tasks`,
      onEvent: (e) => {
        events.push(e)
      }
    })
    expect(result.status).toBe('completed')
    expect(result.result).toContain('synthesis of 2')
    expect(events.some((e) => e.type === 'synthesis_completed')).toBe(true)
    expect(events.some((e) => e.type === 'run_completed')).toBe(true)
  })

  it('emits run_failed when synthesis throws', async () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- task one')
    const events: TeamEvent[] = []
    const result = await orchestrate({
      runId: 'run-1',
      plan,
      team,
      executeTask: async () => 'ok',
      synthesize: async () => {
        throw new Error('synthesis broke')
      },
      onEvent: (e) => {
        events.push(e)
      }
    })
    expect(result.status).toBe('failed')
    expect(result.error).toBe('synthesis broke')
    expect(events.some((e) => e.type === 'run_failed')).toBe(true)
  })

  it('emits run_cancelled when signal aborts mid-run', async () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- slow task')
    const events: TeamEvent[] = []
    const controller = createRunController()
    setTimeout(() => controller.cancel(), 20)
    const result = await orchestrate({
      runId: 'run-1',
      plan,
      team,
      executeTask: signalAwareSlow(),
      synthesize: async () => 'synth',
      signal: controller.signal,
      cancel: controller.cancel,
      onEvent: (e) => {
        events.push(e)
      }
    })
    expect(result.status).toBe('cancelled')
    expect(events.some((e) => e.type === 'run_cancelled')).toBe(true)
  })

  it('startOrchestrate returns a handle with step', async () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- task one')
    const events: TeamEvent[] = []
    let resolveResume: () => void = () => {}
    const resumePromise = new Promise<void>((r) => {
      resolveResume = r
    })
    let paused = true
    const handle = startOrchestrate({
      runId: 'run-1',
      plan,
      team,
      executeTask: async () => 'ok',
      synthesize: async () => 'synth',
      shouldPause: () => paused,
      waitForResume: () => resumePromise,
      onEvent: (e) => {
        events.push(e)
      }
    })
    // Let the first tick register the pause waiter.
    await new Promise((r) => setTimeout(r, 30))
    // Resume, then un-pause, then step the dispatch loop.
    resolveResume()
    paused = false
    handle.step()
    await new Promise((r) => setTimeout(r, 50))
    const result = await handle.promise
    expect(result.status).toBe('completed')
  })
})
