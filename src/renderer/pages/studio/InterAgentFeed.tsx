import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Scrollbar } from '@cherrystudio/ui'
import { useIpcOn } from '@renderer/ipc'

interface AgentMessage {
  id: string
  fromTaskId: string
  toTaskId: string
  content: string
  createdAt: number
}

/**
 * Live feed of direct inter-agent messages. Specialists send each other
 * messages via `<agent_message>` tags; the scheduler parses and routes them,
 * and this component renders the conversation as it happens. Messages sent
 * to a not-yet-started task are buffered and flushed when it launches, so the
 * feed stays in causal order.
 */
export function InterAgentFeed({ runId }: { runId: string | null }) {
  const { t } = useTranslation()
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [titles, setTitles] = useState<Record<string, string>>({})
  const bottomRef = useRef<HTMLDivElement>(null)

  useIpcOn('agent.team.task.message.sent', (payload) => {
    if (payload.runId !== runId) return
    setMessages((prev) => [
      ...prev,
      {
        id: payload.messageId,
        fromTaskId: payload.fromTaskId,
        toTaskId: payload.toTaskId,
        content: payload.content,
        createdAt: payload.createdAt
      }
    ])
  })

  useIpcOn('agent.team.task.message.received', (payload) => {
    if (payload.runId !== runId) return
    setMessages((prev) => {
      if (prev.some((m) => m.id === payload.messageId)) return prev
      return [
        ...prev,
        {
          id: payload.messageId,
          fromTaskId: payload.fromTaskId,
          toTaskId: payload.taskId,
          content: payload.content,
          createdAt: payload.createdAt
        }
      ]
    })
  })

  useIpcOn('agent.team.task.queued', (payload) => {
    if (payload.runId !== runId) return
    setTitles((prev) => ({ ...prev, [payload.taskId]: payload.title }))
  })

  useEffect(() => {
    if (messages.length === 0) return
    const el = bottomRef.current
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t('studio.no_messages')}</div>
    )
  }

  return (
    <div className="grid gap-3">
      <h3 className="text-sm font-medium">{t('studio.inter_agent')}</h3>
      <Scrollbar className="max-h-[60vh] overflow-auto rounded-lg border bg-card p-4" autoHideScrollbar>
        <div className="grid gap-2">
          {messages.map((m) => (
            <div key={m.id} className="rounded-md bg-muted/40 p-2 text-sm">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{titles[m.fromTaskId] ?? m.fromTaskId}</span>
                <span>→</span>
                <span>{titles[m.toTaskId] ?? m.toTaskId}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-foreground">{m.content}</p>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </Scrollbar>
    </div>
  )
}
