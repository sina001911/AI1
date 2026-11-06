import {
  type AgentMessage,
  type Artifact,
  type ExecutePlanOptions,
  type ExecutionResult,
  type SharedContext,
  type Task,
  type TaskGate,
  type TaskStatus,
  type TeamEvent
} from './types'

/**
 * Parse `<agent_message to="taskId">content</agent_message>` tags from raw
 * LLM output and return them in document order. Tags that reference an unknown
 * task id are silently dropped so mis-specifications don't crash a run.
 */
export function parseAgentMessages(
  raw: string,
  knownTaskIds: Set<string>
): Omit<AgentMessage, 'id' | 'runId' | 'createdAt'>[] {
  const results: Omit<AgentMessage, 'id' | 'runId' | 'createdAt'>[] = []
  const re = /<agent_message\s+to=["']([^"']+)["'][^>]*>([\s\S]*?)<\/agent_message>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const toTaskId = m[1].trim()
    const content = m[2].trim()
    if (!toTaskId || !content || !knownTaskIds.has(toTaskId)) continue
    results.push({ fromTaskId: '', toTaskId, content })
  }
  return results
}

export interface SchedulerOptions extends ExecutePlanOptions {
  runId: string
  /** True when the Leader has requested a pause. Checked between task starts. */
  shouldPause?: () => boolean
  /** Resolved when the Leader resumes a paused run. Awaited before picking the next task. */
  waitForResume?: () => Promise<void>
  /** Append-only shared context specialists read and write during execution. */
  sharedContext: SharedContext
  /**
   * Called when a task's gate requires a human decision. The scheduler waits on
   * the returned promise before dispatching the task. `approved: false` (or a
   * thrown rejection) marks the task failed with `gate rejected`.
   */
  onApprovalRequest: (input: {
    runId: string
    task: Task
    gate: TaskGate
    signal: AbortSignal
  }) => Promise<{ approved: boolean; reason?: string }>
}

export function executePlan(options: SchedulerOptions): { promise: Promise<ExecutionResult>; step: () => void } {
  const { runId, plan, team, executeTask, signal, onEvent, maxRetries = 2, sharedContext, onApprovalRequest } = options
  const effectiveMaxRetries = Math.max(0, maxRetries)
  const tasks = new Map(plan.tasks.map((t) => [t.id, t]))
  const results = new Map<string, Task>()
  const completed = new Set<string>()
  const failed = new Set<string>()
  const cancelled = new Set<string>()
  const active = new Map<string, Promise<void>>()
  const gatePending = new Set<string>()
  const taskErrors = new Map<string, string>()
  /** Messages sent to tasks that have not yet started; delivered on launch. */
  const pendingMessages = new Map<string, AgentMessage[]>()
  let slots = team.maxConcurrency
  const runError: string | null = null
  let messageSeq = 0

  const emit = (event: TeamEvent): void => onEvent(event)

  function nextMessageId(runId: string, toTaskId: string, content: string): AgentMessage {
    return {
      id: `${runId}:msg:${++messageSeq}`,
      runId,
      fromTaskId: '',
      toTaskId,
      content,
      createdAt: Date.now()
    }
  }

  function canRun(task: Task): boolean {
    return (
      task.dependencies.every((d) => completed.has(d)) &&
      !failed.has(task.id) &&
      !cancelled.has(task.id) &&
      !gatePending.has(task.id)
    )
  }

  function readyTasks(): Task[] {
    const out: Task[] = []
    for (const t of tasks.values()) {
      if ((t.status === 'pending' || t.status === 'queued') && canRun(t)) out.push(t)
    }
    return out
  }

  function updateStatus(task: Task, status: TaskStatus): Task {
    const next: Task = { ...task, status }
    if (status === 'running' && task.startedAt == null) next.startedAt = Date.now()
    if ((status === 'completed' || status === 'failed' || status === 'cancelled') && task.completedAt == null) {
      next.completedAt = Date.now()
    }
    tasks.set(task.id, next)
    results.set(task.id, next)
    return next
  }

  function pickNext(): Task | null {
    const ready = readyTasks()
    if (ready.length === 0) return null
    if (team.strategy === 'sequential') return ready[0]
    return ready[0]
  }

  /** Flush buffered messages destined for `taskId` into `onDelta` by appending them as
   *  synthetic prelude text that the specialist will see at the top of its output. */
  function flushIncomingMessages(taskId: string): void {
    const messages = pendingMessages.get(taskId)
    if (!messages?.length) return
    pendingMessages.delete(taskId)
    for (const msg of messages) {
      emit({ type: 'task_message_received', runId, taskId, message: msg })
    }
  }

  /**
   * Persist a completed task's output: record it as an artifact, request an
   * independent review when the task is gated for review, and write it into
   * the shared project workspace. Throws on failure so the caller can roll the
   * task back to failed instead of letting the run silently succeed.
   */
  async function finalizeTaskOutput(task: Task, output: string): Promise<void> {
    if (options.artifactRegistry) {
      const artifact = options.artifactRegistry.add({
        id: '',
        runId,
        taskId: task.id,
        name: task.title,
        type: 'text',
        contentType: 'text/plain',
        content: output,
        ref: null,
        sizeBytes: Buffer.byteLength(output, 'utf8'),
        status: 'draft',
        consumedBy: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      } as Artifact)
      emit({ type: 'artifact_created', runId, artifact })
      // Request an independent review when the task is gated for review.
      if (task.gate === 'review' && options.onReviewRequest) {
        const review = await options.onReviewRequest({
          runId,
          taskId: task.id,
          artifactId: artifact.id,
          signal
        })
        if (review) emit({ type: 'artifact_review_completed', runId, review })
      }
    }

    // Persist the task's output into the shared project workspace when one
    // is supplied. Files are locked before the write and unlocked after so
    // concurrent specialists cannot clobber each other.
    if (options.workspace) {
      const filePath = `tasks/${task.id}.md`
      const file = options.workspace.writeFile(filePath, output, task.id, 'text/markdown')
      if (file) {
        emit({ type: 'workspace_file_locked', runId, path: filePath, holderTaskId: task.id })
        emit({ type: 'workspace_file_unlocked', runId, path: filePath, holderTaskId: task.id })
        // Surface the file in shared context so later specialists see it.
        sharedContext.append(task, `Workspace file: ${filePath}`)
      }
    }
  }

  async function runTask(task: Task): Promise<void> {
    const specialist = team.specialists.find((s) => s.id === task.assignedTo)
    if (!specialist || !specialist.enabled) {
      const err = `Specialist ${task.assignedTo} not found or disabled`
      taskErrors.set(task.id, err)
      failed.add(task.id)
      updateStatus({ ...task, error: err }, 'failed')
      emit({ type: 'task_failed', runId, taskId: task.id, error: err, willRetry: false })
      return
    }

    // Flush any messages buffered while this task was waiting for its turn.
    flushIncomingMessages(task.id)

    // Gate: hold the task until a human decision resolves it. The gate is
    // evaluated once per task, not per retry — a rejected task never re-gates.
    if (task.gate !== 'none') {
      gatePending.add(task.id)
      emit({ type: 'task_approval_requested', runId, taskId: task.id, gate: task.gate })
      let approved = false
      let gateReason: string | undefined
      try {
        const decision = await onApprovalRequest({ runId, task, gate: task.gate, signal })
        approved = decision.approved
        gateReason = decision.reason
      } catch (err) {
        gateReason = err instanceof Error ? err.message : String(err)
      }
      emit({
        type: 'task_approval_resolved',
        runId,
        taskId: task.id,
        gate: task.gate,
        approved,
        reason: gateReason
      })
      gatePending.delete(task.id)
      if (!approved) {
        const err = gateReason ?? `gate '${task.gate}' rejected`
        taskErrors.set(task.id, err)
        failed.add(task.id)
        updateStatus({ ...task, error: err }, 'failed')
        emit({ type: 'task_failed', runId, taskId: task.id, error: err, willRetry: false })
        return
      }
    }

    let lastError: string | null = null
    for (let attempt = 0; attempt <= effectiveMaxRetries; attempt++) {
      if (signal.aborted) {
        cancelled.add(task.id)
        updateStatus(task, 'cancelled')
        emit({ type: 'task_cancelled', runId, taskId: task.id })
        return
      }
      if (attempt > 0) {
        const retrying = updateStatus(task, 'retrying')
        emit({ type: 'task_failed', runId, taskId: task.id, error: lastError ?? 'unknown', willRetry: true })
        task = retrying
      } else {
        const running = updateStatus(task, 'running')
        emit({ type: 'task_started', runId, taskId: task.id })
        task = running
      }
      try {
        const output = await executeTask(
          task,
          specialist,
          signal,
          (delta: string) => {
            emit({ type: 'task_progress', runId, taskId: task.id, delta })
          },
          sharedContext
        )
        if (signal.aborted) {
          cancelled.add(task.id)
          updateStatus(task, 'cancelled')
          emit({ type: 'task_cancelled', runId, taskId: task.id })
          return
        }
        const done = updateStatus({ ...task, output }, 'completed')
        completed.add(task.id)
        emit({ type: 'task_completed', runId, task: done })

        // Route any <agent_message> tags in the output to their targets.
        const knownIds = new Set(plan.tasks.map((t) => t.id))
        const parsed = parseAgentMessages(output, knownIds)
        for (const p of parsed) {
          const msg = nextMessageId(runId, p.toTaskId, p.content)
          ;(msg as AgentMessage & { fromTaskId: string }).fromTaskId = task.id
          emit({ type: 'task_message_sent', runId, message: msg })
          // Buffer for delivery. If the target is already running, deliver
          // now so the UI can show it live; if it hasn't started, it will be
          // flushed when it launches via flushIncomingMessages.
          const list = pendingMessages.get(p.toTaskId) ?? []
          list.push(msg)
          pendingMessages.set(p.toTaskId, list)
          if (active.has(p.toTaskId)) {
            emit({ type: 'task_message_received', runId, taskId: p.toTaskId, message: msg })
          }
          options.sendMessage?.(msg)
        }

        // Append the completed task's output to the shared context so later
        // specialists build on it. Empty output is skipped silently.
        const entry = sharedContext.append(task, output)
        if (entry.delta.length > 0) {
          emit({ type: 'context_updated', runId, delta: entry.delta, authorTaskId: task.id })
        }

        // Record artifacts, request reviews, and persist workspace files.
        // These run after the task is marked completed; if any of them fail we
        // roll the task back to failed so the run does not silently succeed.
        try {
          await finalizeTaskOutput(task, output)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          completed.delete(task.id)
          failed.add(task.id)
          taskErrors.set(task.id, message)
          updateStatus({ ...task, error: message }, 'failed')
          emit({ type: 'task_failed', runId, taskId: task.id, error: message, willRetry: false })
          return
        }
        return
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        taskErrors.set(task.id, lastError)
        if (signal.aborted) {
          cancelled.add(task.id)
          updateStatus(task, 'cancelled')
          emit({ type: 'task_cancelled', runId, taskId: task.id })
          return
        }
        if (attempt < effectiveMaxRetries) continue
        failed.add(task.id)
        updateStatus({ ...task, error: lastError }, 'failed')
        emit({ type: 'task_failed', runId, taskId: task.id, error: lastError, willRetry: false })
        return
      }
    }
  }

  let resolvePromise: (value: ExecutionResult) => void
  const tickRef: { current?: () => void } = {}
  const promise = new Promise<ExecutionResult>((resolve) => {
    resolvePromise = resolve
    const tick = (): void => {
      if (signal.aborted) {
        emit({ type: 'run_cancelled', runId })
        resolvePromise({
          runId,
          status: 'cancelled',
          result: null,
          error: 'Run cancelled by user',
          tasks: Array.from(results.values())
        })
        return
      }
      if (options.shouldPause?.()) {
        // Running tasks are left in flight; only new dispatch stops. When
        // nothing is running, hand off to the resume waiter instead of
        // resolving — the Leader may resume before any task finishes.
        if (active.size === 0) {
          if (options.waitForResume) {
            void options.waitForResume().then(tick)
          } else {
            resolvePromise({
              runId,
              status: 'paused',
              result: null,
              error: null,
              tasks: Array.from(results.values())
            })
          }
        }
        return
      }
      while (slots > 0) {
        const task = pickNext()
        if (!task) break
        slots -= 1
        const p = runTask(task).finally(() => {
          slots += 1
          active.delete(task.id)
          tick()
        })
        active.set(task.id, p)
      }
      if (active.size === 0) {
        const allDone = Array.from(tasks.values()).every(
          (t) => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled'
        )
        if (allDone) {
          resolvePromise({
            runId,
            status: failed.size > 0 || runError ? 'failed' : 'completed',
            result: null,
            error: runError,
            tasks: Array.from(results.values())
          })
        }
      }
    }
    tickRef.current = tick
    tick()
  })
  return {
    promise,
    // Re-run the dispatch loop. The Leader calls this after resuming a paused
    // run so pending tasks start without awaiting a running task to finish.
    step: () => tickRef.current?.()
  }
}

export function createCancellationController(): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController()
  return { signal: controller.signal, cancel: () => controller.abort() }
}
