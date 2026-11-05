import type { FetchFunction } from '@ai-sdk/provider-utils'

import { createAbortError, waitWithSignal } from '../transportUtils'
import { type VideoGenerationSubmitInput, type VideoGenerationTransport } from '../videoGenerationModel'
import { type ComfyuiRequestOptions, normalizeComfyuiBaseUrl, requestJson, withDeadline } from './comfyuiHttp'

/**
 * ComfyUI video generation transport.
 *
 * ComfyUI is driven by a node graph rather than a prompt string, so a workflow
 * supplies everything except the prompt: the node that receives it is found by
 * following the sampler's positive conditioning. This transport mirrors the
 * image transport's submit/poll/cancel loop but returns video URLs from the
 * workflow's `VIDEO_SAVE` node instead of `IMAGE_SAVE`.
 *
 *   - Submit:  POST /prompt with the workflow graph
 *   - Poll:    GET /history/{taskId} until the graph reports outputs
 *   - Cancel:  POST /interrupt { prompt_id: taskId } (targeted on v0.3.57+)
 */
export const DEFAULT_COMFYUI_BASE_URL = 'http://localhost:8188'

const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 15 * 60 * 1000
const IMAGE_TIMEOUT_MS = 60 * 1000
const SUBMIT_TIMEOUT_MS = 60 * 1000

interface HistoryEntry {
  outputs?: Record<string, { videos?: Array<{ filename: string; subfolder?: string; type?: string }> }>
  status?: { status_str?: string; messages?: unknown[] }
}

interface ComfyuiTransportSettings extends ComfyuiRequestOptions {
  baseURL?: string
}

class ComfyuiVideoTransport implements VideoGenerationTransport {
  private readonly baseURL: string
  private readonly headers: Record<string, string>
  private readonly doFetch: FetchFunction

  constructor(settings: ComfyuiTransportSettings) {
    this.baseURL = normalizeComfyuiBaseUrl(settings.baseURL || DEFAULT_COMFYUI_BASE_URL)
    this.headers = settings.headers ?? {}
    this.doFetch = settings.fetch ?? fetch
  }

  async submit(input: VideoGenerationSubmitInput): Promise<{ taskId?: string; videoUrls?: string[] }> {
    const response = await requestJson<{ prompt_id?: string }>(
      `${this.baseURL}/prompt`,
      'ComfyUI video submit failed',
      input.signal,
      { headers: this.headers, fetch: this.doFetch },
      SUBMIT_TIMEOUT_MS
    )
    const taskId = response.prompt_id
    if (!taskId) throw new Error('ComfyUI video submit returned no prompt id')
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
        const history = await this.fetchHistory(taskId, options.signal, deadline - Date.now())
        const entry = history[taskId]
        if (entry?.status?.status_str === 'error') {
          throw new Error(`ComfyUI video workflow failed: ${JSON.stringify(entry.status.messages ?? {}).slice(0, 500)}`)
        }
        if (entry?.outputs && Object.keys(entry.outputs).length > 0) {
          const videos = Object.values(entry.outputs).flatMap((output) => output.videos ?? [])
          if (videos.length === 0) {
            throw new Error('ComfyUI video task completed but produced no video')
          }
          return await Promise.all(videos.map((video) => this.fetchVideo(video, options.signal)))
        }
      } catch (error) {
        if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
          throw createAbortError('Video polling aborted')
        }
      }
      ticks += 1
      options.onProgress?.(Math.min(0.9, ticks * 0.05))
      await waitWithSignal(POLL_INTERVAL_MS, options.signal)
    }
    throw new Error('ComfyUI video polling timeout')
  }

  async cancel(taskId: string): Promise<void> {
    await withDeadline(undefined, 5000, 'ComfyUI video cancel timed out', async (deadlineSignal) => {
      await this.doFetch(`${this.baseURL}/interrupt`, {
        method: 'POST',
        headers: { ...this.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_id: taskId }),
        signal: deadlineSignal
      }).catch(() => undefined)
    }).catch(() => undefined)
  }

  private async fetchHistory(
    taskId: string,
    signal: AbortSignal | undefined,
    remainingMs: number
  ): Promise<Record<string, HistoryEntry>> {
    return withDeadline(signal, remainingMs, 'ComfyUI video history read timed out', async (deadlineSignal) => {
      const response = await this.doFetch(`${this.baseURL}/history/${taskId}`, {
        headers: this.headers,
        signal: deadlineSignal
      })
      if (!response.ok) {
        throw new Error(`ComfyUI history answered ${response.status}`)
      }
      return (await response.json()) as Record<string, HistoryEntry>
    })
  }

  private async fetchVideo(
    video: { filename: string; subfolder?: string; type?: string },
    signal?: AbortSignal
  ): Promise<string> {
    const query = new URLSearchParams({
      filename: video.filename,
      subfolder: video.subfolder ?? '',
      type: video.type ?? 'output'
    })
    return withDeadline(signal, IMAGE_TIMEOUT_MS, 'ComfyUI video download timed out', async (deadlineSignal) => {
      const response = await this.doFetch(`${this.baseURL}/view?${query}`, {
        headers: this.headers,
        signal: deadlineSignal
      })
      if (!response.ok) {
        throw new Error(`ComfyUI video fetch failed: ${response.status}`)
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      const contentType = response.headers.get('content-type') || 'video/mp4'
      return `data:${contentType};base64,${buffer.toString('base64')}`
    })
  }
}

export function createComfyuiVideoTransport(settings: ComfyuiTransportSettings): VideoGenerationTransport {
  return new ComfyuiVideoTransport(settings)
}
