import { v4 as uuidv4 } from 'uuid'

import { application } from '@application'
import { createSharedContext } from '@cherrystudio/agent-team/context'
import { startOrchestrate } from '@cherrystudio/agent-team/execution'
import { assignTasks } from '@cherrystudio/agent-team/plan'
import { buildSynthesisPrompt } from '@cherrystudio/agent-team/synthesis'
import type {
  ExecutionPlan,
  ExecutionResult,
  SharedContext,
  Specialist,
  Task,
  TaskGate,
  Team,
  TeamEvent,
  ToolPermissionMap
} from '@cherrystudio/agent-team/types'
import type { TeamRow } from '@data/db/schemas/team'
import type { TeamMemberRow } from '@data/db/schemas/teamMember'
import type { TeamRunRow } from '@data/db/schemas/teamRun'
import type { TeamRunEventRow } from '@data/db/schemas/teamRunEvent'
import type { TeamTaskRow } from '@data/db/schemas/teamTask'
import { loggerService } from '@logger'
import { decomposeObjective } from '@main/ai/agentTeam/LeaderDecomposer'
import { callLeaderText } from '@main/ai/agentTeam/LeaderModel'
import { executeSpecialistTask } from '@main/ai/agentTeam/SpecialistExecutor'
import { teamRepository } from '@main/ai/agentTeam/TeamRepository'
import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import { IpcError } from '@shared/ipc/errors/IpcError'
import type {
  TeamEntity,
  TeamForm,
  TeamMemberEntity,
  TeamMemberForm,
  TeamMemberPatch,
  TeamPatch,
  TeamRunEntity,
  TeamRunEventEntity,
  TeamRunState
} from '@shared/ipc/schemas/ai'
import type { IpcEventName } from '@shared/ipc/schemas/ipcSchemas'

const logger = loggerService.withContext('AgentTeam:AgentTeamService')

/** A run that is currently executing or paused. */
interface RunController {
  runId: string
  teamId: string
  abortController: AbortController
  paused: boolean
  resumeResolver: (() => void) | null
  promise: Promise<ExecutionResult> | null
  step: (() => void) | null
  sharedContext: SharedContext
  /**
   * Resolve the next approval request. Set to a no-op resolver that rejects
   * once a run is cancelled, so a pending gate never outlives its run.
   */
  resolveApproval:
    | ((input: {
        runId: string
        task: Task
        gate: TaskGate
        signal: AbortSignal
      }) => Promise<{ approved: boolean; reason?: string }>)
    | null
  cancel(): void
  pause(): void
  resume(): void
}

// ── Row → entity / domain mappers ────────────────────────────────────────

function toTeamEntity(row: TeamRow): TeamEntity {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    strategy: row.strategy,
    maxConcurrency: row.maxConcurrency,
    leaderConfig: row.leaderConfig,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function toRunEntity(row: TeamRunRow): TeamRunEntity {
  return {
    id: row.id,
    teamId: row.teamId,
    objective: row.objective,
    status: row.status,
    result: row.result,
    error: row.error,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function toMemberEntity(row: TeamMemberRow): TeamMemberEntity {
  return {
    id: row.id,
    teamId: row.teamId,
    name: row.name,
    role: row.role,
    providerId: row.providerId,
    modelId: row.modelId,
    temperature: row.temperature,
    maxTokens: row.maxTokens,
    systemPrompt: row.systemPrompt,
    toolPermissions: (row.toolPermissions ?? {}) as Record<string, 'allow' | 'deny' | 'prompt'>,
    enabled: row.enabled,
    orderKey: row.orderKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function toEventEntity(row: TeamRunEventRow): TeamRunEventEntity {
  return {
    id: row.id,
    runId: row.runId,
    type: row.type,
    payload: row.payload,
    createdAt: row.createdAt
  }
}

function toTaskEntity(row: TeamTaskRow): TeamRunState['tasks'][number] {
  return {
    id: row.id,
    teamId: row.teamId,
    runId: row.runId,
    parentId: row.parentId,
    title: row.title,
    description: row.description,
    assignedTo: row.assignedTo,
    dependencies: row.dependencies,
    gate: row.gate,
    status: row.status,
    input: row.input,
    output: row.output,
    error: row.error,
    retryCount: row.retryCount,
    maxRetries: row.maxRetries,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function toSpecialist(row: TeamMemberRow): Specialist {
  return {
    id: row.id,
    teamId: row.teamId,
    name: row.name,
    role: row.role,
    modelConfig: {
      providerId: row.providerId,
      modelId: row.modelId,
      temperature: row.temperature ?? undefined,
      maxTokens: row.maxTokens ?? undefined
    },
    systemPrompt: row.systemPrompt,
    toolPermissions: (row.toolPermissions ?? {}) as ToolPermissionMap,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function toTeamDomain(row: TeamRow, members: TeamMemberRow[]): Team {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    strategy: row.strategy,
    maxConcurrency: row.maxConcurrency,
    leader: {
      id: row.id,
      teamId: row.id,
      name: row.leaderConfig.name,
      modelConfig: {
        providerId: row.leaderConfig.providerId,
        modelId: row.leaderConfig.modelId,
        temperature: row.leaderConfig.temperature,
        maxTokens: row.leaderConfig.maxTokens
      },
      systemPrompt: row.leaderConfig.systemPrompt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    },
    specialists: members.map(toSpecialist),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

// ── TeamEvent → IPC event mapping ────────────────────────────────────────

/**
 * Translate a domain `TeamEvent` into the matching IPC event name + payload.
 *
 * `run_started` is emitted by the host directly (it carries teamId + objective,
 * which the domain event does not) and is therefore absent here.
 */
function mapTeamEventToIpc(event: TeamEvent): { event: IpcEventName; payload: Record<string, unknown> } | null {
  switch (event.type) {
    case 'plan_created':
      return {
        event: 'agent.team.plan_created',
        payload: { runId: event.runId, taskCount: event.plan.tasks.length }
      }
    case 'task_queued':
      return {
        event: 'agent.team.task.queued',
        payload: { runId: event.runId, taskId: event.task.id, title: event.task.title }
      }
    case 'task_started':
      return { event: 'agent.team.task.started', payload: { runId: event.runId, taskId: event.taskId } }
    case 'task_progress':
      return {
        event: 'agent.team.task.delta',
        payload: { runId: event.runId, taskId: event.taskId, delta: event.delta }
      }
    case 'task_completed':
      return {
        event: 'agent.team.task.completed',
        payload: { runId: event.runId, taskId: event.task.id, output: event.task.output ?? '' }
      }
    case 'task_failed':
      return {
        event: 'agent.team.task.failed',
        payload: { runId: event.runId, taskId: event.taskId, error: event.error }
      }
    case 'task_cancelled':
      return { event: 'agent.team.task.cancelled', payload: { runId: event.runId, taskId: event.taskId } }
    case 'synthesis_started':
      return { event: 'agent.team.synthesis_started', payload: { runId: event.runId } }
    case 'synthesis_completed':
      return { event: 'agent.team.synthesis_completed', payload: { runId: event.runId, result: event.result } }
    case 'run_completed':
      return { event: 'agent.team.run_completed', payload: { runId: event.runId, result: event.result } }
    case 'run_failed':
      return { event: 'agent.team.run_failed', payload: { runId: event.runId, error: event.error } }
    case 'run_cancelled':
      return { event: 'agent.team.run_cancelled', payload: { runId: event.runId } }
    case 'task_approval_requested':
      return {
        event: 'agent.team.task.approval_requested',
        payload: { runId: event.runId, taskId: event.taskId, gate: event.gate, reason: event.reason }
      }
    case 'task_approval_resolved':
      return {
        event: 'agent.team.task.approval_resolved',
        payload: {
          runId: event.runId,
          taskId: event.taskId,
          gate: event.gate,
          approved: event.approved,
          reason: event.reason
        }
      }
    case 'context_updated':
      return {
        event: 'agent.team.context.updated',
        payload: { runId: event.runId, delta: event.delta, authorTaskId: event.authorTaskId }
      }
    case 'task_message_sent':
      return {
        event: 'agent.team.task.message.sent',
        payload: {
          runId: event.runId,
          messageId: event.message.id,
          fromTaskId: event.message.fromTaskId,
          toTaskId: event.message.toTaskId,
          content: event.message.content,
          createdAt: event.message.createdAt
        }
      }
    case 'task_message_received':
      return {
        event: 'agent.team.task.message.received',
        payload: {
          runId: event.runId,
          taskId: event.taskId,
          messageId: event.message.id,
          fromTaskId: event.message.fromTaskId,
          content: event.message.content,
          createdAt: event.message.createdAt
        }
      }
    default:
      return null
  }
}

// ── AgentTeamService ──────────────────────────────────────────────────────

@Injectable('AgentTeamService')
@ServicePhase(Phase.WhenReady)
@DependsOn(['DbService', 'IpcApiService'])
export class AgentTeamService extends BaseService {
  private readonly runControllers = new Map<string, RunController>()
  /** Pending human-approval decisions, keyed by `runId:taskId`. */
  private readonly pendingApprovals = new Map<
    string,
    { resolve: (decision: { approved: boolean; reason?: string }) => void }
  >()

  async onReady(): Promise<void> {
    logger.info('AgentTeamService ready')
  }

  async onStop(): Promise<void> {
    for (const controller of this.runControllers.values()) {
      controller.abortController.abort()
    }
    this.runControllers.clear()
  }

  // ── Teams ────────────────────────────────────────────────────────────

  listTeams(): TeamEntity[] {
    return teamRepository.listTeams().map(toTeamEntity)
  }

  createTeam(form: TeamForm): TeamEntity {
    return toTeamEntity(teamRepository.createTeam(form))
  }

  updateTeam(teamId: string, patch: TeamPatch): TeamEntity {
    const row = teamRepository.updateTeam(teamId, patch)
    if (!row) throw new IpcError('TEAM_NOT_FOUND', `Team not found: ${teamId}`)
    return toTeamEntity(row)
  }

  deleteTeam(teamId: string): void {
    teamRepository.deleteTeam(teamId)
  }

  // ── Members ───────────────────────────────────────────────────────────

  listMembers(teamId: string): TeamMemberEntity[] {
    return teamRepository.listMembers(teamId).map(toMemberEntity)
  }

  createMember(teamId: string, member: TeamMemberForm): TeamMemberEntity {
    return toMemberEntity(
      teamRepository.createMember({
        ...member,
        teamId,
        toolPermissions: member.toolPermissions ?? {}
      })
    )
  }

  updateMember(memberId: string, patch: TeamMemberPatch): TeamMemberEntity {
    const row = teamRepository.updateMember(memberId, patch)
    if (!row) throw new IpcError('MEMBER_NOT_FOUND', `Member not found: ${memberId}`)
    return toMemberEntity(row)
  }

  deleteMember(memberId: string): void {
    teamRepository.deleteMember(memberId)
  }

  // ── Runs ──────────────────────────────────────────────────────────────

  async startRun(teamId: string, objective: string): Promise<TeamRunEntity> {
    const team = this.getTeamDomain(teamId)
    if (team.specialists.filter((s) => s.enabled).length === 0) {
      throw new IpcError('NO_ENABLED_SPECIALIST', 'Team has no enabled specialists')
    }

    const runId = uuidv4()
    const startedAt = Date.now()

    const { plan } = await decomposeObjective({ team, objective })
    const assignedPlan = assignTasks(plan, team)

    const { run } = teamRepository.createRunWithTasks(
      runId,
      { teamId, objective, status: 'running', startedAt },
      assignedPlan.tasks.map((t) => ({
        id: t.id,
        teamId: t.teamId,
        runId,
        title: t.title,
        description: t.description,
        parentId: t.parentId,
        assignedTo: t.assignedTo,
        dependencies: t.dependencies,
        gate: t.gate,
        status: 'queued' as const,
        input: t.input,
        maxRetries: t.maxRetries
      }))
    )

    this.broadcastIpc('agent.team.run.started', { runId, teamId, objective })
    teamRepository.appendEvent({
      runId,
      type: 'run_started',
      payload: { runId, teamId, objective },
      createdAt: startedAt
    })

    const controller = this.createController(runId, teamId, objective, team, assignedPlan)
    this.runControllers.set(runId, controller)
    controller
      .promise!.then((result) => {
        this.runControllers.delete(runId)
        if (result.status === 'completed') {
          teamRepository.updateRun(runId, {
            status: 'completed',
            result: result.result ?? '',
            completedAt: Date.now()
          })
        } else if (result.status === 'failed') {
          teamRepository.updateRun(runId, {
            status: 'failed',
            error: result.error ?? 'unknown',
            completedAt: Date.now()
          })
        } else if (result.status === 'cancelled') {
          teamRepository.updateRun(runId, {
            status: 'cancelled',
            cancelledAt: Date.now(),
            completedAt: Date.now()
          })
        }
      })
      .catch((err) => {
        this.runControllers.delete(runId)
        teamRepository.updateRun(runId, {
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
          completedAt: Date.now()
        })
      })

    return toRunEntity(run)
  }

  pauseRun(runId: string): TeamRunEntity {
    const controller = this.runControllers.get(runId)
    if (controller) controller.pause()
    const row = teamRepository.getRun(runId)
    if (!row) throw new IpcError('RUN_NOT_FOUND', `Run not found: ${runId}`)
    return toRunEntity(row)
  }

  resumeRun(runId: string): TeamRunEntity {
    const controller = this.runControllers.get(runId)
    if (controller) controller.resume()
    const row = teamRepository.getRun(runId)
    if (!row) throw new IpcError('RUN_NOT_FOUND', `Run not found: ${runId}`)
    return toRunEntity(row)
  }

  cancelRun(runId: string): TeamRunEntity {
    const controller = this.runControllers.get(runId)
    if (controller) controller.cancel()
    const row = teamRepository.getRun(runId)
    if (!row) throw new IpcError('RUN_NOT_FOUND', `Run not found: ${runId}`)
    return toRunEntity(row)
  }

  getRunState(runId: string): TeamRunState {
    const run = teamRepository.getRun(runId)
    if (!run) throw new IpcError('RUN_NOT_FOUND', `Run not found: ${runId}`)
    const tasks = teamRepository.listTasksByRun(runId).map(toTaskEntity)
    const events = teamRepository.listEvents(runId).map(toEventEntity)
    return { run: toRunEntity(run), tasks, events }
  }

  listRuns(teamId: string): TeamRunEntity[] {
    return teamRepository.listRuns(teamId).map(toRunEntity)
  }

  listRunEvents(runId: string): TeamRunEventEntity[] {
    return teamRepository.listEvents(runId).map(toEventEntity)
  }

  // ── Private helpers ───────────────────────────────────────────────────

  private getTeamDomain(teamId: string): Team {
    const row = teamRepository.getTeam(teamId)
    if (!row) throw new IpcError('TEAM_NOT_FOUND', `Team not found: ${teamId}`)
    const members = teamRepository.listMembers(teamId)
    return toTeamDomain(row, members)
  }

  private createController(
    runId: string,
    teamId: string,
    objective: string,
    team: Team,
    plan: ExecutionPlan
  ): RunController {
    const abortController = new AbortController()
    const sharedContext = createSharedContext()
    const controller: RunController = {
      runId,
      teamId,
      abortController,
      paused: false,
      resumeResolver: null,
      promise: null,
      step: null,
      sharedContext,
      resolveApproval: null,
      cancel: () => {
        if (controller.paused) controller.resume()
        // Reject any in-flight approval so the gate never outlives the run.
        abortController.abort()
      },
      pause: () => {
        if (controller.paused) return
        controller.paused = true
        this.broadcastIpc('agent.team.run_paused', { runId })
        teamRepository.updateRun(runId, { status: 'paused' })
      },
      resume: () => {
        if (!controller.paused) return
        controller.paused = false
        if (controller.resumeResolver) {
          const resolve = controller.resumeResolver
          controller.resumeResolver = null
          resolve()
        }
        controller.step?.()
        this.broadcastIpc('agent.team.run_resumed', { runId })
        teamRepository.updateRun(runId, { status: 'running' })
      }
    }

    const handle = startOrchestrate({
      runId,
      plan,
      team,
      executeTask: executeSpecialistTask,
      synthesize: this.createSynthesize(team, objective),
      onEvent: (event) => this.handleRunEvent(event),
      signal: abortController.signal,
      sharedContext,
      onApprovalRequest: (input) => this.requestApproval(runId, input),
      sendMessage: (msg) => {
        this.broadcastIpc('agent.team.task.message.sent', {
          runId: msg.runId,
          messageId: msg.id,
          fromTaskId: msg.fromTaskId,
          toTaskId: msg.toTaskId,
          content: msg.content,
          createdAt: msg.createdAt
        })
        teamRepository.appendEvent({
          runId: msg.runId,
          type: 'task_message_sent',
          payload: msg as unknown as Record<string, unknown>,
          createdAt: msg.createdAt
        })
      },
      shouldPause: () => controller.paused,
      waitForResume: () =>
        new Promise<void>((resolve) => {
          controller.resumeResolver = resolve
        })
    })

    controller.promise = handle.promise
    controller.step = handle.step
    return controller
  }

  /**
   * Gate callback: parks the run until the renderer answers
   * `agent.team.run.approve_task`. The returned promise resolves with the
   * human decision; a cancelled run rejects it so the scheduler marks the
   * task failed instead of hanging forever.
   */
  private requestApproval(
    runId: string,
    input: {
      runId: string
      task: Task
      gate: TaskGate
      signal: AbortSignal
    }
  ): Promise<{ approved: boolean; reason?: string }> {
    const key = `${runId}:${input.task.id}`
    return new Promise<{ approved: boolean; reason?: string }>((resolve, reject) => {
      if (input.signal.aborted) {
        reject(new Error('Run cancelled during approval'))
        return
      }
      const onAbort = () => {
        this.pendingApprovals.delete(key)
        reject(new Error('Run cancelled during approval'))
      }
      input.signal.addEventListener('abort', onAbort, { once: true })
      this.pendingApprovals.set(key, {
        resolve: (decision) => {
          input.signal.removeEventListener('abort', onAbort)
          resolve(decision)
        }
      })
    })
  }

  /**
   * Answer a pending human-approval request. Called from
   * `agent.team.run.approve_task` IPC. Returns `false` when no approval is
   * pending (already decided, or the run is gone) so the renderer can report
   * a clean "nothing to approve" instead of a thrown error.
   */
  respondTaskApproval(runId: string, taskId: string, approved: boolean, reason?: string): boolean {
    const key = `${runId}:${taskId}`
    const pending = this.pendingApprovals.get(key)
    if (!pending) return false
    this.pendingApprovals.delete(key)
    pending.resolve({ approved, reason })
    return true
  }

  private createSynthesize(team: Team, objective: string) {
    return async ({
      runId,
      tasks
    }: {
      runId: string
      objective: string
      tasks: ExecutionPlan['tasks']
    }): Promise<string> => {
      const prompt = buildSynthesisPrompt({
        runId,
        objective,
        tasks,
        leaderPrompt: team.leader.systemPrompt || undefined
      })
      return callLeaderText(
        {
          providerId: team.leader.modelConfig.providerId,
          modelId: team.leader.modelConfig.modelId,
          temperature: team.leader.modelConfig.temperature,
          maxTokens: team.leader.modelConfig.maxTokens,
          systemPrompt:
            team.leader.systemPrompt ||
            'You are the Leader of a collaborative AI studio. Synthesize specialist outputs into a coherent final answer.'
        },
        prompt
      )
    }
  }

  private handleRunEvent(event: TeamEvent): void {
    const runId = event.runId
    const mapped = mapTeamEventToIpc(event)
    teamRepository.appendEvent({
      runId,
      type: event.type,
      payload: mapped?.payload ?? { runId },
      createdAt: Date.now()
    })
    if (mapped) this.broadcastIpc(mapped.event, mapped.payload)
    this.persistTaskState(event)
  }

  /** Push task status/output/error from a domain event back into the task row. */
  private persistTaskState(event: TeamEvent): void {
    switch (event.type) {
      case 'task_started':
        teamRepository.updateTask(event.taskId, { status: 'running' })
        break
      case 'task_completed':
        teamRepository.updateTask(event.task.id, {
          status: 'completed',
          output: event.task.output ?? ''
        })
        break
      case 'task_failed':
        teamRepository.updateTask(event.taskId, {
          status: event.willRetry ? 'retrying' : 'failed',
          error: event.error
        })
        break
      case 'task_cancelled':
        teamRepository.updateTask(event.taskId, { status: 'cancelled' })
        break
    }
  }

  private broadcastIpc(event: IpcEventName, payload: Record<string, unknown>): void {
    application.get('IpcApiService').broadcast(event, payload)
  }
}
