import { describe, it, expect } from 'vitest'

import { buildCapabilities, canInvokeTool, matchScore, rankSpecialists, pickSpecialistByCapability } from '../capabilities'
import { makeTeam, makeModelConfig, defaultToolPermissions } from '../team'
import type { Task, ToolPermissionMap } from '../types'

function buildTeam() {
  return makeTeam({
    name: 'Squad',
    description: '',
    strategy: 'sequential',
    maxConcurrency: 2,
    leader: { name: 'L', modelConfig: makeModelConfig('a', 'b'), systemPrompt: 'x' },
    specialists: [
      { name: 'Coder', role: 'coding', modelConfig: makeModelConfig('a', 'b'), systemPrompt: 'x', toolPermissions: defaultToolPermissions('coding'), enabled: true },
      { name: 'Researcher', role: 'research', modelConfig: makeModelConfig('a', 'b'), systemPrompt: 'x', toolPermissions: defaultToolPermissions('research'), enabled: true }
    ]
  })
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1', teamId: 'tm', parentId: null, title: 'x', description: '', assignedTo: null,
    dependencies: [], status: 'pending', gate: 'none', input: '', output: null, error: null,
    retryCount: 0, maxRetries: 0, createdAt: 0, startedAt: null, completedAt: null, ...over
  }
}

describe('buildCapabilities', () => {
  it('merges role defaults', () => {
    const team = buildTeam()
    const coder = team.specialists.find((s) => s.role === 'coding')!
    const caps = buildCapabilities(coder)
    expect(caps.supportsTools).toBe(true)
    expect(caps.features).toContain('code')
    expect(caps.tools.some((t) => t.name === 'shell.execute')).toBe(true)
  })
  it('applies overrides', () => {
    const team = buildTeam()
    const coder = team.specialists.find((s) => s.role === 'coding')!
    const caps = buildCapabilities(coder, { supportsVision: true, throughputHint: 9 })
    expect(caps.supportsVision).toBe(true)
    expect(caps.throughputHint).toBe(9)
  })
})

describe('canInvokeTool', () => {
  const team = buildTeam()
  const coder = team.specialists.find((s) => s.role === 'coding')!
  const researcher = team.specialists.find((s) => s.role === 'research')!

  it('coding specialist can read files', () => {
    expect(canInvokeTool(coder, 'file.read')).toBe('allow')
  })
  it('researcher can shell execute (wildcard allow)', () => {
    // researcher has '*': 'allow' so everything is allowed
    expect(canInvokeTool(researcher, 'shell.execute')).toBe('allow')
  })
  it('deny overrides allow', () => {
    const denied = { ...coder, toolPermissions: { '*': 'deny' } as ToolPermissionMap }
    expect(canInvokeTool(denied, 'file.read')).toBe('deny')
  })
  it('prompt is distinguishable from allow/deny', () => {
    const prompted = { ...coder, toolPermissions: { '*': 'prompt' } as ToolPermissionMap }
    expect(canInvokeTool(prompted, 'file.read')).toBe('prompt')
  })
  it('an unmapped tool is denied when there is no wildcard allow', () => {
    const scoped = { ...coder, toolPermissions: { 'file.read': 'allow' } as ToolPermissionMap }
    expect(canInvokeTool(scoped, 'does.not.exist')).toBe('deny')
    expect(canInvokeTool(scoped, 'file.read')).toBe('allow')
  })
  it('a wildcard allow covers unmapped tools', () => {
    expect(canInvokeTool(coder, 'does.not.exist')).toBe('allow')
  })
})

describe('matchScore', () => {
  const team = buildTeam()
  const coder = team.specialists.find((s) => s.role === 'coding')!
  const caps = buildCapabilities(coder)

  it('scores coding tasks highly for a coding specialist', () => {
    const score = matchScore(task({ title: 'implement the function' }), coder, caps)
    expect(score).toBeGreaterThan(0.5)
  })
  it('returns neutral when no signal', () => {
    const score = matchScore(task({ title: 'do the thing' }), coder, caps)
    expect(score).toBe(0.5)
  })
})

describe('rankSpecialists', () => {
  it('ranks specialists by capability match', () => {
    const team = buildTeam()
    const cache = new Map()
    const ranked = rankSpecialists(task({ title: 'implement the function' }), team.specialists, cache)
    expect(ranked[0].role).toBe('coding')
  })
  it('excludes disabled specialists', () => {
    const team = buildTeam()
    team.specialists[0].enabled = false
    const cache = new Map()
    const ranked = rankSpecialists(task({ title: 'implement the function' }), team.specialists, cache)
    expect(ranked.every((s) => s.enabled)).toBe(true)
  })
})

describe('pickSpecialistByCapability', () => {
  it('picks the best matching specialist', () => {
    const team = buildTeam()
    const cache = new Map()
    const picked = pickSpecialistByCapability(task({ title: 'implement the function' }), team.specialists, cache)
    expect(picked?.role).toBe('coding')
  })
  it('returns null when no specialists are enabled', () => {
    const team = buildTeam()
    team.specialists.forEach((s) => (s.enabled = false))
    const cache = new Map()
    expect(pickSpecialistByCapability(task({ title: 'x' }), team.specialists, cache)).toBeNull()
  })
})
