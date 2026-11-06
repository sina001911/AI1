import { createSharedContext } from './context'
import { executePlan, createCancellationController } from './scheduler'
import { buildSynthesisPrompt } from './synthesis'
import {
  type AgentMessage,
  type ArtifactRegistry,
  type ExecutionPlan,
  type ExecutionResult,
  type ProjectWorkspace,
  type QualityReview,
  type SharedContext,
  type SpecialistExecutor,
  type TaskGate,
  type Team,
  type TeamEvent
} from './types'

export interface OrchestrateOptions {
  runId: string
  plan: ExecutionPlan
  team: Team
  executeTask: SpecialistExecutor
  synthesize: (input: { runId: string; objective: string; tasks: ExecutionPlan['tasks'] }) => Promise<string>
  onEvent: (event: TeamEvent) => void
  maxRetries?: number
  /** True while the Leader has requested a pause. Checked between task dispatches. */
  shouldPause?: () => boolean
  /** Awaited by the scheduler when it reaches the pause point with no tasks running. */
  waitForResume?: () => Promise<void>
  /**
   * AbortSignal the host owns. When supplied, cancellation flows through it
   * instead of the internal controller, so a host `AbortController.abort()`
   * stops the run. The matching `cancel` fn is a no-op by default.
   */
  signal?: AbortSignal
  cancel?: () => void
  /** Append-only shared context specialists read and write during execution. */
  sharedContext?: SharedContext
  /**
   * Called when a task's gate requires a human decision. The scheduler waits
   * on the returned promise before dispatching the task. `approved: false`
   * (or a thrown rejection) marks the task failed with `gate rejected`.
   */
  onApprovalRequest?: (input: {
    runId: string
    task: ExecutionPlan['tasks'][number]
    gate: TaskGate
    signal: AbortSignal
  }) => Promise<{ approved: boolean; reason?: string }>
  /** Optional callback fired when a specialist sends a direct message. */
  sendMessage?: (message: AgentMessage) => void
  /** Optional host-provided artifact registry. When supplied, the scheduler
   * records artifacts produced by each task and routes them to consumers. */
  artifactRegistry?: ArtifactRegistry
  /** Optional host-provided project workspace. When supplied, the scheduler
   * locks files before a task writes them and unlocks after, preventing
   * concurrent modification. */
  workspace?: ProjectWorkspace
  /**
   * Optional callback for requesting an independent quality review of a
   * task's output before it is treated as final.
   */
  onReviewRequest?: (input: {
    runId: string
    taskId: string
    artifactId: string
    signal: AbortSignal
  }) => Promise<QualityReview | null>
}

export interface OrchestrateHandle {
  promise: Promise<ExecutionResult>
  /** Re-run the dispatch loop. Call after resuming a paused run. */
  step: () => void
}

export async function orchestrate(options: OrchestrateOptions): Promise<ExecutionResult> {
  return runOrchestrate(options).promise
}

export function startOrchestrate(options: OrchestrateOptions): OrchestrateHandle {
  return runOrchestrate(options)
}

function runOrchestrate(options: OrchestrateOptions): OrchestrateHandle {
  const { runId, plan, team, executeTask, synthesize, onEvent, maxRetries = 2 } = options

  onEvent({ type: 'plan_created', runId, plan })
  for (const task of plan.tasks) {
    onEvent({ type: 'task_queued', runId, task })
  }

  const { signal } = options.signal ? { signal: options.signal } : createCancellationController()
  const sharedContext = options.sharedContext ?? createSharedContext()
  const { promise, step } = executePlan({
    runId,
    plan,
    team,
    executeTask,
    signal,
    onEvent,
    maxRetries,
    shouldPause: options.shouldPause,
    waitForResume: options.waitForResume,
    sharedContext,
    onApprovalRequest: options.onApprovalRequest ?? (async () => ({ approved: true })),
    sendMessage: options.sendMessage,
    artifactRegistry: options.artifactRegistry,
    workspace: options.workspace,
    onReviewRequest: options.onReviewRequest
  })

  const resultPromise = promise.then(async (result) => {
    if (result.status === 'cancelled') {
      onEvent({ type: 'run_cancelled', runId })
      return result
    }

    if (result.status === 'failed') {
      const error = result.error ?? result.tasks.find((t) => t.status === 'failed')?.error ?? 'unknown'
      onEvent({ type: 'run_failed', runId, error })
      return { ...result, error }
    }

    onEvent({ type: 'synthesis_started', runId })
    try {
      const synthesized = await synthesize({
        runId,
        objective: plan.objective,
        tasks: result.tasks
      })
      result.result = synthesized
      onEvent({ type: 'synthesis_completed', runId, result: synthesized })
      onEvent({ type: 'run_completed', runId, result: synthesized })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.error = message
      result.status = 'failed'
      onEvent({ type: 'run_failed', runId, error: message })
    }
    return result
  })

  return { promise: resultPromise, step }
}

export function createRunController(): { signal: AbortSignal; cancel: () => void } {
  const { signal, cancel } = createCancellationController()
  return { signal, cancel }
}

export { buildSynthesisPrompt }
