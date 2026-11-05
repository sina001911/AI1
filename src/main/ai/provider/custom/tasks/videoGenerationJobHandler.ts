import type { Experimental_VideoModelV3File as VideoModelV3File } from '@ai-sdk/provider'

import { application } from '@application'
import { aiUsageRecordService } from '@data/services/AiUsageRecordService'
import { loggerService } from '@logger'
import { createAiUsageCaptureContext } from '@main/ai/utils/usageCapture'
import type { JobContext, JobHandler } from '@main/core/job/types'
import { modelService } from '@main/data/services/ModelService'
import { providerService } from '@main/data/services/ProviderService'
import { downloadVideoAsBase64 } from '@main/utils/downloadAsBase64'
import type { CleanupPolicy, FileEntry } from '@shared/data/types/file'
import { parseUniqueModelId } from '@shared/data/types/model'
import type { Base64String } from '@shared/types/file'

import { resolveProviderAiSdkConfig } from '../../config'
import { resolveEffectiveEndpoint, resolveWireModelId } from '../../endpoint'
import { createAbortError } from '../transportUtils'
import type { VideoGenerationSubmitInput, VideoGenerationTransport } from '../videoGenerationModel'
import { resolveVideoTransport } from '../videoTransportRegistry'
import type { VideoGenerationJobOutput, VideoGenerationJobPayload } from './videoJobTypes'

const logger = loggerService.withContext('VideoGenerationJobHandler')

/**
 * Async video-generation handler for custom-provider submit/poll transports
 * (runway / kling / luma / vidu / minimax / comfyui). Mirrors
 * `videoGenerationModel.doGenerate` but owns the submit/poll loop.
 *
 * Secrets are never persisted — the apiKey is re-read from provider config on
 * every attempt via `resolveProviderAiSdkConfig`. Input images / references are
 * referenced by FileEntry id and read back from FileManager, keeping the payload
 * under the 1MB job cap.
 *
 * **Deliberately not restart-durable.** Same reasoning as the image handler:
 * `recovery: 'abandon'` — a crash after submit but before the task id is durable
 * would resubmit and bill the user twice.
 */
export const videoGenerationJobHandler: JobHandler<VideoGenerationJobPayload> = {
  recovery: 'abandon',
  defaultQueue: (input) => `video-generation.${parseUniqueModelId(input.uniqueModelId).providerId}`,
  defaultConcurrency: 2,
  defaultRetryPolicy: { maxAttempts: 1, backoff: 'none', baseDelayMs: 0, maxDelayMs: 0 },
  defaultTimeoutMs: 30 * 60_000,
  async execute(ctx) {
    const input = ctx.input
    const { providerId, modelId } = parseUniqueModelId(input.uniqueModelId)
    const provider = providerService.getByProviderId(providerId)
    if (!provider) throw new Error(`Video generation job: provider '${providerId}' not found`)
    const model = modelService.getByKey(providerId, modelId)
    if (!model) throw new Error(`Video generation job: model '${modelId}' not found for provider '${providerId}'`)

    const { config, credentialReceipt } = await resolveProviderAiSdkConfig(provider, model)
    const sdkConfig = {
      ...config,
      modelId: resolveWireModelId(model, resolveEffectiveEndpoint(provider, model).endpointType)
    }

    const transport = resolveVideoTransport(sdkConfig.providerId, sdkConfig.modelId, sdkConfig.providerSettings)
    if (!transport) {
      throw new Error(
        `Video generation job: no async transport for '${sdkConfig.providerId}' (model '${sdkConfig.modelId}')`
      )
    }

    let urls: string[]
    const submitInput = await buildSubmitInput(input, sdkConfig.modelId, ctx.signal)
    const captureContext = createAiUsageCaptureContext({
      providerId: provider.id,
      providerName: provider.name,
      modelId: sdkConfig.modelId,
      modelName: model.name,
      pricing: modelService.getByKey(providerId, modelId).pricing,
      billing: providerService.getByProviderId(providerId).settings.billing,
      billingModelId: modelId,
      trustProviderReportedCost: provider.reportsActualCost,
      reportedCostCurrency: provider.reportedCostCurrency,
      credentialReceipt,
      source: input.source ?? null,
      messageRef: null
    })
    const usageStartedAt = Date.now()
    const submit = await transport.submit(submitInput)
    if (submit.videoUrls) {
      urls = submit.videoUrls
    } else if (submit.taskId) {
      urls = await pollUntilDone(transport, submit.taskId, ctx)
    } else {
      throw new Error(`Video generation submit for '${sdkConfig.modelId}' returned neither videoUrls nor a taskId`)
    }

    if (captureContext) {
      const completedAt = Date.now()
      aiUsageRecordService.recordInvocation({
        requestId: `custom-video:${ctx.jobId}`,
        context: captureContext,
        modality: 'image',
        imageCount: urls.length,
        metrics: { timeCompletionMs: Math.max(0, completedAt - usageStartedAt) },
        completedAt
      })
    }

    if (urls.length === 0) {
      throw new Error(`Video generation for '${sdkConfig.modelId}' completed but returned no video URLs`)
    }

    const files = await downloadAndPersistVideoUrls(urls, ctx.signal, input.cleanupPolicy)
    ctx.reportProgress(100, { stage: 'done' })
    return { files } satisfies VideoGenerationJobOutput
  }
}

async function buildSubmitInput(
  input: VideoGenerationJobPayload,
  modelId: string,
  signal: AbortSignal
): Promise<VideoGenerationSubmitInput> {
  const files = input.inputFileIds?.length ? await Promise.all(input.inputFileIds.map(readMediaFile)) : undefined
  return {
    modelId,
    prompt: input.prompt,
    n: input.n,
    aspectRatio: input.aspectRatio as `${number}:${number}` | 'adaptive' | undefined,
    resolution: input.resolution as `${number}x${number}` | undefined,
    duration: input.duration,
    fps: input.fps,
    seed: input.seed,
    image: undefined,
    frameImages: undefined,
    inputReferences: files,
    generateAudio: undefined,
    modelDescriptor: input.modelDescriptor,
    providerParams: input.providerParams,
    requestTimeoutMs: input.requestTimeoutMs,
    signal
  }
}

async function readMediaFile(fileId: string): Promise<VideoModelV3File> {
  const { content, mime } = await application.get('FileManager').read(fileId, { encoding: 'base64' })
  return { type: 'file', mediaType: mime, data: content }
}

async function pollUntilDone(
  transport: VideoGenerationTransport,
  taskId: string,
  ctx: JobContext<VideoGenerationJobPayload>
): Promise<string[]> {
  if (!transport.poll) {
    throw new Error('Video transport returned a task id but does not implement polling')
  }
  const cancelRemote = transport.cancel ? () => void transport.cancel?.(taskId).catch(() => {}) : undefined
  if (cancelRemote) {
    if (ctx.signal.aborted) {
      cancelRemote()
      throw createAbortError('Video generation aborted')
    }
    ctx.signal.addEventListener('abort', cancelRemote, { once: true })
  }
  try {
    return await transport.poll(taskId, {
      signal: ctx.signal,
      onProgress: (progress) => ctx.reportProgress(progress, { stage: 'polling' }),
      modelDescriptor: ctx.input.modelDescriptor
    })
  } finally {
    if (cancelRemote) ctx.signal.removeEventListener('abort', cancelRemote)
  }
}

async function resolveVideoDataUrl(url: string): Promise<Base64String | null> {
  if (url.startsWith('data:')) return url as Base64String
  const downloaded = await downloadVideoAsBase64(url)
  if (!downloaded) return null
  return `data:${downloaded.media_type || 'video/mp4'};base64,${downloaded.data}`
}

async function downloadAndPersistVideoUrls(
  urls: string[],
  signal: AbortSignal,
  cleanupPolicy: CleanupPolicy
): Promise<FileEntry[]> {
  const fileManager = application.get('FileManager')
  const files: FileEntry[] = []
  for (const url of urls) {
    if (signal.aborted) throw createAbortError('Video generation aborted')
    const data = await resolveVideoDataUrl(url)
    if (!data) continue
    files.push(await fileManager.createInternalEntry({ source: 'base64', data, cleanupPolicy }))
  }
  if (files.length === 0) {
    throw new Error(`Video generation produced ${urls.length} URL(s) but all downloads failed`)
  }
  if (files.length < urls.length) {
    logger.warn('Some generated video downloads failed', { requested: urls.length, persisted: files.length })
  }
  return files
}
