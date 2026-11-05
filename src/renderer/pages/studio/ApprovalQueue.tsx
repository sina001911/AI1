import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@cherrystudio/ui'
import { useIpcOn } from '@renderer/ipc'
import { TaskStatusBadge } from '@renderer/pages/studio/TaskStatusBadge'
import { useTeamApi } from '@renderer/pages/studio/useTeamApi'

/**
 * A task whose `gate` is `approval` or `review` pauses the run until a human
 * decides. This component shows one card per pending gate with Approve / Reject
 * actions and an optional reason. Approvals are answered through
 * `agent.team.run.approve_task`; the scheduler resolves the gate promise and
 * resumes the run.
 */
interface PendingApproval {
  runId: string
  taskId: string
  title: string
  gate: 'approval' | 'review'
}

export function ApprovalQueue({
  runId,
  onResolved
}: {
  runId: string | null
  onResolved?: (runId: string, taskId: string, approved: boolean) => void
}) {
  const { t } = useTranslation()
  const { approveTask } = useTeamApi()
  const [pending, setPending] = useState<PendingApproval[]>([])
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [acting, setActing] = useState<Record<string, boolean>>({})

  useIpcOn('agent.team.task.approval_requested', (payload) => {
    if (payload.runId !== runId) return
    setPending((prev) => {
      if (prev.some((p) => p.taskId === payload.taskId)) return prev
      return [
        ...prev,
        {
          runId: payload.runId,
          taskId: payload.taskId,
          title: payload.taskId,
          gate: payload.gate as 'approval' | 'review'
        }
      ]
    })
  })

  useIpcOn('agent.team.task.approval_resolved', (payload) => {
    if (payload.runId !== runId) return
    setPending((prev) => prev.filter((p) => p.taskId !== payload.taskId))
    onResolved?.(payload.runId, payload.taskId, payload.approved)
  })

  useIpcOn('agent.team.task.queued', (payload) => {
    if (payload.runId !== runId) return
    setPending((prev) => prev.map((p) => (p.taskId === payload.taskId ? { ...p, title: payload.title } : p)))
  })

  const decide = async (task: PendingApproval, approved: boolean) => {
    setActing((prev) => ({ ...prev, [task.taskId]: true }))
    try {
      await approveTask(task.runId, task.taskId, approved, reasons[task.taskId])
    } finally {
      setActing((prev) => ({ ...prev, [task.taskId]: false }))
    }
  }

  if (pending.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        {t('studio.no_approvals')}
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <h3 className="text-sm font-medium">
        {t('studio.approval_requested')} ({pending.length})
      </h3>
      {pending.map((p) => (
        <div key={p.taskId} className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TaskStatusBadge status="pending" />
              <span className="truncate font-medium">{p.title}</span>
            </div>
            <span className="text-xs text-muted-foreground capitalize">{p.gate}</span>
          </div>
          <div className="mt-3 grid gap-2">
            <input
              value={reasons[p.taskId] ?? ''}
              onChange={(e) => setReasons((prev) => ({ ...prev, [p.taskId]: e.target.value }))}
              placeholder={t('studio.approval_reason')}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="flex justify-end gap-2">
              <Button variant="destructive" size="sm" onClick={() => decide(p, false)} disabled={acting[p.taskId]}>
                {t('studio.reject')}
              </Button>
              <Button size="sm" onClick={() => decide(p, true)} disabled={acting[p.taskId]}>
                {t('studio.approve')}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
