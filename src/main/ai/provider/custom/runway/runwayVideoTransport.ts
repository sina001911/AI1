import type { FetchFunction } from '@ai-sdk/provider-utils'
import { loadApiKey } from '@ai-sdk/provider-utils'

import { createAbortError, isTerminalHttpStatus, waitWithSignal } from '../transportUtils'
import {
  DEFAULT_VIDEO_REQUEST_TIMEOUT_MS,
  type VideoGenerationSubmitInput,
  type VideoGenerationTransport
} from '../videoGenerationModel'

/**
 * Runway Gen-3 / Gen-4 video generation transport.
 *
 *   - Submit:  POST /v1/generate with `{ prompt, model, duration, aspectRatio, ... }`
 *   - Poll:    GET /v1/generate/{taskId} until `status === 'SUCCEEDED'`
 *   - Cancel:  POST /v1/generate/{taskId}/cancel
 *
 * Runway returns `{ id, status }` on submit; the poll response carries
 * `output.url` (a signed URL) when complete.
 */
export const DEFAULT_RUNWAY_BASE_URL = 'https://api.runwayml.com/v1'

const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 15 * 60 * 1000
const CANCEL_TIMEOUT_MS = 10000

interface RunwaySubmitResponse {
  id?: string
  status?: string
}

interface RunwayPollResponse {
  status?: string
  output?: { url?: string }
  error?: { message?: string }
}

interface RunwayTransportSettings {
  apiKey: string
  baseURL?: string
  fetch?: FetchFunction
  headers?: Record<string, string>
}

class RunwayVideoTransport implements VideoGenerationTransport {
  private readonly apiKey: string
  private readonly baseURL: string
  private readonly fetch?: FetchFunction
  private readonly extraHeaders: Record<string, string> | undefined

  constructor(settings: RunwayTransportSettings) {
    this.apiKey = settings.apiKey
    this.baseURL = settings.baseURL || DEFAULT_RUNWAY_BASE_URL
    this.fetch = settings.fetch
    this.extraHeaders = settings.headers
  }

  async submit(input: VideoGenerationSubmitInput): Promise<{ taskId?: string; videoUrls?: string[] }> {
    const body: Record<string, unknown> = {
      model: input.modelId,
      promptText: input.prompt,
      duration: input.duration ?? 5,
      ...(input.aspectRatio && { aspectRatio: input.aspectRatio }),
      ...(input.resolution && { resolution: input.resolution }),
      ...(typeof input.seed === 'number' && { seed: input.seed }),
      ...(input.generateAudio !== undefined && { audio: input.generateAudio })
    }
    const image = input.image ?? input.inputReferences?.[0]
    if (image) body.image = typeof image === 'string' ? image : undefined

    const response = await this.request<RunwaySubmitResponse>('/generate', 'POST', body, {
      timeout: input.requestTimeoutMs ?? DEFAULT_VIDEO_REQUEST_TIMEOUT_MS,
      signal: input.signal
    })
    const taskId = response.id
    if (!taskId) throw new Error('Runway submit returned no task id')
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
        const result = await this.request<RunwayPollResponse>(
          `/generate/${encodeURIComponent(taskId)}`,
          'GET',
          undefined,
          { timeout: 10000, signal: options.signal }
        )
        if (result.status === 'SUCCEEDED') {
          const url = result.output?.url
          if (!url) throw new Error('Runway task succeeded but returned no video URL')
          return [url]
        }
        if (result.status === 'FAILED' || result.status === 'ABORTED') {
          throw new Error(`Runway task ${result.status.toLowerCase()}: ${result.error?.message ?? 'no error message'}`)
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
    throw new Error('Runway video polling timeout')
  }

  async cancel(taskId: string): Promise<void> {
    await this.request(`/generate/${encodeURIComponent(taskId)}/cancel`, 'POST', undefined, {
      timeout: CANCEL_TIMEOUT_MS
    }).catch(() => undefined)
  }

  private async request<T>(
    path: string,
    method: 'POST' | 'GET',
    body: Record<string, unknown> | undefined,
    options: { timeout?: number; signal?: AbortSignal }
  ): Promise<T> {
    const timeout = options.timeout ?? DEFAULT_TIMEOUT
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const response = await (this.fetch ?? fetch)(`${this.baseURL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'X-Runway-Version': '2024-11-06',
          ...(method === 'POST' && body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...this.extraHeaders
        },
        body: method === 'POST' && body !== undefined ? JSON.stringify(body) : undefined,
        signal: options.signal ?? controller.signal
      })
      if (!response.ok) {
        const errorText = (await response.text().catch(() => '')).slice(0, 500)
        const error = new Error(`Runway API error: ${response.status} - ${errorText}`)
        ;(error as { status?: number }).status = response.status
        throw error
      }
      return (await response.json()) as T
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError' && !options.signal) {
        throw new Error(`Runway API request timeout after ${timeout / 1000}s`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}

const DEFAULT_TIMEOUT = 60000

export function createRunwayVideoTransport(settings: RunwayTransportSettings): VideoGenerationTransport {
  const apiKey = loadApiKey({
    apiKey: settings.apiKey,
    environmentVariableName: 'RUNWAY_API_KEY',
    description: 'Runway'
  })
  return new RunwayVideoTransport({ ...settings, apiKey })
}
