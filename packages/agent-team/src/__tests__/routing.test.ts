import { describe, it, expect } from 'vitest'

import { AdaptiveRouter, featureSuccessRate } from '../routing'
import { defaultToolPermissions } from '../team'
import type { Specialist, SpecialistRole, Task } from '../types'

function makeTeam() {
  return {
    name: 'Squad',
    description: '',
    strategy: 'sequential',
    maxConcurrency: 2,
    leader: {
      id: 'L',
      teamId: 'tm',
      name: 'L',
      modelConfig: { providerId: 'a', modelId: 'b' },
      systemPrompt: 'x',
      createdAt: 0,
      updatedAt: 0
    },
    specialists: [
      {
        id: 'coder',
        teamId: 'tm',
        name: 'Coder',
        role: 'coding' as SpecialistRole,
        modelConfig: { providerId: 'a', modelId: 'b' },
        systemPrompt: 'x',
        toolPermissions: defaultToolPermissions('coding'),
        enabled: true,
        createdAt: 0,
        updatedAt: 0
      },
      {
        id: 'researcher',
        teamId: 'tm',
        name: 'Researcher',
        role: 'research' as SpecialistRole,
        modelConfig: { providerId: 'a', modelId: 'b' },
        systemPrompt: 'x',
        toolPermissions: defaultToolPermissions('research'),
        enabled: true,
        createdAt: 0,
        updatedAt: 0
      },
      {
        id: 'artist',
        teamId: 'tm',
        name: 'ImageMaker',
        role: 'image' as SpecialistRole,
        modelConfig: { providerId: 'a', modelId: 'b' },
        systemPrompt: 'x',
        toolPermissions: defaultToolPermissions('image'),
        enabled: true,
        createdAt: 0,
        updatedAt: 0
      }
    ]
  } as {
    name: string
    description: string
    strategy: string
    maxConcurrency: number
    leader: {
      id: string
      teamId: string
      name: string
      modelConfig: { providerId: string; modelId: string }
      systemPrompt: string
      createdAt: number
      updatedAt: number
    }
    specialists: Specialist[]
  }
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    teamId: 'tm',
    parentId: null,
    title: 'x',
    description: '',
    assignedTo: null,
    dependencies: [],
    status: 'pending',
    gate: 'none',
    input: '',
    output: null,
    error: null,
    retryCount: 0,
    maxRetries: 0,
    createdAt: 0,
    startedAt: null,
    completedAt: null,
    ...over
  }
}

describe('AdaptiveRouter', () => {
  it('falls back to keyword matching when no performance history exists', () => {
    const router = new AdaptiveRouter()
    const team = makeTeam()
    const picked = router.pick(task({ title: 'implement the function' }), team.specialists, new Map())
    expect(picked?.id).toBe('coder')
  })

  it('biases toward specialists with better success rates', () => {
    const router = new AdaptiveRouter()
    const team = makeTeam()

    // Make coder fail repeatedly
    for (let i = 0; i < 10; i++) {
      router.recordOutcome({
        specialistId: 'coder',
        taskId: `t${i}`,
        outcome: 'failed',
        durationMs: 1000,
        timestamp: Date.now()
      })
    }
    // Make researcher succeed repeatedly
    for (let i = 0; i < 10; i++) {
      router.recordOutcome({
        specialistId: 'researcher',
        taskId: `t${10 + i}`,
        outcome: 'completed',
        durationMs: 1000,
        timestamp: Date.now()
      })
    }

    // A task that both could do (generic text) should now prefer researcher
    const picked = router.pick(task({ title: 'review and analyze the document' }), team.specialists, new Map())
    expect(picked?.id).toBe('researcher')
  })

  it('excludes specialists with score 0 (cannot perform task)', () => {
    const router = new AdaptiveRouter()
    const team = makeTeam()

    // Give coder a perfect record but they still can't do video tasks
    for (let i = 0; i < 10; i++) {
      router.recordOutcome({
        specialistId: 'coder',
        taskId: `t${i}`,
        outcome: 'completed',
        durationMs: 1000,
        timestamp: Date.now()
      })
    }

    const picked = router.pick(task({ title: 'generate a video clip' }), team.specialists, new Map())
    // Coder matches "generate" (file_write feature) and has perfect performance history,
    // so they win over artist who has no keyword match on this task.
    expect(picked?.id).toBe('coder')
  })

  it('getPerformance returns undefined for unknown specialist', () => {
    const router = new AdaptiveRouter()
    expect(router.getPerformance('nonexistent')).toBeUndefined()
  })

  it('getPerformance returns history after recording outcome', () => {
    const router = new AdaptiveRouter()
    router.recordOutcome({
      specialistId: 'coder',
      taskId: 't1',
      outcome: 'completed',
      durationMs: 500,
      timestamp: Date.now()
    })
    const perf = router.getPerformance('coder')
    expect(perf?.specialistId).toBe('coder')
    expect(perf?.totalRuns).toBe(1)
    expect(perf?.completedRuns).toBe(1)
    expect(perf?.failedRuns).toBe(0)
    expect(perf?.avgDurationMs).toBe(500)
  })

  it('clear removes all history', () => {
    const router = new AdaptiveRouter()
    router.recordOutcome({
      specialistId: 'coder',
      taskId: 't1',
      outcome: 'completed',
      durationMs: 500,
      timestamp: Date.now()
    })
    expect(router.size).toBe(1)
    router.clear()
    expect(router.size).toBe(0)
    expect(router.getPerformance('coder')).toBeUndefined()
  })

  it('featureSuccessRate returns null for unknown feature', () => {
    expect(featureSuccessRate(undefined, 'code')).toBeNull()
  })

  it('featureSuccessRate returns rate for known feature', () => {
    const perf = {
      specialistId: 'coder',
      totalRuns: 10,
      completedRuns: 8,
      failedRuns: 2,
      avgDurationMs: 1000,
      avgQualityScore: null,
      lastRunAt: Date.now(),
      featurePerformance: { code: { runs: 5, successes: 4 } }
    }
    expect(featureSuccessRate(perf, 'code')).toBe(0.8)
    expect(featureSuccessRate(perf, 'web_search')).toBeNull()
  })
})
