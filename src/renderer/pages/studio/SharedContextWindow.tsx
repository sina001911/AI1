import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Scrollbar } from '@cherrystudio/ui'
import { useIpcOn } from '@renderer/ipc'

interface ContextEntry {
  id: string
  authorTaskId: string
  title: string
  delta: string
  createdAt: number
}

/**
 * Append-only shared context window. Specialists append their completed
 * output here; later specialists read the snapshot as part of their prompt.
 * The window scrolls to the bottom as new entries arrive so the freshest
 * context stays visible.
 */
export function SharedContextWindow({ runId }: { runId: string | null }) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<ContextEntry[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useIpcOn('agent.team.context.updated', (payload) => {
    if (payload.runId !== runId) return
    setEntries((prev) => [
      ...prev,
      {
        id: `${payload.authorTaskId}:${prev.length}`,
        authorTaskId: payload.authorTaskId,
        title: payload.authorTaskId,
        delta: payload.delta,
        createdAt: Date.now()
      }
    ])
  })

  // Re-hydrate titles from queued/started events so each entry shows the
  // task's real name rather than its id.
  useIpcOn('agent.team.task.queued', (payload) => {
    if (payload.runId !== runId) return
    setEntries((prev) => prev.map((e) => (e.authorTaskId === payload.taskId ? { ...e, title: payload.title } : e)))
  })

  useEffect(() => {
    if (entries.length === 0) return
    const el = bottomRef.current
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [entries.length])

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        {t('studio.shared_context_empty')}
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <h3 className="text-sm font-medium">{t('studio.shared_context')}</h3>
      <Scrollbar className="max-h-[60vh] overflow-auto rounded-lg border bg-card p-4" autoHideScrollbar>
        <div className="grid gap-3">
          {entries.map((e) => (
            <div key={e.id} className="grid gap-1 border-b pb-3 last:border-b-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{e.title}</span>
                <span>·</span>
                <span>{t('studio.context')}</span>
              </div>
              <pre className="whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">{e.delta}</pre>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </Scrollbar>
    </div>
  )
}
