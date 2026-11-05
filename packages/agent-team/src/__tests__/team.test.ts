import { describe, it, expect } from 'vitest'

import {
  makeTeam,
  makeLeader,
  makeSpecialist,
  makeModelConfig,
  validateTeam,
  validateSpecialist,
  validateLeader,
  validateModelConfig,
  defaultSystemPrompt,
  defaultToolPermissions
} from '../team'
import { SPECIALIST_ROLES, TOOL_PERMISSIONS } from '../types'

function buildTeamInput() {
  return {
    name: 'Research Squad',
    description: 'A team for research tasks',
    strategy: 'sequential' as const,
    maxConcurrency: 2,
    leader: {
      name: 'Leader',
      modelConfig: makeModelConfig('anthropic', 'claude-sonnet-4-5'),
      systemPrompt: 'You are the leader.'
    },
    specialists: [
      {
        name: 'Coder',
        role: 'coding' as const,
        modelConfig: makeModelConfig('anthropic', 'claude-sonnet-4-5'),
        systemPrompt: defaultSystemPrompt('coding'),
        toolPermissions: defaultToolPermissions('coding'),
        enabled: true
      },
      {
        name: 'Reviewer',
        role: 'reviewer' as const,
        modelConfig: makeModelConfig('anthropic', 'claude-sonnet-4-5'),
        systemPrompt: defaultSystemPrompt('reviewer'),
        toolPermissions: defaultToolPermissions('reviewer'),
        enabled: true
      }
    ]
  }
}

describe('team builders', () => {
  it('makeTeam assigns uuid ids and timestamps', () => {
    const team = makeTeam(buildTeamInput())
    expect(team.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(team.leader.id).not.toBe(team.id)
    expect(team.specialists).toHaveLength(2)
    expect(team.specialists[0].id).not.toBe(team.specialists[1].id)
    expect(team.createdAt).toBe(team.updatedAt)
    expect(team.specialists[0].teamId).toBe(team.id)
    expect(team.leader.teamId).toBe(team.id)
  })

  it('makeSpecialist / makeLeader set shared timestamps', () => {
    const specialist = makeSpecialist('team-1', {
      name: 'X',
      role: 'general',
      modelConfig: makeModelConfig('openai', 'gpt-5'),
      systemPrompt: 'hi',
      toolPermissions: {},
      enabled: true
    })
    expect(specialist.teamId).toBe('team-1')
    expect(specialist.createdAt).toBe(specialist.updatedAt)
  })

  it('makeModelConfig merges overrides last', () => {
    const cfg = makeModelConfig('anthropic', 'claude-sonnet-4-5', { temperature: 0.5, maxTokens: 1024 })
    expect(cfg.providerId).toBe('anthropic')
    expect(cfg.modelId).toBe('claude-sonnet-4-5')
    expect(cfg.temperature).toBe(0.5)
    expect(cfg.maxTokens).toBe(1024)
  })
})

describe('schema validators', () => {
  it('validateTeam accepts a valid team', () => {
    const team = makeTeam(buildTeamInput())
    expect(validateTeam(team)).toStrictEqual(team)
  })

  it('validateTeam rejects empty name', () => {
    const input = buildTeamInput()
    input.name = ''
    expect(() => validateTeam(makeTeam(input))).toThrow()
  })

  it('validateTeam rejects invalid strategy', () => {
    const input = buildTeamInput()
    ;(input as { strategy: string }).strategy = 'bogus'
    expect(() => validateTeam(makeTeam(input))).toThrow()
  })

  it('validateTeam rejects maxConcurrency out of range', () => {
    const input = buildTeamInput()
    input.maxConcurrency = 0
    expect(() => validateTeam(makeTeam(input))).toThrow()
    input.maxConcurrency = 17
    expect(() => validateTeam(makeTeam(input))).toThrow()
  })

  it('validateSpecialist rejects missing role', () => {
    const specialist = makeSpecialist('team-1', {
      name: 'X',
      role: 'bogus' as never,
      modelConfig: makeModelConfig('openai', 'gpt-5'),
      systemPrompt: 'hi',
      toolPermissions: {},
      enabled: true
    })
    expect(() => validateSpecialist(specialist)).toThrow()
  })

  it('validateLeader rejects missing providerId', () => {
    const leader = makeLeader('team-1', {
      name: 'L',
      modelConfig: makeModelConfig('', 'x'),
      systemPrompt: 'hi'
    })
    expect(() => validateLeader(leader)).toThrow()
  })

  it('validateModelConfig rejects empty providerId', () => {
    expect(() => validateModelConfig(makeModelConfig('', 'x'))).toThrow()
  })

  it('validateModelConfig rejects temperature out of range', () => {
    expect(() => validateModelConfig(makeModelConfig('a', 'b', { temperature: 3 }))).toThrow()
    expect(() => validateModelConfig(makeModelConfig('a', 'b', { temperature: -1 }))).toThrow()
  })
})

describe('defaults', () => {
  it('defaultSystemPrompt returns a non-empty prompt for every role', () => {
    for (const role of SPECIALIST_ROLES) {
      const prompt = defaultSystemPrompt(role)
      expect(prompt.length).toBeGreaterThan(0)
    }
  })

  it('defaultToolPermissions returns a valid permission map', () => {
    for (const role of SPECIALIST_ROLES) {
      const perms = defaultToolPermissions(role)
      for (const v of Object.values(perms)) {
        expect(TOOL_PERMISSIONS).toContain(v)
      }
    }
  })
})
