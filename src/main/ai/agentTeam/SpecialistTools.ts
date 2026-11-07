import type { Tool, ToolSet } from 'ai'

import { canInvokeTool } from '@cherrystudio/agent-team/capabilities'
import type { Specialist } from '@cherrystudio/agent-team/types'
import { loggerService } from '@logger'
import { type ToolRegistry, registry } from '@main/ai/tools/adapters/aiSdk/registry'

const logger = loggerService.withContext('SpecialistTools')

/** The catalog `resolveSpecialistTools` gates against by default. */
const defaultRegistry = registry

/**
 * A specialist's `toolPermissions` map gates which process-wide tools the
 * specialist may hand to its model. Three states:
 *   allow  — the tool is exposed to the model and may run freely.
 *   deny   — the tool is never exposed, even if the model asks for it.
 *   prompt  — the tool is exposed, but each invocation must be approved by a
 *             human (or another specialist acting as gate) before it runs.
 *
 * This is the single host-side enforcement point: the orchestration package
 * stays domain-independent and never touches the tool catalog itself.
 */

/** Callback the host wires in to approve a `prompt` tool invocation. */
export interface ToolApprovalRequest {
  (input: { toolName: string; args: unknown; specialistId: string }): Promise<boolean>
}

/** Result of resolving a specialist's tool set. */
export interface SpecialistToolSet {
  /** Tools handed to `streamText`. Empty when the specialist is denied everything. */
  tools: ToolSet
  /** Wire-names the model can see and call. */
  names: string[]
  /** Wire-names exposed only under human approval. */
  promptNames: string[]
}

/**
 * Wrap a tool's `execute` so that each invocation blocks on human approval.
 * The wrapped tool keeps its schema/description so the model still discovers
 * it; only the side-effecting call is gated.
 */
function wrapWithApproval(
  tool: Tool,
  toolName: string,
  specialistId: string,
  requestApproval: ToolApprovalRequest
): Tool {
  const original = tool.execute
  if (!original) return tool
  return {
    ...tool,
    execute: async (args: unknown, opts: unknown) => {
      const approved = await requestApproval({ toolName, args, specialistId })
      if (!approved) {
        throw new Error(`Tool '${toolName}' invocation rejected by human approval`)
      }
      return (original as any)(args, opts)
    }
  }
}

/**
 * Resolve the process-wide tool catalog down to what one specialist may use.
 * Tools the specialist is `deny`d from are dropped before the model ever sees
 * them; `prompt` tools are wrapped so each call awaits approval.
 *
 * `registry` defaults to the process-wide singleton so production callers stay
 * one-arg; tests pass a fresh registry to assert permission gating in isolation.
 */
export function resolveSpecialistTools(
  specialist: Specialist,
  requestApproval?: ToolApprovalRequest,
  registry: ToolRegistry = defaultRegistry
): SpecialistToolSet {
  const tools: ToolSet = {}
  const names: string[] = []
  const promptNames: string[] = []

  for (const entry of registry.getAll()) {
    const permission = canInvokeTool(specialist, entry.name)
    if (permission === 'deny') continue

    if (permission === 'prompt') {
      if (!requestApproval) {
        // No approval channel is wired for this run, so a `prompt` tool must
        // not be handed to the model — it would run unapproved.
        logger.warn(
          `Specialist ${specialist.name} requested tool '${entry.name}' under 'prompt' but no approval callback is wired; excluding it`
        )
        continue
      }
      promptNames.push(entry.name)
      tools[entry.name] = wrapWithApproval(entry.tool, entry.name, specialist.id, requestApproval)
      continue
    }

    // `allow` (or an unknown permission treated as deny by `canInvokeTool`).
    names.push(entry.name)
    tools[entry.name] = entry.tool
  }

  return { tools, names, promptNames }
}