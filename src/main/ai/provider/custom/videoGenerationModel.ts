import type {
  Experimental_VideoModelV3 as VideoModelV3,
  Experimental_VideoModelV3CallOptions as VideoModelV3CallOptions
} from '@ai-sdk/provider'

import { createAbortError } from './transportUtils'

/**
 * Per-model transport routing for video generation — which endpoint to POST,
 * whether to poll, and which response family to parse. Derived in main from
 * the registry, so it travels on its own typed channel (the job payload /
 * submit input), not the `providerParams` bag.
 */
export interface VideoTransportDescriptor {
  id: string
  endpoint: string
  isSync?: boolean
}

/** Default bound for one submit attempt. Video generation is slower than
 * image generation — most providers take 30s–10min. */
export const DEFAULT_VIDEO_REQUEST_TIMEOUT_MS = 10 * 60_000

export interface VideoGenerationTransport {
  submit(input: VideoGenerationSubmitInput): Promise<{ taskId?: string; videoUrls?: string[] }>
  poll?(
    taskId: string,
    options: {
      signal?: AbortSignal
      onProgress?: (progress: number) => void
      modelDescriptor?: VideoTransportDescriptor
    }
  ): Promise<string[]>
  cancel?(taskId: string): Promise<void>
}

export interface VideoGenerationSubmitInput {
  modelId: string
  prompt: string | undefined
  n: number
  aspectRatio?: `${number}:${number}` | 'adaptive'
  resolution?: `${number}x${number}`
  duration: number | undefined
  fps: number | undefined
  seed: number | undefined
  image: VideoModelV3CallOptions['image']
  frameImages: VideoModelV3CallOptions['frameImages']
  inputReferences: VideoModelV3CallOptions['inputReferences']
  generateAudio: boolean | undefined
  modelDescriptor?: VideoTransportDescriptor
  providerParams: Record<string, unknown>
  requestTimeoutMs?: number
  signal?: AbortSignal
}

export interface CreateVideoGenerationModelOptions {
  provider: string
  transport: VideoGenerationTransport
}

/**
 * Builds a `VideoModelV3` whose `doGenerate` runs submit→optional-poll→return-urls,
 * parameterized by an injected `VideoGenerationTransport`. Returns video URLs;
 * the patched `ai` SDK auto-downloads them into `GeneratedFile`s.
 *
 * Progress surfaces through `options.providerOptions[provider].onProgress`.
 * Abort propagates via `options.abortSignal`.
 */
export function createVideoGenerationModel(
  modelId: string,
  { provider, transport }: CreateVideoGenerationModelOptions
): VideoModelV3 {
  return {
    specificationVersion: 'v3',
    provider,
    modelId,
    maxVideosPerCall: 1,
    async doGenerate(options: VideoModelV3CallOptions) {
      const { abortSignal } = options

      if (abortSignal?.aborted) {
        throw createAbortError('Video generation aborted')
      }

      const providerParams = (options.providerOptions?.[provider] as Record<string, unknown> | undefined) ?? {}

      const onProgress =
        typeof providerParams.onProgress === 'function'
          ? (providerParams.onProgress as (progress: number) => void)
          : undefined

      const submitResult = await transport.submit({
        modelId,
        prompt: options.prompt,
        n: options.n,
        aspectRatio: options.aspectRatio,
        resolution: options.resolution,
        duration: options.duration,
        fps: options.fps,
        seed: options.seed,
        image: options.image,
        frameImages: options.frameImages,
        inputReferences: options.inputReferences,
        generateAudio: options.generateAudio,
        providerParams,
        signal: abortSignal
      })

      let urls: string[]
      if (submitResult.videoUrls) {
        urls = submitResult.videoUrls
      } else if (submitResult.taskId) {
        if (!transport.poll) {
          throw new Error(`${provider} returned a task id but does not implement polling`)
        }

        let cancelRequested = false
        const cancelRemoteTask = () => {
          if (cancelRequested) return
          cancelRequested = true
          void transport.cancel?.(submitResult.taskId as string).catch(() => {})
        }

        if (abortSignal?.aborted) {
          cancelRemoteTask()
          throw createAbortError('Video generation aborted')
        }

        abortSignal?.addEventListener('abort', cancelRemoteTask, { once: true })
        try {
          urls = await transport.poll(submitResult.taskId, { signal: abortSignal, onProgress })
        } finally {
          abortSignal?.removeEventListener('abort', cancelRemoteTask)
        }
      } else {
        urls = []
      }

      return {
        videos: urls.map((url) => ({ type: 'url' as const, url, mediaType: 'video/mp4' })),
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId,
          headers: {}
        }
      }
    }
  }
}
