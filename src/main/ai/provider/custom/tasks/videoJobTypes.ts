import type { SourceSnapshot } from '@data/services/AiUsageRecordService'
import type { CleanupPolicy, FileEntry } from '@shared/data/types/file'
import type { UniqueModelId } from '@shared/data/types/model'

import type { VideoTransportDescriptor } from '../videoGenerationModel'

/**
 * Payload for the async video-generation job. Carries only what the handler
 * needs to (re)build the submit input after a restart — NO secrets and NO raw
 * input-media bytes:
 *
 *   - `uniqueModelId` lets the handler re-resolve the provider/model and read
 *     the apiKey fresh from config on every attempt (never persisted).
 *   - Input images / references are persisted as FileEntries at enqueue time and
 *     referenced by id, so the JSON payload stays under the 1MB job cap.
 *   - `providerParams` is `videoProviderOptions[sdkConfig.providerId]` — the
 *     exact bag the in-SDK path hands `transport.submit` (JSON-only; the
 *     plugin-chain callbacks like `onProgress` are already stripped).
 */
export interface VideoGenerationJobPayload {
  uniqueModelId: UniqueModelId
  prompt?: string
  n: number
  aspectRatio?: string
  resolution?: string
  duration?: number
  fps?: number
  seed?: number
  inputFileIds?: string[]
  /** Per-model transport routing, derived in main from the registry — persisted
   * here so the handler reaches the right endpoint / response family without
   * re-resolving the registry. */
  modelDescriptor?: VideoTransportDescriptor
  /** Per-attempt submit timeout (ms); omitted uses the transport default. */
  requestTimeoutMs?: number
  /** Non-secret request source captured when the job is enqueued. */
  source?: SourceSnapshot
  providerParams: Record<string, unknown>
  /** Stamped on the persisted output FileEntries — decided by the requesting business feature. */
  cleanupPolicy: CleanupPolicy
}

/** Job output — the persisted result FileEntries the IPC layer returns verbatim. */
export interface VideoGenerationJobOutput {
  files: FileEntry[]
}

declare module '@main/core/job/jobRegistry' {
  interface JobRegistry {
    'video-generation.generate': VideoGenerationJobPayload
  }
}
