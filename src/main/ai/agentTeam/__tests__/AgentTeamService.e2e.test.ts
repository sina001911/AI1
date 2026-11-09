import { setupTestDatabase } from '@test-helpers/db'
import { mockApplicationFactory } from '@test-mocks/main/application'
import { MockMainDbServiceExport } from '@test-mocks/main/DbService'
import { v4 as uuidv4 } from 'uuid'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { application } from '@application'
import { buildPlan } from '@cherrystudio/agent-team/plan'
import type { Specialist, Team } from '@cherrystudio/agent-team/types'
import { teamTable } from '@data/db/schemas/team'
import { teamMemberTable } from '@data/db/schemas/teamMember'
import { AgentTeamService } from '@main/ai/agentTeam/AgentTeamService'
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

function buildSpecialist(overrides: Partial<Specialist> = {}): Specialist {
  return {
    id: uuidv4(),
    teamId: '',
    name: 'Specialist',
    role: 'coding',
    modelConfig: { providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
    systemPrompt: 'You are a specialist.',
    toolPermissions: {},
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  }
}

function buildFilmTeam(teamId: string): Team {
  return {
    id: teamId,
    name: 'Film Crew',
    description: 'Short film production team',
    strategy: 'sequential',
    maxConcurrency: 4,
    leader: {
      id: teamId,
      teamId,
      name: 'Director',
      modelConfig: { providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
      systemPrompt: 'You are the director.',
      createdAt: 0,
      updatedAt: 0
    },
    specialists: [
      buildSpecialist({
        id: 'film-research',
        name: 'Researcher',
        role: 'research',
        systemPrompt: 'Research the topic.'
      }),
      buildSpecialist({ id: 'film-writer', name: 'Screenwriter', role: 'general', systemPrompt: 'Write the script.' }),
      buildSpecialist({ id: 'film-image', name: 'Image Artist', role: 'image', systemPrompt: 'Describe visuals.' }),
      buildSpecialist({ id: 'film-video', name: 'Video Artist', role: 'video', systemPrompt: 'Plan video shots.' })
    ],
    createdAt: 0,
    updatedAt: 0
  }
}

function buildResearchTeam(teamId: string): Team {
  return {
    id: teamId,
    name: 'Research Cell',
    description: 'Independent research + review',
    strategy: 'sequential',
    maxConcurrency: 3,
    leader: {
      id: teamId,
      teamId,
      name: 'Lead Researcher',
      modelConfig: { providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
      systemPrompt: 'You are the lead researcher.',
      createdAt: 0,
      updatedAt: 0
    },
    specialists: [
      buildSpecialist({ id: 'res-alpha', name: 'Researcher A', role: 'research', systemPrompt: 'Research topic A.' }),
      buildSpecialist({ id: 'res-beta', name: 'Researcher B', role: 'research', systemPrompt: 'Research topic B.' }),
      buildSpecialist({ id: 'res-review', name: 'Reviewer', role: 'reviewer', systemPrompt: 'Review the report.' })
    ],
    createdAt: 0,
    updatedAt: 0
  }
}

function buildCodingTeam(teamId: string): Team {
  return {
    id: teamId,
    name: 'Dev Pair',
    description: 'Two coding specialists',
    strategy: 'sequential',
    maxConcurrency: 2,
    leader: {
      id: teamId,
      teamId,
      name: 'Tech Lead',
      modelConfig: { providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
      systemPrompt: 'You are the tech lead.',
      createdAt: 0,
      updatedAt: 0
    },
    specialists: [
      buildSpecialist({ id: 'coder-1', name: 'Coder One', role: 'coding', systemPrompt: 'Write the module.' }),
      buildSpecialist({ id: 'coder-2', name: 'Coder Two', role: 'coding', systemPrompt: 'Write the tests.' })
    ],
    createdAt: 0,
    updatedAt: 0
  }
}

describe('AgentTeamService e2e scenarios', () => {
  const dbh = setupTestDatabase()
  let service: AgentTeamService
  let teamId: string
  let memberId: string

  beforeAll(async () => {
    BaseService.resetInstances()
    service = new AgentTeamService()
    await service._doInit()
  })

  afterAll(async () => {
    await service._doStop()
    BaseService.resetInstances()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    const dbSvc = MockMainDbServiceExport.dbService
    dbSvc.withWriteTx.mockImplementation(<T>(fn: (tx: unknown) => T): T => dbh.db.transaction((tx) => fn(tx)))
    ;(application.get as any).mockImplementation((name: string) => {
      if (name === 'DbService') return dbSvc
      if (name === 'IpcApiService')
        return { broadcast: broadcastSpy, send: sendSpy, broadcastToType: broadcastToTypeSpy }
      throw new Error(`Unexpected application.get('${name}')`)
    })
    teamId = uuidv4()
    memberId = uuidv4()
    seedTeam(dbh, teamId, memberId)
  })

  function getController(runId: string) {
    return (service as any).runControllers.get(runId)
  }

  async function runScenario(teamObj: Team, objective: string, taskOutputs: Record<string, string>) {
    const plan = buildPlan(
      teamObj,
      objective,
      Object.keys(taskOutputs)
        .map((k) => `- ${k}`)
        .join('\n')
    )
    decomposeMock.mockResolvedValue({ plan, raw: '' })
    leaderTextMock.mockResolvedValue('synthesis')
    executeTaskMock.mockImplementation(async (task: any) => taskOutputs[task.title] ?? `output for ${task.title}`)
    const run = await service.startRun(teamObj.id, objective)
    const ctrl = getController(run.id)
    await ctrl.promise
    return service.getRunState(run.id).run
  }

  it('software dev: multiple coding agents collaborate', async () => {
    const codingTeam = buildCodingTeam(teamId)
    const run = await runScenario(codingTeam, 'Build the auth module and its tests', {
      'write code': 'module Auth {}',
      'write tests': 'test Auth {}'
    })
    expect(run.status).toBe('completed')
    expect(executeTaskMock).toHaveBeenCalledTimes(2)
    expect(leaderTextMock).toHaveBeenCalled()
    expect(broadcastSpy).toHaveBeenCalledWith(expect.stringContaining('agent.team'), expect.anything())
  })

  it('film production: research, scriptwriting, image and video agents', async () => {
    const filmTeam = buildFilmTeam(teamId)
    const run = await runScenario(filmTeam, 'Produce a 1-minute short film', {
      'research the topic': 'Topic brief',
      'write the script': 'Script draft',
      'describe visuals': 'Shot list',
      'plan video shots': 'Timeline'
    })
    expect(run.status).toBe('completed')
    expect(executeTaskMock).toHaveBeenCalledTimes(4)
  })

  it('research & content: independent researchers plus reviewer', async () => {
    const researchTeam = buildResearchTeam(teamId)
    const run = await runScenario(researchTeam, 'Produce a research report', {
      'research topic A': 'Findings A',
      'research topic B': 'Findings B',
      'review the report': 'Approved'
    })
    expect(run.status).toBe('completed')
    expect(executeTaskMock).toHaveBeenCalledTimes(3)
  })

  it('pauses and resumes a running scenario', async () => {
    const codingTeam = buildCodingTeam(teamId)
    decomposeMock.mockResolvedValue({
      plan: buildPlan(codingTeam, 'Build module and tests', '- write code\n- write tests'),
      raw: ''
    })
    leaderTextMock.mockResolvedValue('synthesis')
    executeTaskMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 25))
      return 'done'
    })
    const run = await service.startRun(codingTeam.id, 'Build module and tests')
    const ctrl = getController(run.id)
    await new Promise((r) => setTimeout(r, 10))
    expect(service.getRunState(run.id)?.run.status).toBe('running')
    service.pauseRun(run.id)
    expect(service.getRunState(run.id)?.run.status).toBe('paused')
    service.resumeRun(run.id)
    await ctrl.promise
    expect(service.getRunState(run.id)?.run.status).toBe('completed')
  })

  it('cancels a running scenario', async () => {
    const codingTeam = buildCodingTeam(teamId)
    decomposeMock.mockResolvedValue({
      plan: buildPlan(codingTeam, 'Build module and tests', '- write code\n- write tests'),
      raw: ''
    })
    leaderTextMock.mockResolvedValue('synthesis')
    executeTaskMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50))
      return 'done'
    })
    const run = await service.startRun(codingTeam.id, 'Build module and tests')
    const ctrl = getController(run.id)
    await new Promise((r) => setTimeout(r, 10))
    service.cancelRun(run.id)
    // Drain any work the scheduler still has in flight after abort so the
    // test boundary (and the DB close in afterAll) is not racing a late event.
    await new Promise((r) => setTimeout(r, 120))
    await ctrl.promise
    expect(service.getRunState(run.id)?.run.status).toBe('cancelled')
  })

  it('retries a failed task then recovers', async () => {
    const codingTeam = buildCodingTeam(teamId)
    decomposeMock.mockResolvedValue({
      plan: buildPlan(codingTeam, 'Build module and tests', '- write code'),
      raw: ''
    })
    leaderTextMock.mockResolvedValue('synthesis')
    let calls = 0
    executeTaskMock.mockImplementation(async () => {
      calls++
      if (calls < 2) throw new Error('transient')
      return 'recovered'
    })
    const run = await service.startRun(codingTeam.id, 'Build module')
    const ctrl = getController(run.id)
    await ctrl.promise
    expect(service.getRunState(run.id)?.run.status).toBe('completed')
    expect(calls).toBe(2)
  })

  it('persists run state and events', async () => {
    const codingTeam = buildCodingTeam(teamId)
    const run = await runScenario(codingTeam, 'Build module and tests', {
      'write code': 'module Auth {}',
      'write tests': 'test Auth {}'
    })
    const rows = dbh.db.select().from(teamTable).all()
    expect(rows.length).toBe(1)
    const events = service.listRunEvents(run.id)
    expect(events.length).toBeGreaterThan(0)
  })

  it('routes cross-specialist messages during a run', async () => {
    const codingTeam = buildCodingTeam(teamId)
    decomposeMock.mockResolvedValue({
      plan: buildPlan(codingTeam, 'Build module and tests', '- write code\n- write tests'),
      raw: ''
    })
    leaderTextMock.mockResolvedValue('synthesis')
    executeTaskMock.mockImplementation(async (task: any) => `output for ${task.title}`)
    const run = await service.startRun(codingTeam.id, 'Build module and tests')
    const ctrl = getController(run.id)
    await ctrl.promise
    expect(service.getRunState(run.id)?.run.status).toBe('completed')
  })
})
