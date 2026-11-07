import { describe, it, expect } from 'vitest'

import { pickSpecialistByCapability } from '../capabilities'
import { makeTeam, makeModelConfig, defaultToolPermissions } from '../team'
import type { Task } from '../types'

function buildTeam() {
  return makeTeam({
    name: 'Squad',
    description: '',
    strategy: 'sequential',
    maxConcurrency: 2,
    leader: { name: 'L', modelConfig: makeModelConfig('a', 'b'), systemPrompt: 'x' },
    specialists: [
      { name: 'Coder', role: 'coding', modelConfig: makeModelConfig('a', 'b'), systemPrompt: 'x', toolPermissions: defaultToolPermissions('coding'), enabled: true },
      { name: 'Researcher', role: 'research', modelConfig: makeModelConfig('a', 'b'), systemPrompt: 'x', toolPermissions: defaultToolPermissions('research'), enabled: true },
      { name: 'ImageMaker', role: 'image', modelConfig: makeModelConfig('a', 'b'), systemPrompt: 'x', toolPermissions: defaultToolPermissions('image'), enabled: true },
      { name: 'Videographer', role: 'video', modelConfig: makeModelConfig('a', 'b'), systemPrompt: 'x', toolPermissions: defaultToolPermissions('video'), enabled: true },
      { name: 'Analyst', role: 'data-analyst', modelConfig: makeModelConfig('a', 'b'), systemPrompt: 'x', toolPermissions: defaultToolPermissions('data-analyst'), enabled: true },
      { name: 'Reviewer', role: 'reviewer', modelConfig: makeModelConfig('a', 'b'), systemPrompt: 'x', toolPermissions: defaultToolPermissions('reviewer'), enabled: true }
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

describe('capability-based routing across domains', () => {
  it('routes a coding task to the coding specialist', () => {
    const team = buildTeam()
    const picked = pickSpecialistByCapability(task({ title: 'implement the function' }), team.specialists, new Map())
    expect(picked?.role).toBe('coding')
  })
  it('routes a research task to the research specialist', () => {
    const team = buildTeam()
    const picked = pickSpecialistByCapability(task({ title: 'investigate the competitor' }), team.specialists, new Map())
    expect(picked?.role).toBe('research')
  })
  it('routes an image task to the image specialist', () => {
    const team = buildTeam()
    const picked = pickSpecialistByCapability(task({ title: 'illustrate the cover photo' }), team.specialists, new Map())
    expect(picked?.role).toBe('image')
  })
  it('routes a video task to the video specialist', () => {
    const team = buildTeam()
    const picked = pickSpecialistByCapability(task({ title: 'produce the promo footage' }), team.specialists, new Map())
    expect(picked?.role).toBe('video')
  })
  it('routes a data task to the data-analyst specialist', () => {
    const team = buildTeam()
    const picked = pickSpecialistByCapability(task({ title: 'analyze the csv statistics' }), team.specialists, new Map())
    expect(picked?.role).toBe('data-analyst')
  })
  it('routes a review task to the reviewer specialist', () => {
    const team = buildTeam()
    const picked = pickSpecialistByCapability(task({ title: 'audit and verify the deliverable' }), team.specialists, new Map())
    expect(picked?.role).toBe('reviewer')
  })
  it('falls back to the first enabled specialist when nothing matches', () => {
    const team = buildTeam()
    const picked = pickSpecialistByCapability(task({ title: 'do the thing' }), team.specialists, new Map())
    expect(picked).not.toBeNull()
    expect(team.specialists).toContain(picked)
  })
  it('returns null when no specialists are enabled', () => {
    const team = buildTeam()
    team.specialists.forEach((s) => (s.enabled = false))
    expect(pickSpecialistByCapability(task({ title: 'x' }), team.specialists, new Map())).toBeNull()
  })
})