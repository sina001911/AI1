import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import DataAnalystPage from '../DataAnalystPage'

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) =>
        ({
          'title.data_analyst': 'Data Analyst',
          'data_analyst.csv_label': 'CSV data',
          'data_analyst.csv_placeholder': 'Paste CSV data here (header row required)…',
          'data_analyst.instruction_label': 'Instruction',
          'data_analyst.instruction_placeholder': 'What should the summary and chart answer?…',
          'data_analyst.focus_column_label': 'Focus column (optional)',
          'data_analyst.focus_column_placeholder': 'Column name to feature in the chart…',
          'data_analyst.analyze': 'Analyze',
          'data_analyst.analyzing': 'Analyzing…',
          'data_analyst.empty_summary': 'Paste CSV data and run analysis to see results.',
          'data_analyst.parse_error': 'Parse error: {{error}}',
          'data_analyst.summary': 'Summary',
          'data_analyst.column_stats': 'Column statistics',
          'data_analyst.chart': 'Chart',
          'data_analyst.col_name': 'Column',
          'data_analyst.col_type': 'Type',
          'data_analyst.col_count': 'Non-empty',
          'data_analyst.col_distinct': 'Distinct',
          'data_analyst.col_top': 'Top value'
        })[key] ?? key
    })
  }
})

const ipcRequestMock = vi.hoisted(() => vi.fn())
const loggerErrorMock = vi.hoisted(() => vi.fn())

vi.mock('@renderer/ipc', () => ({
  ipcApi: {
    request: (...args: unknown[]) => ipcRequestMock(...args)
  }
}))

vi.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({ error: loggerErrorMock })
  }
}))

vi.mock('@renderer/components/Navbar', () => ({
  Navbar: ({ title, children }: { title?: string; children?: ReactNode }) => (
    <div data-testid="navbar">
      {title}
      {children}
    </div>
  )
}))

vi.mock('@renderer/components/Scrollbar', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

vi.mock('@renderer/components/Chart', () => ({
  Chart: (props: { type: string; ariaLabel?: string }) => (
    <div data-testid="chart" data-type={props.type} data-label={props.ariaLabel ?? ''} />
  )
}))

const emptyResult = {
  summary: '',
  columns: [],
  chart: { kind: 'bar' as const, series: [] },
  rowCount: 0
}

describe('DataAnalystPage', () => {
  beforeEach(() => {
    ipcRequestMock.mockReset()
    loggerErrorMock.mockReset()
  })

  it('renders the empty state and submits the analysis request', async () => {
    const user = userEvent.setup()
    ipcRequestMock.mockResolvedValueOnce(emptyResult)

    render(<DataAnalystPage />)

    expect(screen.getByText(/Data Analyst/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Paste CSV data here/)).toBeInTheDocument()

    const csvArea = screen.getByPlaceholderText(/Paste CSV data here/)
    fireEvent.change(csvArea, { target: { value: 'quarter,revenue\nQ1,50' } })
    const instructionInput = screen.getByPlaceholderText(/What should the summary/)
    fireEvent.change(instructionInput, { target: { value: 'Summarize revenue.' } })
    await user.click(screen.getByRole('button', { name: /Analyze/ }))

    await waitFor(() => {
      expect(ipcRequestMock).toHaveBeenCalled()
    })
    const call = ipcRequestMock.mock.calls[0]
    expect(call[0]).toBe('data.analyze')
    expect(call[1].csv).toContain('quarter')
    expect(call[1].instruction).toContain('Summarize revenue')
    expect(call[1].focusColumn).toBeUndefined()
  })

  it('surfaces IPC errors in the error banner instead of crashing', async () => {
    const user = userEvent.setup()
    ipcRequestMock.mockRejectedValueOnce(new Error('network down'))

    render(<DataAnalystPage />)

    fireEvent.change(screen.getByPlaceholderText(/Paste CSV data here/), { target: { value: 'a,b\n1,2' } })
    await user.click(screen.getByRole('button', { name: /Analyze/ }))

    await waitFor(() => {
      expect(screen.getByText(/network down/)).toBeInTheDocument()
    })
    expect(loggerErrorMock).toHaveBeenCalled()
  })
})
