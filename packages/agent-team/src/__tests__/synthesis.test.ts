import { describe, it, expect } from 'vitest'

import { buildPlan } from '../plan'
import {
  buildSynthesisPrompt,
  extractUsedTaskIds,
  makeSynthesisEvent,
  makeRunCompletedEvent,
  makeRunFailedEvent
} from '../synthesis'
import { makeTeam, makeModelConfig, defaultSystemPrompt, defaultToolPermissions } from '../team'
import type { Task } from '../types'

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

describe('buildSynthesisPrompt', () => {
  it('includes objective and completed outputs', () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'summarize findings', '- task one')
    plan.tasks[0].output = 'the findings'
    plan.tasks[0].status = 'completed'
    const prompt = buildSynthesisPrompt({ runId: 'r', objective: 'summarize findings', tasks: plan.tasks })
    expect(prompt).toContain('Objective: summarize findings')
    expect(prompt).toContain('=== COMPLETED TASK OUTPUTS ===')
    expect(prompt).toContain('the findings')
  })

  it('includes failed task errors', () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- boom')
    plan.tasks[0].status = 'failed'
    plan.tasks[0].error = 'explode'
    const prompt = buildSynthesisPrompt({ runId: 'r', objective: 'o', tasks: plan.tasks })
    expect(prompt).toContain('=== FAILED TASKS ===')
    expect(prompt).toContain('explode')
  })

  it('includes cancelled task list', () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- task one')
    plan.tasks[0].status = 'cancelled'
    const prompt = buildSynthesisPrompt({ runId: 'r', objective: 'o', tasks: plan.tasks })
    expect(prompt).toContain('=== CANCELLED TASKS ===')
    expect(prompt).toContain('task one')
  })

  it('appends extra leader prompt', () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- task one')
    const prompt = buildSynthesisPrompt({
      runId: 'r',
      objective: 'o',
      tasks: plan.tasks,
      leaderPrompt: 'be concise'
    })
    expect(prompt).toContain('=== ADDITIONAL CONTEXT ===')
    expect(prompt).toContain('be concise')
  })
})

describe('extractUsedTaskIds', () => {
  it('returns ids whose output appears in the result', () => {
    const tasks: Task[] = [
      {
        id: 'a',
        teamId: 't',
        parentId: null,
        title: 'a',
        description: '',
        assignedTo: null,
        dependencies: [],
        status: 'completed',
        gate: 'none',
        input: '',
        output: 'hello world',
        error: null,
        retryCount: 0,
        maxRetries: 0,
        createdAt: 0,
        startedAt: null,
        completedAt: null
      },
      {
        id: 'b',
        teamId: 't',
        parentId: null,
        title: 'b',
        description: '',
        assignedTo: null,
        dependencies: [],
        status: 'completed',
        gate: 'none',
        input: '',
        output: 'goodbye',
        error: null,
        retryCount: 0,
        maxRetries: 0,
        createdAt: 0,
        startedAt: null,
        completedAt: null
      }
    ]
    const used = extractUsedTaskIds('the answer is hello world and goodbye', tasks)
    expect(used).toContain('a')
    expect(used).toContain('b')
  })

  it('returns empty when no output matches', () => {
    const tasks: Task[] = [
      {
        id: 'a',
        teamId: 't',
        parentId: null,
        title: 'a',
        description: '',
        assignedTo: null,
        dependencies: [],
        status: 'completed',
        gate: 'none',
        input: '',
        output: 'zzz',
        error: null,
        retryCount: 0,
        maxRetries: 0,
        createdAt: 0,
        startedAt: null,
        completedAt: null
      }
    ]
    expect(extractUsedTaskIds('nothing here', tasks)).toEqual([])
  })
})

describe('event factories', () => {
  it('makeSynthesisEvent carries the result', () => {
    const event = makeSynthesisEvent('r-1', { result: 'final', usedTaskIds: ['a'] })
    expect(event).toEqual({ type: 'synthesis_completed', runId: 'r-1', result: 'final' })
  })

  it('makeRunCompletedEvent falls back when result is null', () => {
    const event = makeRunCompletedEvent('r-1', {
      runId: 'r-1',
      status: 'completed',
      result: null,
      error: null,
      tasks: []
    })
    expect(event).toEqual({ type: 'run_completed', runId: 'r-1', result: '(no result)' })
  })

  it('makeRunFailedEvent carries the error', () => {
    const event = makeRunFailedEvent('r-1', 'boom')
    expect(event).toEqual({ type: 'run_failed', runId: 'r-1', error: 'boom' })
  })
})
