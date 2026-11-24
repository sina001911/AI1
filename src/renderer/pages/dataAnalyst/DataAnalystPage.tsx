import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Button,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea
} from '@cherrystudio/ui'
import { loggerService } from '@logger'
import { Chart } from '@renderer/components/Chart'
import { Navbar } from '@renderer/components/Navbar'
import Scrollbar from '@renderer/components/Scrollbar'
import { ipcApi } from '@renderer/ipc'
import type { DataAnalysisColumnStat, DataAnalysisOutput } from '@shared/ai/builtinTools'

const logger = loggerService.withContext('dataAnalyst')

export const DataAnalystPage = () => {
  const { t } = useTranslation()
  const [csv, setCsv] = useState('')
  const [instruction, setInstruction] = useState('Summarize this data and show a useful chart.')
  const [focusColumn, setFocusColumn] = useState('')
  const [result, setResult] = useState<DataAnalysisOutput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleAnalyze = async () => {
    setError(null)
    setResult(null)
    setLoading(true)
    try {
      const output = await ipcApi.request('data.analyze', {
        csv,
        instruction,
        focusColumn: focusColumn.trim() || undefined
      })
      if (output.parseError) {
        setError(t('data_analyst.parse_error', { error: output.parseError }))
      }
      setResult(output)
    } catch (err) {
      logger.error('data.analyze failed', err instanceof Error ? err : { error: String(err) })
      setError(err instanceof Error ? err.message : t('data_analyst.parse_error', { error: 'unknown' }))
    } finally {
      setLoading(false)
    }
  }

  if (!result) {
    return (
      <div className="flex h-full flex-col">
        <Navbar title={t('title.data_analyst')} />
        <Scrollbar className="flex-1">
          <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6">
            <InputForm
              csv={csv}
              instruction={instruction}
              focusColumn={focusColumn}
              onCsvChange={setCsv}
              onInstructionChange={setInstruction}
              onFocusColumnChange={setFocusColumn}
              onAnalyze={handleAnalyze}
              loading={loading}
              error={error}
            />
            <div className="rounded-xl border border-border-subtle bg-card p-6 text-center">
              <p className="text-muted-foreground">{t('data_analyst.empty_summary')}</p>
            </div>
          </div>
        </Scrollbar>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <Navbar title={t('title.data_analyst')} />
      <Scrollbar className="flex-1">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6">
          <InputForm
            csv={csv}
            instruction={instruction}
            focusColumn={focusColumn}
            onCsvChange={setCsv}
            onInstructionChange={setInstruction}
            onFocusColumnChange={setFocusColumn}
            onAnalyze={handleAnalyze}
            loading={loading}
            error={error}
          />
          <ResultView result={result} />
        </div>
      </Scrollbar>
    </div>
  )
}

function InputForm({
  csv,
  instruction,
  focusColumn,
  onCsvChange,
  onInstructionChange,
  onFocusColumnChange,
  onAnalyze,
  loading,
  error
}: {
  csv: string
  instruction: string
  focusColumn: string
  onCsvChange: (v: string) => void
  onInstructionChange: (v: string) => void
  onFocusColumnChange: (v: string) => void
  onAnalyze: () => void
  loading: boolean
  error: string | null
}) {
  const { t } = useTranslation()
  return (
    <div className="grid w-full gap-4 md:grid-cols-3 items-end">
      <div className="col-span-3 md:col-span-2">
        <Label>{t('data_analyst.csv_label')}</Label>
        <Textarea.Input
          value={csv}
          onChange={(e) => onCsvChange(e.target.value)}
          placeholder={t('data_analyst.csv_placeholder')}
          className="h-48"
        />
      </div>
      <div>
        <Label>{t('data_analyst.instruction_label')}</Label>
        <Input
          value={instruction}
          onChange={(e) => onInstructionChange(e.target.value)}
          placeholder={t('data_analyst.instruction_placeholder')}
        />
      </div>
      <div>
        <Label>{t('data_analyst.focus_column_label')}</Label>
        <Input
          value={focusColumn}
          onChange={(e) => onFocusColumnChange(e.target.value)}
          placeholder={t('data_analyst.focus_column_placeholder')}
        />
      </div>
      <Button onClick={onAnalyze} disabled={loading} className="w-full">
        {loading ? t('data_analyst.analyzing') : t('data_analyst.analyze')}
      </Button>
      {error && (
        <div className="col-span-3 rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  )
}

function ResultView({ result }: { result: DataAnalysisOutput }) {
  const { t } = useTranslation()
  return (
    <div className="grid w-full gap-6 md:grid-cols-12">
      <div className="col-span-12 md:col-span-4">
        <h2 className="text-base font-semibold text-foreground">{t('data_analyst.summary')}</h2>
        <div className="mt-2 rounded-xl border border-border-subtle bg-card p-4 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {result.summary || t('data_analyst.empty_summary')}
        </div>
        {result.parseError && (
          <div className="mt-3 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {t('data_analyst.parse_error', { error: result.parseError })}
          </div>
        )}
      </div>
      <div className="col-span-12 md:col-span-4">
        <h2 className="text-base font-semibold text-foreground">{t('data_analyst.column_stats')}</h2>
        <ColumnStatsTable columns={result.columns} />
      </div>
      <div className="col-span-12 md:col-span-4">
        <h2 className="text-base font-semibold text-foreground">{t('data_analyst.chart')}</h2>
        <ChartView chart={result.chart} />
      </div>
    </div>
  )
}

function ColumnStatsTable({ columns }: { columns: DataAnalysisColumnStat[] }) {
  const { t } = useTranslation()
  if (columns.length === 0) {
    return <div className="text-sm text-muted-foreground">{t('data_analyst.empty_summary')}</div>
  }
  return (
    <div className="rounded-xl border border-border-subtle bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('data_analyst.col_name')}</TableHead>
            <TableHead className="w-20">{t('data_analyst.col_type')}</TableHead>
            <TableHead className="w-20">{t('data_analyst.col_count')}</TableHead>
            <TableHead className="w-24">{t('data_analyst.col_distinct')}</TableHead>
            <TableHead>{t('data_analyst.col_top')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {columns.map((col) => (
            <TableRow key={col.name}>
              <TableCell className="font-medium">{col.name}</TableCell>
              <TableCell>
                <span className="rounded-md border border-border-subtle bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {columnTypeLabel(col.type)}
                </span>
              </TableCell>
              <TableCell className="text-numeric">{col.count}</TableCell>
              <TableCell className="text-numeric">{col.distinct}</TableCell>
              <TableCell>{columnDetails(col)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function columnTypeLabel(type: DataAnalysisColumnStat['type']) {
  switch (type) {
    case 'numeric':
      return 'Numeric'
    case 'categorical':
      return 'Categorical'
    case 'empty':
      return 'Empty'
  }
}

function columnDetails(col: DataAnalysisColumnStat) {
  if (col.type === 'numeric') {
    return `mean=${col.mean ?? '—'}, min=${col.min ?? '—'}, max=${col.max ?? '—'}`
  }
  if (col.type === 'categorical' && col.topValues?.[0]) {
    const top = col.topValues[0]
    return `top: ${top.value} (${top.count}×)`
  }
  return '—'
}

function ChartView({ chart }: { chart: NonNullable<DataAnalysisOutput['chart']> }) {
  const { t } = useTranslation()
  if (chart.kind === 'pie') {
    const data = (chart.series ?? []).flatMap((s) => s.data ?? []).map((d) => ({ name: d.name, value: d.value }))
    return (
      <div className="rounded-xl border border-border-subtle bg-card p-4">
        <Chart type="pie" ariaLabel={chart.title ?? t('data_analyst.chart')} data={data} />
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-border-subtle bg-card p-4">
      <Chart
        type={chart.kind}
        ariaLabel={chart.title ?? t('data_analyst.chart')}
        categories={(chart.categories ?? []) as Array<number | string>}
        series={(chart.series ?? []).map((s) => ({
          name: s.name,
          values: s.values ?? []
        }))}
      />
    </div>
  )
}

export default DataAnalystPage
