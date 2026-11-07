import { ToolRegistry } from '@main/ai/tools/adapters/aiSdk/registry'
import { describe, expect, it, vi } from 'vitest'

import { resolveSpecialistTools } from '@main/ai/agentTeam/SpecialistTools'

function makeSpecialist(permissions: Record<string, 'allow' | 'deny' | 'prompt'> = {}) {
  return {
    id: 'spec-1',
    teamId: 'team-1',
    name: 'Coder',
    role: 'coding' as const,
    modelConfig: { providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
    systemPrompt: 'You are a coding specialist.',
    toolPermissions: permissions,
    enabled: true,
    createdAt: 0,
    updatedAt: 0
  }
}

function register(reg: ToolRegistry, name: string) {
  reg.register({
    name,
    namespace: 'web',
    description: `Search the web for ${name}`,
    defer: 'never',
    tool: {
      description: name,
      execute: vi.fn(async () => ({ ok: true }))
    }
  })
}

describe('resolveSpecialistTools', () => {
  it('exposes an `allow`ed tool in the model ToolSet', () => {
    const reg = new ToolRegistry()
    register(reg, 'web_search')
    const { tools, names } = resolveSpecialistTools(makeSpecialist({ web_search: 'allow' }), undefined, reg)
    expect(names).toEqual(['web_search'])
    expect(Object.keys(tools)).toEqual(['web_search'])
  })

  it('drops a `deny`ed tool so the model never sees it', () => {
    const reg = new ToolRegistry()
    register(reg, 'web_search')
    const { tools, names } = resolveSpecialistTools(makeSpecialist({ web_search: 'deny' }), undefined, reg)
    expect(names).toEqual([])
    expect(Object.keys(tools)).toEqual([])
  })

  it('exposes a `prompt` tool only when an approval callback is wired', () => {
    const reg = new ToolRegistry()
    register(reg, 'web_search')
    const { tools, names, promptNames } = resolveSpecialistTools(
      makeSpecialist({ web_search: 'prompt' }),
      undefined,
      reg
    )
    expect(names).toEqual([])
    expect(promptNames).toEqual([])
    expect(Object.keys(tools)).toEqual([])
  })

  it('gates a `prompt` tool behind the approval callback', async () => {
    const reg = new ToolRegistry()
    register(reg, 'web_search')
    const approved = vi.fn(async () => true)
    const { tools, promptNames } = resolveSpecialistTools(
      makeSpecialist({ web_search: 'prompt' }),
      approved,
      reg
    )
    expect(promptNames).toEqual(['web_search'])
    expect(Object.keys(tools)).toEqual(['web_search'])
    await (tools.web_search as any).execute({ q: 'x' }, {})
    expect(approved).toHaveBeenCalledWith({ toolName: 'web_search', args: { q: 'x' }, specialistId: 'spec-1' })
  })

  it('rejects a `prompt` invocation when the human declines', async () => {
    const reg = new ToolRegistry()
    register(reg, 'web_search')
    const { tools } = resolveSpecialistTools(
      makeSpecialist({ web_search: 'prompt' }),
      async () => false,
      reg
    )
    await expect((tools.web_search as any).execute({ q: 'x' }, {})).rejects.toThrow(
      /rejected by human approval/
    )
  })

  it('denies every tool when the specialist has no matching permission', () => {
    const reg = new ToolRegistry()
    register(reg, 'web_search')
    register(reg, 'fs_read')
    const { tools, names } = resolveSpecialistTools(makeSpecialist(), undefined, reg)
    expect(names).toEqual([])
    expect(Object.keys(tools)).toEqual([])
  })
})