/**
 * Pure domain types for Collaborative Studio.
 * No Electron, no provider SDK coupling. The host (main process) supplies
 * the execution adapter; this package only owns the model + orchestration logic.
 */

export const SPECIALIST_ROLES = ['coding', 'research', 'image', 'video', 'data-analyst', 'reviewer', 'general'] as const

export type SpecialistRole = (typeof SPECIALIST_ROLES)[number]

export const EXECUTION_STRATEGIES = ['sequential', 'parallel', 'dependency-based', 'leader-delegation'] as const

export type ExecutionStrategy = (typeof EXECUTION_STRATEGIES)[number]

export const TASK_STATUS = ['pending', 'queued', 'running', 'completed', 'failed', 'cancelled', 'retrying'] as const

export type TaskStatus = (typeof TASK_STATUS)[number]

export const RUN_STATUS = ['created', 'running', 'paused', 'completed', 'failed', 'cancelled'] as const

export type RunStatus = (typeof RUN_STATUS)[number]

export const TOOL_PERMISSIONS = ['allow', 'prompt', 'deny'] as const
export type ToolPermission = (typeof TOOL_PERMISSIONS)[number]

/** How a task's execution may be gated before it starts. */
export const TASK_GATE = ['none', 'approval', 'review'] as const
export type TaskGate = (typeof TASK_GATE)[number]

export interface SharedContextEntry {
  id: string
  taskId: string
  taskTitle: string
  delta: string
  createdAt: number
}

/** A direct message from one specialist task to another in the same run. */
export interface AgentMessage {
  id: string
  runId: string
  fromTaskId: string
  toTaskId: string
  content: string
  createdAt: number
}

/** Append-only shared context window for a run. */
export interface SharedContext {
  readonly entries: ReadonlyArray<SharedContextEntry>
  append(task: Task, delta: string): SharedContextEntry
  snapshot(): string
}

/** Model configuration — provider-agnostic shape. */
export interface ModelConfig {
  providerId: string
  modelId: string
  temperature?: number
  maxTokens?: number
}

/** Tool permission map: tool name → permission. '*' is the wildcard. */
export interface ToolPermissionMap {
  [toolName: string]: ToolPermission
}

export interface Specialist {
  id: string
  teamId: string
  name: string
  role: SpecialistRole
  modelConfig: ModelConfig
  systemPrompt: string
  toolPermissions: ToolPermissionMap
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface Leader {
  id: string
  teamId: string
  name: string
  modelConfig: ModelConfig
  systemPrompt: string
  createdAt: number
  updatedAt: number
}

export interface Team {
  id: string
  name: string
  description: string
  strategy: ExecutionStrategy
  maxConcurrency: number
  leader: Leader
  specialists: Specialist[]
  createdAt: number
  updatedAt: number
}

export interface Task {
  id: string
  teamId: string
  parentId: string | null
  title: string
  description: string
  assignedTo: string | null
  dependencies: string[]
  status: TaskStatus
  /** When non-'none', the scheduler holds the task here until the gate resolves. */
  gate: TaskGate
  input: string
  output: string | null
  error: string | null
  retryCount: number
  maxRetries: number
  createdAt: number
  startedAt: number | null
  completedAt: number | null
}

export interface ExecutionPlan {
  teamId: string
  objective: string
  tasks: Task[]
  strategy: ExecutionStrategy
  reasoning: string
  createdAt: number
}

export interface ExecutionRun {
  id: string
  teamId: string
  objective: string
  status: RunStatus
  plan: ExecutionPlan | null
  result: string | null
  error: string | null
  startedAt: number
  completedAt: number | null
  cancelledAt: number | null
}

export type TeamEvent =
  | { type: 'run_started'; runId: string }
  | { type: 'plan_created'; runId: string; plan: ExecutionPlan }
  | { type: 'task_queued'; runId: string; task: Task }
  | { type: 'task_started'; runId: string; taskId: string }
  | { type: 'task_progress'; runId: string; taskId: string; delta: string }
  | { type: 'task_completed'; runId: string; task: Task }
  | { type: 'task_failed'; runId: string; taskId: string; error: string; willRetry: boolean }
  | { type: 'task_cancelled'; runId: string; taskId: string }
  | { type: 'synthesis_started'; runId: string }
  | { type: 'synthesis_completed'; runId: string; result: string }
  | { type: 'run_completed'; runId: string; result: string }
  | { type: 'run_failed'; runId: string; error: string }
  | { type: 'run_cancelled'; runId: string }
  | { type: 'task_approval_requested'; runId: string; taskId: string; gate: TaskGate; reason?: string }
  | {
      type: 'task_approval_resolved'
      runId: string
      taskId: string
      gate: TaskGate
      approved: boolean
      reason?: string
    }
  | { type: 'context_updated'; runId: string; delta: string; authorTaskId: string }
  | { type: 'task_message_sent'; runId: string; message: AgentMessage }
  | { type: 'task_message_received'; runId: string; taskId: string; message: AgentMessage }

export interface ExecutionResult {
  runId: string
  status: RunStatus
  result: string | null
  error: string | null
  tasks: Task[]
}

/** Callback the host provides to execute a single specialist task. */
export interface SpecialistExecutor {
  (
    task: Task,
    specialist: Specialist,
    signal: AbortSignal,
    onDelta: (delta: string) => void,
    sharedContext: SharedContext
  ): Promise<string>
}

/**
 * Deliver a direct message to a running or pending specialist task.
 * The host implementation decides whether to inject the message immediately
 * (if the task is still running) or buffer it for when the task starts.
 */
export type DirectMessageSender = (message: AgentMessage) => void

/** Options for executing a plan. */
export interface ExecutePlanOptions {
  plan: ExecutionPlan
  team: Team
  executeTask: SpecialistExecutor
  signal: AbortSignal
  onEvent: (event: TeamEvent) => void
  maxRetries?: number
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
  /** Optional callback for sending direct inter-agent messages. */
  sendMessage?: DirectMessageSender
}
