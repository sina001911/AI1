import { createId, now } from './team'
import { type ExecutionRun, type Task, type Team, type TeamEvent } from './types'

export interface ExecutionHistoryEntry {
  id: string
  teamId: string
  teamName: string
  objective: string
  status: ExecutionRun['status']
  taskCount: number
  completedCount: number
  failedCount: number
  durationMs: number | null
  result: string | null
  error: string | null
  startedAt: number
  completedAt: number | null
  events: TeamEvent[]
}

export function recordRun(run: ExecutionRun, team: Team, tasks: Task[], events: TeamEvent[]): ExecutionHistoryEntry {
  const completed = tasks.filter((t) => t.status === 'completed')
  const failed = tasks.filter((t) => t.status === 'failed')
  return {
    id: run.id,
    teamId: run.teamId,
    teamName: team.name,
    objective: run.objective,
    status: run.status,
    taskCount: tasks.length,
    completedCount: completed.length,
    failedCount: failed.length,
    durationMs: run.completedAt != null && run.startedAt != null ? run.completedAt - run.startedAt : null,
    result: run.result,
    error: run.error,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    events
  }
}

export function summarizeHistory(entries: ExecutionHistoryEntry[]): string {
  if (entries.length === 0) return 'No previous runs.'
  const lines: string[] = []
  for (const e of entries.slice(-10)) {
    const status = e.status
    const dur = e.durationMs != null ? ` (${(e.durationMs / 1000).toFixed(1)}s)` : ''
    lines.push(`- [${status}] ${e.objective} — ${e.completedCount}/${e.taskCount} tasks${dur}`)
  }
  return lines.join('\n')
}

export function filterHistory(
  entries: ExecutionHistoryEntry[],
  filters: { teamId?: string; status?: ExecutionRun['status']; search?: string }
): ExecutionHistoryEntry[] {
  return entries.filter((e) => {
    if (filters.teamId && e.teamId !== filters.teamId) return false
    if (filters.status && e.status !== filters.status) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (!e.objective.toLowerCase().includes(q) && !e.teamName.toLowerCase().includes(q)) return false
    }
    return true
  })
}

export function toRunRecord(entry: ExecutionHistoryEntry): ExecutionRun {
  return {
    id: entry.id,
    teamId: entry.teamId,
    objective: entry.objective,
    status: entry.status,
    plan: null,
    result: entry.result,
    error: entry.error,
    startedAt: entry.startedAt,
    completedAt: entry.completedAt,
    cancelledAt: entry.status === 'cancelled' ? (entry.completedAt ?? null) : null
  }
}

export function createRunId(): string {
  return createId()
}

export function timestamp(): number {
  return now()
}
