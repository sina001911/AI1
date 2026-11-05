/**
 * Video generation tool — agentic.
 *
 * The model supplies a prompt and optional image references. The actual
 * generation (provider/model resolution, transport selection, persistence)
 * lives in the shared `generateVideo` core so the Claude Code MCP bridge runs
 * the exact same logic; this file is just the AI-SDK `dynamicTool()` wrapper.
 */

import { dynamicTool } from 'ai'

import { GENERATE_VIDEO_TOOL_NAME } from '@shared/ai/builtinTools'

import {
  generateVideoInputSchema,
  generateVideoFromPrompt,
  type VideoGenerationResult,
  videoGenerationModelOutput
} from '../../../generateVideoTool'
import { getToolCallContext } from '../context'
import type { ToolEntry } from '../types'

export { GENERATE_VIDEO_TOOL_NAME }

function buildGenerateVideoTool() {
  return dynamicTool({
    description:
      'Generate a video from a text prompt using the configured video model. Supports optional image references for image-to-video generation.',
    inputSchema: generateVideoInputSchema,
    execute: async (input, options) => {
      const parsed = generateVideoInputSchema.parse(input)
      return generateVideoFromPrompt(parsed, getToolCallContext(options).request.abortSignal)
    },
    toModelOutput: ({ output }) => videoGenerationModelOutput(output as VideoGenerationResult)
  })
}

const fallbackGenerateVideoTool = buildGenerateVideoTool()

export function createGenerateVideoToolEntry(): ToolEntry {
  return {
    name: GENERATE_VIDEO_TOOL_NAME,
    namespace: 'media',
    description: 'Generate a video from a text prompt',
    defer: 'auto',
    tool: fallbackGenerateVideoTool
  }
}

export type { GenerateVideoToolInput } from '../../../generateVideoTool'
export type GenerateVideoToolOutput = ReturnType<typeof generateVideoFromPrompt>
