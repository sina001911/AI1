import { streamText } from 'ai'

import type { Specialist, Task } from '@cherrystudio/agent-team/types'
import type { SharedContext } from '@cherrystudio/agent-team/types'
import { createExecutor } from '@cherrystudio/ai-core'
import { resolveEffectiveEndpoint } from '@main/ai/provider/endpoint'
import { resolveSdkConfig } from '@main/ai/provider/sdkConfig'
import { modelService } from '@main/data/services/ModelService'
import { providerService } from '@main/data/services/ProviderService'
import { isUniqueModelId, parseUniqueModelId } from '@shared/data/types/model'
import { resolveSpecialistTools, type ToolApprovalRequest } from '@main/ai/agentTeam/SpecialistTools'
import { loggerService } from '@logger'

const logger = loggerService.withContext('SpecialistExecutor')

/**
 * Execute a single specialist task through the configured provider model.
 *
 * The specialist's system prompt and task input are sent verbatim; the model
 * streams text deltas back to `onDelta` so the UI can show live progress.
 *
 * Tool access is gated by the specialist's `toolPermissions` map: the host
 * resolves the process-wide tool catalog down to what this specialist may use
 * (`allow` exposed, `deny` dropped, `prompt` wrapped behind human approval) and
 * hands the resulting `ToolSet` to `streamText`. The orchestration package owns
 * no tool knowledge — it only routes the host's resolved set in.
 *
 * The shared context snapshot is appended to the system prompt when non-empty,
 * so a specialist sees what earlier specialists produced in the same run.
 */
export async function executeSpecialistTask(
  task: Task,
  specialist: Specialist,
  signal: AbortSignal,
  onDelta: (delta: string) => void,
  sharedContext: SharedContext,
  requestApproval?: ToolApprovalRequest
): Promise<string> {
  const modelIdRaw = `${specialist.modelConfig.providerId}::${specialist.modelConfig.modelId}`

  if (!isUniqueModelId(modelIdRaw)) {
    throw new Error(`Specialist ${specialist.name} has an invalid model id: ${modelIdRaw}`)
  }

  const { providerId, modelId } = parseUniqueModelId(modelIdRaw)

  let provider
  let model
  try {
    provider = providerService.getByProviderId(providerId)
    model = modelService.getByKey(providerId, modelId)
  } catch (error) {
    throw new Error(`Specialist ${specialist.name} provider/model lookup failed: ${(error as Error).message}`)
  }

  const { sdkConfig } = await resolveSdkConfig(provider, model, resolveEffectiveEndpoint(provider, model))
  const executor = await createExecutor(
    sdkConfig.providerId as Parameters<typeof createExecutor>[0],
    sdkConfig.providerSettings as Parameters<typeof createExecutor>[1]
  )
  const languageModel = await executor.languageModel(sdkConfig.modelId)

  const shared = sharedContext.snapshot()
  const system = [
    specialist.systemPrompt || `You are a ${specialist.role} specialist.`,
    shared ? `=== SHARED CONTEXT (from earlier specialists in this run) ===\n${shared}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')

  const { tools, names, promptNames } = resolveSpecialistTools(specialist, requestApproval)
  if (names.length > 0) {
    logger.info(`Specialist ${specialist.name} granted ${names.length} tool(s): ${names.join(', ')}`)
  }
  if (promptNames.length > 0) {
    logger.info(`Specialist ${specialist.name} granted ${promptNames.length} approval-gated tool(s): ${promptNames.join(', ')}`)
  }

  const result = streamText({
    model: languageModel,
    system,
    prompt: task.input || task.description,
    abortSignal: signal,
    temperature: specialist.modelConfig.temperature,
    maxOutputTokens: specialist.modelConfig.maxTokens,
    tools: names.length > 0 || promptNames.length > 0 ? tools : undefined
  })

  let text = ''
  for await (const delta of result.textStream) {
    if (signal.aborted) throw new Error('Specialist execution cancelled')
    text += delta
    onDelta(delta)
  }

  // `streamText` may finish without emitting the final full text through the
  // stream on some providers; fall back to the aggregated result.
  if (!text) {
    text = await result.text
  }
  return text
}
