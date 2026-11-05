import { setupTestDatabase } from '@test-helpers/db'
import { mockApplicationFactory } from '@test-mocks/main/application'
import { MockMainDbServiceExport } from '@test-mocks/main/DbService'
import { v4 as uuidv4 } from 'uuid'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { application } from '@application'
import { buildPlan } from '@cherrystudio/agent-team/plan'
import type { Team, ExecutionPlan } from '@cherrystudio/agent-team/types'
import { teamTable } from '@data/db/schemas/team'
import { teamMemberTable } from '@data/db/schemas/teamMember'
import { AgentTeamService } from '@main/ai/agentTeam/AgentTeamService'
import { teamRepository } from '@main/ai/agentTeam/TeamRepository'
import { BaseService } from '@main/core/lifecycle'

const { broadcastSpy, sendSpy, broadcastToTypeSpy, decomposeMock, executeTaskMock, leaderTextMock } = vi.hoisted(
  () => ({
    broadcastSpy: vi.fn(),
    sendSpy: vi.fn(),
    broadcastToTypeSpy: vi.fn(),
    decomposeMock: vi.fn(),
    executeTaskMock: vi.fn(),
    leaderTextMock: vi.fn()
  })
)

vi.mock('@application', () =>
  mockApplicationFactory({
    IpcApiService: {
      broadcast: broadcastSpy,
      send: sendSpy,
      broadcastToType: broadcastToTypeSpy
    }
  })
)

vi.mock('@main/ai/agentTeam/LeaderDecomposer', () => ({
  decomposeObjective: decomposeMock
}))
vi.mock('@main/ai/agentTeam/SpecialistExecutor', () => ({
  executeSpecialistTask: executeTaskMock
}))
vi.mock('@main/ai/agentTeam/LeaderModel', () => ({
  callLeaderText: leaderTextMock
}))

function buildTeamRow(overrides: Partial<{}> = {}) {
  const id = uuidv4()
  return {
    id,
    name: 'Squad',
    description: '',
    strategy: 'sequential' as const,
    maxConcurrency: 2,
    leaderConfig: {
      name: 'Leader',
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-5',
      systemPrompt: 'You are the leader.'
    },
    ...overrides
  }
}

function buildMemberRow(teamId: string, overrides: Partial<{}> = {}) {
  const id = uuidv4()
  return {
    id,
    teamId,
    name: 'Coder',
    role: 'coding' as const,
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-5',
    systemPrompt: 'You are a coding specialist.',
    toolPermissions: {},
    enabled: true,
    orderKey: '1',
    ...overrides
  }
}

function seedTeam(dbh: { db: any }, teamId: string, memberId: string) {
  dbh.db
    .insert(teamTable)
    .values(buildTeamRow({ id: teamId }))
    .run()
  dbh.db
    .insert(teamMemberTable)
    .values(buildMemberRow(teamId, { id: memberId }))
    .run()
}

function makePlan(team: Team, objective: string): ExecutionPlan {
  return buildPlan(team, objective, '- write code')
}

function makeTeamDomain(teamId: string, memberId: string): Team {
  return {
    id: teamId,
    name: 'Squad',
    description: '',
    strategy: 'sequential',
    maxConcurrency: 2,
    leader: {
      id: teamId,
      teamId,
      name: 'Leader',
      modelConfig: { providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
      systemPrompt: 'You are the leader.',
      createdAt: 0,
      updatedAt: 0
    },
    specialists: [
      {
        id: memberId,
        teamId,
        name: 'Coder',
        role: 'coding',
        modelConfig: { providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
        systemPrompt: 'You are a coding specialist.',
        toolPermissions: {},
        enabled: true,
        createdAt: 0,
        updatedAt: 0
      }
    ],
    createdAt: 0,
    updatedAt: 0
  }
}

describe('AgentTeamService', () => {
  const dbh = setupTestDatabase()
  let service: AgentTeamService
  let teamId: string
  let memberId: string

  beforeAll(async () => {
    BaseService.resetInstances()
    service = new AgentTeamService()
    await service._doInit()

    // Wire the mock application's DbService to the real test DB.
    const dbSvc = MockMainDbServiceExport.dbService
    dbSvc.withWriteTx.mockImplementation(<T>(fn: (tx: unknown) => T): T => dbh.db.transaction((tx) => fn(tx)))
    ;(application.get as any).mockImplementation((name: string) => {
      if (name === 'DbService') return dbSvc
      if (name === 'IpcApiService')
        return { broadcast: broadcastSpy, send: sendSpy, broadcastToType: broadcastToTypeSpy }
      throw new Error(`Unexpected application.get('${name}')`)
    })
  })

  afterAll(async () => {
    await service._doStop()
    BaseService.resetInstances()
  })

  beforeEach(() => {
    teamId = uuidv4()
    memberId = uuidv4()
    seedTeam(dbh, teamId, memberId)
    broadcastSpy.mockClear()
    sendSpy.mockClear()
    broadcastToTypeSpy.mockClear()
    decomposeMock.mockReset()
    executeTaskMock.mockReset()
    leaderTextMock.mockReset()
  })

  it('creates and lists teams', () => {
    const created = service.createTeam({
      name: 'Alpha',
      description: 'desc',
      strategy: 'sequential',
      maxConcurrency: 3,
      leaderConfig: { name: 'L', providerId: 'anthropic', modelId: 'claude-sonnet-4-5', systemPrompt: 'x' }
    })
    expect(created.name).toBe('Alpha')
    const listed = service.listTeams()
    expect(listed.some((t) => t.id === created.id)).toBe(true)
    expect(listed.find((t) => t.id === created.id)!.name).toBe('Alpha')
  })

  it('updates and deletes a team', () => {
    const created = service.createTeam({
      name: 'Beta',
      description: '',
      strategy: 'sequential',
      maxConcurrency: 1,
      leaderConfig: { name: 'L', providerId: 'anthropic', modelId: 'claude-sonnet-4-5', systemPrompt: 'x' }
    })
    const updated = service.updateTeam(created.id, { name: 'Beta2' })
    expect(updated.name).toBe('Beta2')
    service.deleteTeam(created.id)
    expect(service.listTeams().find((t) => t.id === created.id)).toBeUndefined()
  })

  it('creates and lists members', () => {
    const created = service.createMember(teamId, {
      name: 'Reviewer',
      role: 'reviewer',
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-5',
      temperature: null,
      maxTokens: null,
      systemPrompt: 'review',
      toolPermissions: {},
      enabled: true,
      orderKey: '2'
    })
    expect(created.name).toBe('Reviewer')
    const listed = service.listMembers(teamId)
    expect(listed.some((m) => m.id === created.id)).toBe(true)
    expect(listed.find((m) => m.id === created.id)!.role).toBe('reviewer')
  })

  it('updates and deletes a member', () => {
    const created = service.createMember(teamId, {
      name: 'M',
      role: 'coding',
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-5',
      temperature: null,
      maxTokens: null,
      systemPrompt: 'x',
      toolPermissions: {},
      enabled: true,
      orderKey: '1'
    })
    const updated = service.updateMember(created.id, { name: 'M2' })
    expect(updated.name).toBe('M2')
    service.deleteMember(created.id)
    expect(service.listMembers(teamId).find((m) => m.id === created.id)).toBeUndefined()
  })

  it('throws TEAM_NOT_FOUND when updating a missing team', () => {
    expect(() => service.updateTeam(uuidv4(), { name: 'x' })).toThrow(/Team not found/)
  })

  it('throws NO_ENABLED_SPECIALIST when team has no enabled specialists', async () => {
    service.updateMember(memberId, { enabled: false })
    await expect(service.startRun(teamId, 'do thing')).rejects.toThrow(/no enabled specialists/i)
  })

  it('starts a run that completes with synthesis', async () => {
    const team = makeTeamDomain(teamId, memberId)
    decomposeMock.mockResolvedValue({ plan: makePlan(team, 'build feature'), raw: '- write code' })
    executeTaskMock.mockImplementation(async (task: any) => `output:${task.title}`)
    leaderTextMock.mockResolvedValue('synthesized')

    const run = await service.startRun(teamId, 'build feature')
    expect(run.status).toBe('running')

    const ctrl = (service as any).runControllers.get(run.id)
    await ctrl.promise

    const state = service.getRunState(run.id)
    expect(state.run.status).toBe('completed')
    expect(state.run.result).toBe('synthesized')
    expect(state.tasks).toHaveLength(1)
    expect(state.tasks[0].status).toBe('completed')
    expect(state.tasks[0].output).toBe('output:write code')
    expect(state.events.some((e) => e.type === 'run_started')).toBe(true)
    expect(state.events.some((e) => e.type === 'task_started')).toBe(true)
    expect(state.events.some((e) => e.type === 'task_completed')).toBe(true)
    expect(state.events.some((e) => e.type === 'synthesis_started')).toBe(true)
    expect(state.events.some((e) => e.type === 'synthesis_completed')).toBe(true)
    expect(state.events.some((e) => e.type === 'run_completed')).toBe(true)
    expect(broadcastSpy).toHaveBeenCalledWith('agent.team.run.started', expect.any(Object))
    expect(broadcastSpy).toHaveBeenCalledWith('agent.team.run_completed', expect.any(Object))
  })

  it('marks a run failed when a specialist task throws', async () => {
    const team = makeTeamDomain(teamId, memberId)
    decomposeMock.mockResolvedValue({ plan: makePlan(team, 'boom'), raw: '- boom' })
    executeTaskMock.mockRejectedValue(new Error('explode'))
    leaderTextMock.mockResolvedValue('x')

    const run = await service.startRun(teamId, 'boom')
    const ctrl = (service as any).runControllers.get(run.id)
    await ctrl.promise

    const state = service.getRunState(run.id)
    expect(state.run.status).toBe('failed')
    expect(state.run.error).toBe('explode')
    expect(state.tasks[0].status).toBe('failed')
    expect(state.events.some((e) => e.type === 'task_failed')).toBe(true)
    expect(state.events.some((e) => e.type === 'run_failed')).toBe(true)
  })

  it('cancels an in-flight run', async () => {
    const team = makeTeamDomain(teamId, memberId)
    decomposeMock.mockResolvedValue({ plan: makePlan(team, 'slow'), raw: '- slow' })
    executeTaskMock.mockImplementation(
      (_task: any, _spec: any, signal: AbortSignal) =>
        new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => resolve('done'), 5000)
          const onAbort = () => {
            clearTimeout(timer)
            reject(new Error('Run cancelled by user'))
          }
          if (signal.aborted) onAbort()
          else signal.addEventListener('abort', onAbort, { once: true })
        })
    )
    leaderTextMock.mockResolvedValue('x')

    const run = await service.startRun(teamId, 'slow')
    service.cancelRun(run.id)

    const ctrl = (service as any).runControllers.get(run.id)
    await ctrl.promise

    const state = service.getRunState(run.id)
    expect(state.run.status).toBe('cancelled')
    expect(state.events.some((e) => e.type === 'run_cancelled')).toBe(true)
    expect(broadcastSpy).toHaveBeenCalledWith('agent.team.run_cancelled', expect.any(Object))
  })

  it('pauses and resumes a run', async () => {
    const team = makeTeamDomain(teamId, memberId)
    decomposeMock.mockResolvedValue({ plan: makePlan(team, 'pause test'), raw: '- pause' })
    executeTaskMock.mockImplementation(async (task: any) => `done:${task.title}`)
    leaderTextMock.mockResolvedValue('synth')

    const run = await service.startRun(teamId, 'pause test')
    service.pauseRun(run.id)
    expect(service.getRunState(run.id).run.status).toBe('paused')
    expect(broadcastSpy).toHaveBeenCalledWith('agent.team.run_paused', expect.any(Object))

    service.resumeRun(run.id)
    expect(service.getRunState(run.id).run.status).toBe('running')
    expect(broadcastSpy).toHaveBeenCalledWith('agent.team.run_resumed', expect.any(Object))

    const ctrl = (service as any).runControllers.get(run.id)
    await ctrl.promise
    expect(service.getRunState(run.id).run.status).toBe('completed')
  })

  it('lists runs and run events for a team', async () => {
    const team = makeTeamDomain(teamId, memberId)
    decomposeMock.mockResolvedValue({ plan: makePlan(team, 'list test'), raw: '- list' })
    executeTaskMock.mockImplementation(async (task: any) => `out:${task.title}`)
    leaderTextMock.mockResolvedValue('ok')

    const run = await service.startRun(teamId, 'list test')
    const ctrl = (service as any).runControllers.get(run.id)
    await ctrl.promise

    const runs = service.listRuns(teamId)
    expect(runs.some((r) => r.id === run.id)).toBe(true)
    const events = service.listRunEvents(run.id)
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].type).toBe('run_started')
  })

  it('throws RUN_NOT_FOUND when getting state for a missing run', () => {
    expect(() => service.getRunState(uuidv4())).toThrow(/Run not found/)
  })

  it('persists run state across restart (re-read from DB)', async () => {
    const team = makeTeamDomain(teamId, memberId)
    decomposeMock.mockResolvedValue({ plan: makePlan(team, 'persist'), raw: '- persist' })
    executeTaskMock.mockImplementation(async (task: any) => `p:${task.title}`)
    leaderTextMock.mockResolvedValue('persisted')

    const run = await service.startRun(teamId, 'persist')
    const ctrl = (service as any).runControllers.get(run.id)
    await ctrl.promise

    // Re-read via repository directly to confirm DB state is consistent.
    const row = teamRepository.getRun(run.id)
    expect(row?.status).toBe('completed')
    expect(row?.result).toBe('persisted')
    const tasks = teamRepository.listTasksByRun(run.id)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].status).toBe('completed')
  })
})
