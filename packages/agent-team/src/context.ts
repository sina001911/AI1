import { type SharedContext } from './types'

/**
 * Create an empty shared context window for a run.
 *
 * Specialists append their output as they complete; later specialists read the
 * snapshot as part of their system prompt. A cancelled run's controller drops
 * its reference so the buffer is GC'd with no lingering listeners.
 */
export function createSharedContext(): SharedContext {
  const entries: { id: string; taskId: string; taskTitle: string; delta: string; createdAt: number }[] = []
  return {
    get entries() {
      return entries
    },
    append(task, delta) {
      const entry = {
        id: `${task.id}:${entries.length}`,
        taskId: task.id,
        taskTitle: task.title,
        delta: delta.trim(),
        createdAt: Date.now()
      }
      if (entry.delta.length === 0) return entry
      entries.push(entry)
      return entry
    },
    snapshot() {
      if (entries.length === 0) return ''
      const lines: string[] = ['=== SHARED CONTEXT ===']
      for (const e of entries) {
        lines.push(`--- ${e.taskTitle} (${e.taskId}) ---`)
        lines.push(e.delta)
        lines.push('')
      }
      return lines.join('\n').trimEnd()
    }
  }
}
