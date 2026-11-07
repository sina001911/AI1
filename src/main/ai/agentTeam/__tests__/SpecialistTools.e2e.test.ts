import { describe, expect, it, vi } from 'vitest'

import { resolveSpecialistTools } from '@main/ai/agentTeam/SpecialistTools'
import { registry } from '@main/ai/tools/adapters/aiSdk/registry'
import type { Specialist } from '@cherrystudio/agent-team/types'

/**
 * End-to-end assertion through the host's real tool registry singleton: a
 * specialist whose permissions grant `web_search` receives it in the resolved
 * ToolSet, while one that denies it receives an empty set. This is the
 * contract the SpecialistExecutor feeds into `streamText`, so it is what
 * actually reaches the model.
 *
 * The real builtin catalog is populated lazily at request time, so the test
 * registers its own stub entries into the singleton and removes them after —
 * exercising the same `registry` + `resolveSpecialistTools` +
 * `wrapWithApproval` path production uses.
 */
describe('resolveSpecialistTools (e2e against the real registry)', () => {
  const base: Omit<Specialist, 'id' | 'toolPermissions'> = {
    teamId: 'team-1',
    name: 'Specialist',
    role: 'general',
    modelConfig: { providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
    systemPrompt: 'x',
    enabled: true,
    createdAt: 0,
    updatedAt: 0
  }

  function registerStub(name: string, execute = vi.fn(async () => 'ok')) {
    registry.register({
      name,
      namespace: 'test',
      description: `stub ${name}`,
      defer: 'never',
      tool: { description: name, execute } as never
    })
    return execute
  }

  function specialist(id: string, permissions: Specialist['toolPermissions']): Specialist {
    return { ...base, id, toolPermissions: permissions }
  }

  it('exposes only tools the specialist is allowed to invoke', () => {
    const web = registerStub('web_search')
    const { tools, names } = resolveSpecialistTools(specialist('s-allow', { web_search: 'allow', '*': 'deny' }))
    expect(names).toEqual(['web_search'])
    expect(Object.keys(tools)).toEqual(['web_search'])
    expect(tools.web_search).toBeDefined()
    expect((tools.web_search as any).execute).toBe(web) // the raw tool, unwrapped
    registry.deregister('web_search')
  })

  it('drops a denied tool entirely', () => {
    registerStub('web_search')
    const { tools, names, promptNames } = resolveSpecialistTools(specialist('s-deny', { '*': 'deny' }))
    expect(names).toHaveLength(0)
    expect(promptNames).toHaveLength(0)
    expect(Object.keys(tools)).toHaveLength(0)
    registry.deregister('web_search')
  })

  it('gates prompt tools behind an approval callback', async () => {
    registerStub('web_search')
    const approvals: Array<{ toolName: string; args: unknown; specialistId: string }> = []
    const { names, promptNames, tools } = resolveSpecialistTools(
      specialist('s-prompt', { '*': 'prompt' }),
      (request) => {
        approvals.push(request)
        return true
      }
    )
    expect(promptNames).toEqual(['web_search'])
    expect(names).toHaveLength(0)
    expect(Object.keys(tools)).toEqual(['web_search'])
    // The approval request is fired at invocation time, not at resolve time —
    // the model still discovers the tool, it just cannot run it unapproved.
    await (tools.web_search as any).execute({ q: 'x' }, {})
    expect(approvals).toHaveLength(1)
    expect(approvals[0]).toEqual({ toolName: 'web_search', args: { q: 'x' }, specialistId: 's-prompt' })
    registry.deregister('web_search')
  })

  it('excludes prompt tools when no approval channel is wired', () => {
    registerStub('web_search')
    const { tools, promptNames } = resolveSpecialistTools(specialist('s-prompt-none', { '*': 'prompt' }))
    expect(promptNames).toHaveLength(0)
    expect(Object.keys(tools)).toHaveLength(0)
    registry.deregister('web_search')
  })

  it('declining an approval throws so the tool never runs', async () => {
    registerStub('web_search')
    const { tools } = resolveSpecialistTools(specialist('s-decline', { '*': 'prompt' }), () => false)
    expect(tools.web_search).toBeDefined()
    await expect((tools.web_search as any).execute({ q: 'x' }, {})).rejects.toThrow(
      /rejected by human approval/
    )
    registry.deregister('web_search')
  })

  it('approving an approval lets the wrapped tool delegate to the real tool', async () => {
    const execute = vi.fn(async () => 'delegated')
    registerStub('__test_specialist_tool__', execute)
    const { tools } = resolveSpecialistTools(specialist('s-approve', { '*': 'prompt' }), () => true)
    const wrapped = tools['__test_specialist_tool__']
    expect(wrapped).toBeDefined()
    const out = await (wrapped as any).execute({ q: 'x' }, {})
    expect(out).toBe('delegated')
    expect(execute).toHaveBeenCalledWith({ q: 'x' }, {})
    registry.deregister('__test_specialist_tool__')
  })
})