import * as z from 'zod'

import { application } from '@application'
import { modelService } from '@data/services/ModelService'
import { loggerService } from '@logger'
import { isAbortError } from '@main/utils/error'
import type { GenerateVideoOutput } from '@shared/ai/builtinTools'
import { isDataApiNotFoundError } from '@shared/data/api/errors'
import { parseUniqueModelId, type UniqueModelId } from '@shared/data/types/model'

const logger = loggerService.withContext('VideoGeneration')

export const GENERATE_VIDEO_DESCRIPTION =
  'Generate a video from a text prompt using the configured video model. Supports optional image references for image-to-video generation.'

export const videoGenerationErrorSchema = z.object({ error: z.string() })
export type VideoGenerationError = z.infer<typeof videoGenerationErrorSchema>
export type VideoGenerationResult = GenerateVideoOutput | VideoGenerationError

export const VIDEO_GENERATION_MODEL_PREF_KEY = 'feature.video.default_model_id'

/**
 * Resolve the configured video model for the `generate_video` tool. Mirrors
 * `resolveConfiguredPaintingModel` but carries no image-generation support
 * (video generation routes through the async transport registry, not the
 * painting modes/catalog).
 */
export function resolveConfiguredVideoModel(): { uniqueModelId: UniqueModelId } | null {
  const uniqueModelId = application
    .get('PreferenceService')
    .get(VIDEO_GENERATION_MODEL_PREF_KEY) as UniqueModelId | null
  if (!uniqueModelId) return null

  const { providerId, modelId } = parseUniqueModelId(uniqueModelId)
  try {
    modelService.getByKey(providerId, modelId)
  } catch (error) {
    if (isDataApiNotFoundError(error)) return null
    throw error
  }
  return { uniqueModelId }
}

export function isVideoGenerationError(output: VideoGenerationResult): output is VideoGenerationError {
  return !Array.isArray(output)
}

export function videoGenerationModelOutput(output: VideoGenerationResult): { type: 'text'; value: string } {
  if (isVideoGenerationError(output)) return { type: 'text', value: output.error }
  return {
    type: 'text',
    value: `Generated ${output.length} video file(s).`
  }
}

export const generateVideoInputSchema = z
  .object({
    prompt: z.string().trim().min(1).max(2000).describe('Description of the video to generate.'),
    image_ids: z.array(z.string()).optional().describe('Optional image FileEntry ids for image-to-video generation.')
  })
  .strict()

export type GenerateVideoToolInput = z.infer<typeof generateVideoInputSchema>

/**
 * Generate a video from a prompt, delegating to AiService.generateVideo.
 * Mirrors the painting tool's error contract: failures return `{ error }`
 * instead of throwing, so the agentic loop keeps running.
 */
export async function generateVideoFromPrompt(
  input: GenerateVideoToolInput,
  signal?: AbortSignal
): Promise<VideoGenerationResult> {
  const modelPref = application.get('PreferenceService').get(VIDEO_GENERATION_MODEL_PREF_KEY)
  if (!modelPref) {
    return {
      error: 'No video model is configured. Tell the user to pick one in Settings > Default Model; do not retry.'
    }
  }

  const { providerId, modelId } = parseUniqueModelId(modelPref as UniqueModelId)

  try {
    const { files } = await application.get('AiService').generateVideo({
      uniqueModelId: modelPref as UniqueModelId,
      prompt: input.prompt,
      cleanupPolicy: 'manual',
      requestOptions: signal ? { signal } : undefined
    })
    return files
  } catch (error) {
    if (isAbortError(error)) throw error
    logger.error('Video generation failed', error as Error, { providerId, modelId })
    return { error: 'Video generation failed (provider error); retry or inform the user.' }
  }
}
