import { generateText } from 'ai'

import { createExecutor } from '@cherrystudio/ai-core'
import { resolveEffectiveEndpoint } from '@main/ai/provider/endpoint'
import { resolveSdkConfig } from '@main/ai/provider/sdkConfig'
import { modelService } from '@main/data/services/ModelService'
import { providerService } from '@main/data/services/ProviderService'
import { isUniqueModelId, parseUniqueModelId } from '@shared/data/types/model'

export interface LeaderModelConfig {
  providerId: string
  modelId: string
  temperature?: number
  maxTokens?: number
  systemPrompt: string
}

/**
 * Resolve the Leader's (provider, model) pair and issue a single `generateText`
 * call. Used by both objective decomposition and result synthesis so the two
 * Leader calls share the exact same model-resolution path.
 */
export async function callLeaderText(config: LeaderModelConfig, prompt: string): Promise<string> {
  const modelIdRaw = `${config.providerId}::${config.modelId}`
  if (!isUniqueModelId(modelIdRaw)) {
    throw new Error(`Leader model id is not a valid UniqueModelId: ${modelIdRaw}`)
  }

  const { providerId, modelId } = parseUniqueModelId(modelIdRaw)
  const provider = providerService.getByProviderId(providerId)
  const model = modelService.getByKey(providerId, modelId)

  const { sdkConfig } = await resolveSdkConfig(provider, model, resolveEffectiveEndpoint(provider, model))
  const executor = await createExecutor(
    sdkConfig.providerId as Parameters<typeof createExecutor>[0],
    sdkConfig.providerSettings as Parameters<typeof createExecutor>[1]
  )
  const languageModel = await executor.languageModel(sdkConfig.modelId)

  const { text } = await generateText({
    model: languageModel,
    system: config.systemPrompt,
    prompt,
    temperature: config.temperature,
    maxOutputTokens: config.maxTokens
  })
  return text
}
