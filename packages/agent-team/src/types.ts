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
  | { type: 'artifact_created'; runId: string; artifact: Artifact }
  | { type: 'artifact_consumed'; runId: string; artifactId: string; consumerTaskId: string }
  | { type: 'artifact_review_requested'; runId: string; taskId: string; artifactId: string }
  | { type: 'artifact_review_completed'; runId: string; review: QualityReview }
  | { type: 'conflict_detected'; runId: string; conflict: OutputConflict }
  | { type: 'conflict_resolved'; runId: string; conflict: OutputConflict }
  | { type: 'workspace_file_locked'; runId: string; path: string; holderTaskId: string }
  | { type: 'workspace_file_unlocked'; runId: string; path: string; holderTaskId: string }

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

// ── Artifact exchange ──────────────────────────────────────────────────────

/** The lifecycle stage of an artifact produced during a run. */
export const ARTIFACT_STATUS = ['draft', 'final', 'superseded', 'rejected'] as const
export type ArtifactStatus = (typeof ARTIFACT_STATUS)[number]

/** A concrete deliverable produced by a specialist during a run. */
export interface Artifact {
  id: string
  runId: string
  taskId: string
  name: string
  type: ArtifactType
  /** MIME-like content type, e.g. 'text/markdown', 'image/png', 'application/json'. */
  contentType: string
  /** Inline content for text-sized artifacts. */
  content: string | null
  /** External storage reference for large/binary artifacts (file path, URL, handle). */
  ref: string | null
  sizeBytes: number
  status: ArtifactStatus
  /** Who consumed this artifact and what they produced from it. */
  consumedBy: string[]
  createdAt: number
  updatedAt: number
}

export const ARTIFACT_TYPES = [
  'text',
  'code',
  'image',
  'video',
  'audio',
  'document',
  'data',
  'asset',
  'other'
] as const
export type ArtifactType = (typeof ARTIFACT_TYPES)[number]

/** A claim about an artifact that another agent can verify or dispute. */
export interface ArtifactClaim {
  id: string
  artifactId: string
  taskId: string
  claim: string
  confidence: number
  verified: boolean
  createdAt: number
}

// ── Agent capabilities ─────────────────────────────────────────────────────

/** Concrete tool a specialist is allowed to invoke. */
export interface ToolCapability {
  name: string
  description: string
  permission: ToolPermission
  /** Estimated cost/latency tier; used by the scheduler for routing. */
  cost: 'cheap' | 'moderate' | 'expensive'
}

/**
 * Capability profile for a specialist. Capability-based routing means a task
 * is dispatched to the specialist that can actually perform it, not the one
 * whose role keyword happens to match.
 */
export interface AgentCapabilities {
  specialistId: string
  tools: ToolCapability[]
  /** Model features the specialist's model supports. */
  features: AgentFeature[]
  /** Throughput hint: tasks per hour this specialist can absorb. */
  throughputHint: number
  /** True when the specialist's model supports image input. */
  supportsVision: boolean
  /** True when the specialist's model supports audio input. */
  supportsAudio: boolean
  /** True when the specialist's model supports tool calling. */
  supportsTools: boolean
  /** Last time this capability profile was refreshed. */
  updatedAt: number
}

export const AGENT_FEATURES = [
  'text',
  'code',
  'image_generation',
  'image_editing',
  'video_generation',
  'video_analysis',
  'audio_transcription',
  'audio_generation',
  'web_search',
  'web_fetch',
  'file_read',
  'file_write',
  'shell_execute',
  'data_analysis',
  'ocr',
  'translation',
  'vision'
] as const
export type AgentFeature = (typeof AGENT_FEATURES)[number]

// ── Shared project workspace ────────────────────────────────────────────────

/** A file owned by a project, tracked for concurrent-modification safety. */
export interface ProjectFile {
  id: string
  projectId: string
  path: string
  ownerTaskId: string | null
  lockHolder: string | null
  lockedAt: number | null
  version: number
  content: string | null
  ref: string | null
  contentType: string
  sizeBytes: number
  createdAt: number
  updatedAt: number
}

/** A named checkpoint of a project's state, for pause/resume and recovery. */
export interface ProjectCheckpoint {
  id: string
  projectId: string
  runId: string
  label: string
  taskSnapshot: string
  fileVersions: Record<string, number>
  createdAt: number
}

/** A persistent project that survives across runs and application restarts. */
export interface Project {
  id: string
  name: string
  description: string
  objective: string
  teamId: string
  /** Domain hint used to select default specialists and tools. */
  domain: ProjectDomain
  instructions: string
  status: ProjectStatus
  files: ProjectFile[]
  checkpoints: ProjectCheckpoint[]
  createdAt: number
  updatedAt: number
}

export const PROJECT_DOMAINS = [
  'software',
  'film',
  'image',
  'research',
  'writing',
  'marketing',
  'data',
  'general'
] as const
export type ProjectDomain = (typeof PROJECT_DOMAINS)[number]

export const PROJECT_STATUS = ['active', 'paused', 'completed', 'archived', 'failed'] as const
export type ProjectStatus = (typeof PROJECT_STATUS)[number]

// ── Independent quality review ──────────────────────────────────────────────

/** Severity of a finding raised by an independent reviewer. */
export const REVIEW_SEVERITY = ['info', 'warning', 'error', 'blocker'] as const
export type ReviewSeverity = (typeof REVIEW_SEVERITY)[number]

/** A single finding from an independent quality review of a task or artifact. */
export interface ReviewFinding {
  id: string
  runId: string
  taskId: string
  artifactId: string | null
  reviewerTaskId: string
  severity: ReviewSeverity
  category: string
  message: string
  suggestion: string | null
  resolved: boolean
  createdAt: number
}

/** Result of an independent quality review pass. */
export interface QualityReview {
  id: string
  runId: string
  reviewedTaskId: string
  artifactId: string | null
  reviewerTaskId: string
  verdict: 'pass' | 'conditional_pass' | 'fail'
  summary: string
  findings: ReviewFinding[]
  createdAt: number
}

/** Conflict between two specialists' outputs that needs resolution. */
export interface OutputConflict {
  id: string
  runId: string
  field: string
  taskIds: string[]
  positions: string[]
  resolution: 'unresolved' | 'leader_resolved' | 'user_resolved' | 'merged'
  resolvedBy: string | null
  resolvedAt: number | null
  createdAt: number
}

// ── Runtime interfaces for the scheduler ────────────────────────────────────

/** Mutable registry of artifacts produced during a run. */
export interface ArtifactRegistry {
  readonly artifacts: ReadonlyArray<Artifact>
  add(artifact: Artifact): Artifact
  get(id: string): Artifact | undefined
  markConsumed(artifactId: string, consumerTaskId: string): Artifact | undefined
  finalize(artifactId: string): Artifact | undefined
  listByTask(taskId: string): Artifact[]
  listFinal(): Artifact[]
}

/** Mutable project workspace with file locking. */
export interface ProjectWorkspace {
  readonly project: Project
  lockFile(path: string, holderTaskId: string): boolean
  unlockFile(path: string, holderTaskId: string): void
  writeFile(path: string, content: string, ownerTaskId: string, contentType?: string): ProjectFile | null
  readFile(path: string): ProjectFile | null
  listFiles(ownerTaskId?: string | null): ProjectFile[]
  snapshot(): string
}
