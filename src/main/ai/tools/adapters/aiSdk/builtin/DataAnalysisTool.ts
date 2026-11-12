/**
 * Data analysis tool — CSV parsing, column statistics, and chart generation.
 *
 * The model supplies a CSV block and an instruction; this tool returns
 * per-column descriptive stats plus a chart spec the renderer can draw.
 * All logic lives in the shared `dataAnalysis` core so both the AI-SDK
 * adapter and the Claude Code MCP bridge run identical code.
 */

import { type InferToolInput, type InferToolOutput, tool } from 'ai'
import * as z from 'zod'

import { DATA_ANALYZE_TOOL_NAME, dataAnalysisOutputSchema, dataAnalyzeInputSchema } from '@shared/ai/builtinTools'

import { analyzeData, DATA_ANALYZE_DESCRIPTION_UNTRIMMED } from '../../../dataAnalysis'
import type { ToolEntry } from '../types'

export { DATA_ANALYZE_TOOL_NAME }

const dataAnalyzeResultSchema = z.union([dataAnalysisOutputSchema, z.object({ error: z.string() })])

const dataAnalyzeTool = tool({
  description: DATA_ANALYZE_DESCRIPTION_UNTRIMMED,
  inputSchema: dataAnalyzeInputSchema,
  outputSchema: dataAnalyzeResultSchema,
  execute: async (input) => {
    try {
      return await analyzeData(input)
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  },
  toModelOutput: ({ output }) => {
    if ('error' in output) return { type: 'error-text' as const, value: `[Error] ${output.error}` }
    // Render as text — the summary + columns table is enough for the model.
    // The chart is available on `output.chart` for the renderer if needed.
    const chartPart = output.chart ? `\n\n[chart: ${output.chart.kind} — ${output.chart.title ?? 'no title'}]` : ''
    return { type: 'text' as const, value: `${output.summary}${chartPart}` }
  }
})

export function createDateAnalysisToolEntry(): ToolEntry {
  return {
    name: DATA_ANALYZE_TOOL_NAME,
    namespace: 'data',
    description: 'Parse a CSV block, compute per-column statistics, and produce a chart',
    defer: 'never',
    tool: dataAnalyzeTool
  }
}

export type DataAnalysisToolInput = InferToolInput<typeof dataAnalyzeTool>
export type DataAnalysisToolOutput = InferToolOutput<typeof dataAnalyzeTool>
