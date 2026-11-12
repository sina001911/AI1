/**
 * Data analysis core — CSV parsing, column statistics, and chart generation.
 *
 * Used by the `data_analyze` builtin tool so both the AI-SDK adapter and the
 * Claude Code MCP bridge run identical logic.
 */

import * as z from 'zod'

import {
  DATA_ANALYZE_DESCRIPTION,
  dataAnalysisChartSchema,
  dataAnalysisColumnStatSchema,
  dataAnalysisOutputSchema,
  dataAnalyzeInputSchema
} from '@shared/ai/builtinTools'

export type { DataAnalysisColumnStat, DataAnalysisChart, DataAnalysisOutput } from '@shared/ai/builtinTools'

export const DATA_ANALYZE_DESCRIPTION_UNTRIMMED = DATA_ANALYZE_DESCRIPTION

// ── CSV parser ───────────────────────────────────────────────────────

interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

function parseCsvRow(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        cells.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
  }
  cells.push(current.trim())
  return cells
}

export function parseCsv(csvText: string): ParsedCsv {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) throw new Error('CSV input is empty')

  const headers = parseCsvRow(lines[0])
  if (headers.length === 0) throw new Error('CSV has no header row')

  const rows: string[][] = []
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i])
    // Pad short rows or truncate long ones to match header count
    while (row.length < headers.length) row.push('')
    rows.push(row.slice(0, headers.length))
  }

  return { headers, rows }
}

// ── Column stats ─────────────────────────────────────────────────────

function isNumericValue(v: string): boolean {
  return v !== '' && !isNaN(Number(v))
}

export function computeColumnStats(
  headers: string[],
  rows: string[][]
): z.infer<typeof dataAnalysisColumnStatSchema>[] {
  return headers.map((name, colIndex) => {
    const values = rows.map((row) => row[colIndex] ?? '')
    const nonEmpty = values.filter((v) => v !== '')
    const numericValues = nonEmpty.filter(isNumericValue).map((v) => Number(v))
    const isNumeric = numericValues.length > nonEmpty.length * 0.5 && nonEmpty.length > 0

    const distinctSet = new Set(nonEmpty)

    if (!isNumeric || numericValues.length === 0) {
      const counts = new Map<string, number>()
      for (const v of nonEmpty) {
        counts.set(v, (counts.get(v) ?? 0) + 1)
      }
      const topValues = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count }))

      return {
        name,
        type: nonEmpty.length === 0 ? 'empty' : 'categorical',
        count: nonEmpty.length,
        distinct: distinctSet.size,
        topValues
      }
    }

    const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length
    const min = Math.min(...numericValues)
    const max = Math.max(...numericValues)

    return {
      name,
      type: 'numeric',
      count: nonEmpty.length,
      distinct: distinctSet.size,
      mean: parseFloat(mean.toFixed(4)),
      min: parseFloat(min.toFixed(4)),
      max: parseFloat(max.toFixed(4))
    }
  })
}

// ── Chart builder ────────────────────────────────────────────────────

/**
 * Build a chart spec from parsed CSV rows and column statistics.
 *
 * Strategy:
 *   - If a numeric focus column exists, produce a bar chart (categories → values).
 *   - If only categorical columns exist, produce a pie chart from the first one's distribution.
 *   - Pie series use `{ data: [{name, value}] }`; bar series use `{ values: [...] }`.
 */
export function buildChartSpec(
  columns: z.infer<typeof dataAnalysisColumnStatSchema>[],
  headers: string[],
  rows: string[][],
  _instruction: string,
  focusColumn?: string
): z.infer<typeof dataAnalysisChartSchema> {
  // Decide which column drives the chart y-axis (numeric) and x-axis (categorical)
  const numCol =
    focusColumn && columns[headers.indexOf(focusColumn)]?.type === 'numeric'
      ? focusColumn
      : columns.find((c) => c.type === 'numeric')?.name

  const catCandidates = headers.filter((h) => h !== numCol && columns[headers.indexOf(h)]?.type !== 'empty')
  const catCol = catCandidates.length > 0 ? catCandidates[catCandidates.length - 1] : undefined // last is best heuristic

  if (numCol && catCol) {
    const numIdx = headers.indexOf(numCol)
    const catIdx = headers.indexOf(catCol)
    const maxBars = 20
    const sampledRows = rows.length > maxBars ? rows.filter(() => Math.random() < maxBars / rows.length) : rows
    const categories = sampledRows.map((r) => r[catIdx] ?? '')
    const values = sampledRows.map((r) => {
      const v = Number(r[numIdx])
      return isNaN(v) ? null : v
    })
    return {
      kind: 'bar',
      title: `${numCol} by ${catCol}`,
      categories,
      series: [{ name: numCol, values }]
    }
  }

  if (catCol) {
    // Pie from categorical distribution
    const catIdx = headers.indexOf(catCol)
    const counts = new Map<string, number>()
    for (const row of rows) {
      const v = row[catIdx] ?? ''
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    return {
      kind: 'pie',
      title: catCol,
      categories: undefined,
      series: [
        {
          name: 'count',
          data: sorted.map(([name, value]) => ({ name, value }))
        }
      ]
    }
  }

  return { kind: 'bar', title: 'Summary' }
}

// ── Public analyze entry point ───────────────────────────────────────

function summarize(
  parsed: ParsedCsv,
  columns: z.infer<typeof dataAnalysisColumnStatSchema>[],
  _instruction: string
): string {
  const numeric = columns.filter((c) => c.type === 'numeric')
  const categorical = columns.filter((c) => c.type === 'categorical')
  const empty = columns.filter((c) => c.type === 'empty')

  let summary = `Analyzed ${parsed.rows.length} rows × ${parsed.headers.length} columns.\n\n`

  if (numeric.length > 0) {
    summary += 'Numerical columns:\n'
    for (const col of numeric) {
      summary += `  · ${col.name}: mean=${col.mean ?? '—'}, min=${col.min ?? '—'}, max=${col.max ?? '—'} (${col.count} non-empty)\n`
    }
    summary += '\n'
  }

  if (categorical.length > 0) {
    summary += 'Categorical columns:\n'
    for (const col of categorical.slice(0, 3)) {
      const top = col.topValues?.length ? ` (top: ${col.topValues[0].value})` : ''
      summary += `  · ${col.name}: ${col.distinct} distinct${top}\n`
    }
    if (categorical.length > 3) summary += `  · …and ${categorical.length - 3} more\n`
    summary += '\n'
  }

  if (empty.length > 0) {
    summary += `Empty columns: ${empty.map((c) => c.name).join(', ')}\n`
  }

  return summary.trimEnd()
}

export async function analyzeData(
  input: z.infer<typeof dataAnalyzeInputSchema>
): Promise<z.infer<typeof dataAnalysisOutputSchema>> {
  let parsed: ParsedCsv
  try {
    parsed = parseCsv(input.csv)
  } catch (err) {
    return {
      summary: '',
      columns: [],
      chart: { kind: 'bar', title: 'Parse failed' },
      rowCount: 0,
      parseError: err instanceof Error ? err.message : String(err)
    }
  }

  const columns = computeColumnStats(parsed.headers, parsed.rows)
  const chart = buildChartSpec(columns, parsed.headers, parsed.rows, input.instruction, input.focusColumn)
  const summary = summarize(parsed, columns, input.instruction)

  return {
    summary,
    columns,
    chart,
    rowCount: parsed.rows.length
  }
}
