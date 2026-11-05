import type { FetchFunction } from '@ai-sdk/provider-utils'
import { loadApiKey } from '@ai-sdk/provider-utils'

import { createAbortError, isTerminalHttpStatus, waitWithSignal } from '../transportUtils'
import {
  DEFAULT_VIDEO_REQUEST_TIMEOUT_MS,
  type VideoGenerationSubmitInput,
  type VideoGenerationTransport
} from '../videoGenerationModel'

/**
 * Vidu video generation transport.
 *
 *   - Submit:  POST /v1/video/generation with `{ prompt, model, ... }`
 *   - Poll:    GET /v1/video/generation/{taskId}
 *   - Cancel:  POST /v1/video/generation/{taskId}/cancel
 *
 * Vidu returns `{ task_id, status }` on submit; the poll response carries
 * `output.file_url` when `status === 'SUCCEEDED'`.
 */
export const DEFAULT_VIDU_BASE_URL = 'https://api.vidu.ai'

const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 15 * 60 * 1000
const CANCEL_TIMEOUT_MS = 10000

interface ViduSubmitResponse {
  task_id?: string
  code?: number
  message?: string
}

interface ViduPollResponse {
  task_id?: string
  status?: string
  output?: { file_url?: string }
  error?: { message?: string }
}

interface ViduTransportSettings {
  apiKey: string
  baseURL?: string
  fetch?: FetchFunction
  headers?: Record<string, string>
}

class ViduVideoTransport implements VideoGenerationTransport {
  private readonly apiKey: string
  private readonly baseURL: string
  private readonly fetch?: FetchFunction
  private readonly extraHeaders: Record<string, string> | undefined

  constructor(settings: ViduTransportSettings) {
    this.apiKey = settings.apiKey
    this.baseURL = settings.baseURL || DEFAULT_VIDU_BASE_URL
    this.fetch = settings.fetch
    this.extraHeaders = settings.headers
  }

  async submit(input: VideoGenerationSubmitInput): Promise<{ taskId?: string; videoUrls?: string[] }> {
    const body: Record<string, unknown> = {
      model: input.modelId,
      prompt: input.prompt,
      ...(input.aspectRatio && { aspect_ratio: input.aspectRatio }),
      ...(input.duration && { duration: input.duration }),
      ...(typeof input.seed === 'number' && { seed: input.seed }),
      ...(input.generateAudio !== undefined && { audio: input.generateAudio })
    }
    const image = input.image ?? input.inputReferences?.[0]
    if (image) body.image = typeof image === 'string' ? image : undefined

    const response = await this.request<ViduSubmitResponse>('/v1/video/generation', 'POST', body, {
      timeout: input.requestTimeoutMs ?? DEFAULT_VIDEO_REQUEST_TIMEOUT_MS,
      signal: input.signal
    })
    if (response.code && response.code !== 0) {
      throw new Error(`Vidu submit failed: ${response.message ?? 'unknown error'}`)
    }
    const taskId = response.task_id
    if (!taskId) throw new Error('Vidu submit returned no task id')
    return { taskId }
  }

  async poll(
    taskId: string,
    options: {
      signal?: AbortSignal
      onProgress?: (progress: number) => void
      modelDescriptor?: { id: string; endpoint: string; isSync?: boolean }
    }
  ): Promise<string[]> {
    const deadline = Date.now() + POLL_TIMEOUT_MS
    let ticks = 0
    while (Date.now() < deadline) {
      if (options.signal?.aborted) throw createAbortError('Video polling aborted')
      try {
        const result = await this.request<ViduPollResponse>(
          `/v1/video/generation/${encodeURIComponent(taskId)}`,
          'GET',
          undefined,
          { timeout: 10000, signal: options.signal }
        )
        if (result.status === 'SUCCEEDED') {
          const url = result.output?.file_url
          if (!url) throw new Error('Vidu task succeeded but returned no video URL')
          return [url]
        }
        if (result.status === 'FAILED' || result.status === 'CANCELLED') {
          throw new Error(`Vidu task ${result.status.toLowerCase()}: ${result.error?.message ?? 'no error message'}`)
        }
      } catch (error) {
        if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
          throw createAbortError('Video polling aborted')
        }
        if (error instanceof Error && isTerminalHttpStatus(Number((error as { status?: number }).status ?? 500))) {
          throw error
        }
      }
      ticks += 1
      options.onProgress?.(Math.min(0.9, ticks * 0.05))
      await waitWithSignal(POLL_INTERVAL_MS, options.signal)
    }
    throw new Error('Vidu video polling timeout')
  }

  async cancel(taskId: string): Promise<void> {
    await this.request(`/v1/video/generation/${encodeURIComponent(taskId)}/cancel`, 'POST', undefined, {
      timeout: CANCEL_TIMEOUT_MS
    }).catch(() => undefined)
  }

  private async request<T>(
    path: string,
    method: 'POST' | 'GET',
    body: Record<string, unknown> | undefined,
    options: { timeout?: number; signal?: AbortSignal }
  ): Promise<T> {
    const timeout = options.timeout ?? 60000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const response = await (this.fetch ?? fetch)(`${this.baseURL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...this.extraHeaders
        },
        body: method === 'POST' && body !== undefined ? JSON.stringify(body) : undefined,
        signal: options.signal ?? controller.signal
      })
      if (!response.ok) {
        const errorText = (await response.text().catch(() => '')).slice(0, 500)
        const error = new Error(`Vidu API error: ${response.status} - ${errorText}`)
        ;(error as { status?: number }).status = response.status
        throw error
      }
      return (await response.json()) as T
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError' && !options.signal) {
        throw new Error(`Vidu API request timeout after ${timeout / 1000}s`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}

export function createViduVideoTransport(settings: ViduTransportSettings): VideoGenerationTransport {
  const apiKey = loadApiKey({
    apiKey: settings.apiKey,
    environmentVariableName: 'VIDU_API_KEY',
    description: 'Vidu'
  })
  return new ViduVideoTransport({ ...settings, apiKey })
}
