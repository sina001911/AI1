import { describe, it, expect } from 'vitest'

import { buildPlan, assignTasks, validatePlan, topologicalOrder } from '../plan'
import { makeTeam, makeModelConfig, defaultSystemPrompt, defaultToolPermissions } from '../team'

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

describe('buildPlan', () => {
  it('parses a plain newline list into tasks', () => {
    const plan = buildPlan(buildTeam(), 'do thing', '- task one\n- task two')
    expect(plan.tasks).toHaveLength(2)
    expect(plan.tasks[0].title).toBe('task one')
    expect(plan.tasks[1].title).toBe('task two')
    expect(plan.tasks[0].parentId).toBeNull()
    expect(plan.tasks[0].dependencies).toEqual([])
    expect(plan.objective).toBe('do thing')
    expect(plan.strategy).toBe('sequential')
  })

  it('strips leading bullets and numbers', () => {
    const plan = buildPlan(buildTeam(), 'o', '1) first\n* second')
    expect(plan.tasks[0].title).toBe('first')
    expect(plan.tasks[1].title).toBe('second')
  })

  it('truncates titles over 120 chars', () => {
    const long = 'x'.repeat(300)
    const plan = buildPlan(buildTeam(), 'o', `- ${long}`)
    expect(plan.tasks[0].title).toHaveLength(120)
  })

  it('resolves dependencies by title reference', () => {
    const plan = buildPlan(buildTeam(), 'o', '- write code\n- review code after write code')
    const second = plan.tasks[1]
    expect(second.dependencies).toEqual([plan.tasks[0].id])
  })

  it('ignores dependencies on unknown titles', () => {
    const plan = buildPlan(buildTeam(), 'o', '- write code\n- review ghost')
    expect(plan.tasks[1].dependencies).toEqual([])
  })

  it('returns empty plan for blank input', () => {
    const plan = buildPlan(buildTeam(), 'o', '   \n\n  ')
    expect(plan.tasks).toHaveLength(0)
  })
})

describe('assignTasks', () => {
  it('assigns every task to an enabled specialist', () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- write code\n- review code')
    const assigned = assignTasks(plan, team)
    for (const t of assigned.tasks) {
      expect(t.assignedTo).toBeTruthy()
      expect(team.specialists.some((s) => s.id === t.assignedTo)).toBe(true)
    }
  })

  it('routes coding tasks to the coding specialist', () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- implement the function')
    const assigned = assignTasks(plan, team)
    const coder = team.specialists.find((s) => s.role === 'coding')!
    expect(assigned.tasks[0].assignedTo).toBe(coder.id)
  })

  it('routes a review task to the reviewer specialist', () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- review the architecture')
    const assigned = assignTasks(plan, team)
    const reviewer = team.specialists.find((s) => s.role === 'reviewer')!
    expect(assigned.tasks[0].assignedTo).toBe(reviewer.id)
  })

  it('throws when no specialists are enabled', () => {
    const team = makeTeam({
      name: 'Empty',
      description: '',
      strategy: 'sequential',
      maxConcurrency: 1,
      leader: {
        name: 'L',
        modelConfig: makeModelConfig('a', 'b'),
        systemPrompt: 'x'
      },
      specialists: [
        {
          name: 'X',
          role: 'general',
          modelConfig: makeModelConfig('a', 'b'),
          systemPrompt: 'x',
          toolPermissions: {},
          enabled: false
        }
      ]
    })
    expect(() => buildPlan(team, 'o', '- task')).toThrow()
  })
})

describe('validatePlan', () => {
  it('returns no errors for a valid plan', () => {
    const team = buildTeam()
    const plan = assignTasks(buildPlan(team, 'o', '- write code'), team)
    expect(validatePlan(plan, team)).toEqual([])
  })

  it('errors on empty objective', () => {
    const team = buildTeam()
    const plan = assignTasks(buildPlan(team, '', '- write code'), team)
    expect(validatePlan(plan, team).some((e) => e.includes('Objective'))).toBe(true)
  })

  it('errors on a plan with no tasks', () => {
    const team = buildTeam()
    const plan = assignTasks(buildPlan(team, 'o', ''), team)
    expect(validatePlan(plan, team).some((e) => e.includes('at least one task'))).toBe(true)
  })

  it('errors on unknown dependency', () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- write code')
    plan.tasks[0].dependencies = ['does-not-exist']
    const errors = validatePlan(plan, team)
    expect(errors.some((e) => e.includes('unknown task'))).toBe(true)
  })

  it('errors on assignment to unknown specialist', () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- write code')
    plan.tasks[0].assignedTo = 'ghost-specialist'
    expect(validatePlan(plan, team).some((e) => e.includes('unknown specialist'))).toBe(true)
  })
})

describe('topologicalOrder', () => {
  it('returns tasks in dependency order', () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- write code\n- review code')
    const order = topologicalOrder(plan.tasks)
    expect(order).toHaveLength(2)
    expect(order[0].title).toBe('write code')
    expect(order[1].title).toBe('review code')
  })

  it('returns original order when no dependencies', () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- a\n- b\n- c')
    const order = topologicalOrder(plan.tasks)
    expect(order.map((t) => t.title)).toEqual(['a', 'b', 'c'])
  })

  it('is stable for independent tasks', () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- a\n- b')
    expect(topologicalOrder(plan.tasks).map((t) => t.title)).toEqual(['a', 'b'])
  })
})
