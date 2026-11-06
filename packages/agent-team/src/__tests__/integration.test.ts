import { describe, it, expect } from 'vitest'

import { buildPlan } from '../plan'
import { executePlan, createCancellationController } from '../scheduler'
import { makeTeam, makeModelConfig, defaultToolPermissions } from '../team'
import { createInMemoryArtifactRegistry } from '../registry'
import { createInMemoryProjectWorkspace } from '../projectWorkspace'
import type { TeamEvent } from '../types'

function buildTeam() {
  return makeTeam({
    name: 'Squad',
    description: '',
    strategy: 'sequential',
    maxConcurrency: 2,
    leader: { name: 'L', modelConfig: makeModelConfig('a', 'b'), systemPrompt: 'x' },
    specialists: [
      { name: 'Coder', role: 'coding', modelConfig: makeModelConfig('a', 'b'), systemPrompt: 'x', toolPermissions: defaultToolPermissions('coding'), enabled: true },
      { name: 'Reviewer', role: 'reviewer', modelConfig: makeModelConfig('a', 'b'), systemPrompt: 'x', toolPermissions: defaultToolPermissions('reviewer'), enabled: true }
    ]
  })
}

describe('artifact + workspace integration', () => {
  it('records artifacts and workspace files when a task completes', async () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- write code')
    const events: TeamEvent[] = []
    const registry = createInMemoryArtifactRegistry()
    const workspace = createInMemoryProjectWorkspace({ name: 'P', objective: 'o' })

    const { promise } = executePlan({
      runId: 'run-1',
      plan,
      team,
      executeTask: async (task) => `output for ${task.title}`,
      signal: createCancellationController().signal,
      onEvent: (e) => events.push(e),
      sharedContext: { entries: [], append: () => ({ id: '', taskId: '', taskTitle: '', delta: '', createdAt: 0 }), snapshot: () => '' } as any,
      onApprovalRequest: async () => ({ approved: true }),
      artifactRegistry: registry,
      workspace
    })

    await promise
    expect(registry.artifacts).toHaveLength(1)
    expect(registry.artifacts[0].name).toBe('write code')
    expect(registry.artifacts[0].content).toBe('output for write code')
    expect(events.some((e) => e.type === 'artifact_created')).toBe(true)
    expect(workspace.project.files.some((f) => f.path.startsWith('tasks/'))).toBe(true)
    expect(events.some((e) => e.type === 'workspace_file_locked')).toBe(true)
    expect(events.some((e) => e.type === 'workspace_file_unlocked')).toBe(true)
  })

  it('requests an independent review when a task is gated for review', async () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- reviewable task')
    plan.tasks[0].gate = 'review'
    const events: TeamEvent[] = []
    const registry = createInMemoryArtifactRegistry()

    const { promise } = executePlan({
      runId: 'run-1',
      plan,
      team,
      executeTask: async () => 'task output',
      signal: createCancellationController().signal,
      onEvent: (e) => events.push(e),
      sharedContext: { entries: [], append: () => ({ id: '', taskId: '', taskTitle: '', delta: '', createdAt: 0 }), snapshot: () => '' } as any,
      onApprovalRequest: async () => ({ approved: true }),
      artifactRegistry: registry,
      onReviewRequest: async ({ artifactId }) => ({
        id: 'review-1',
        runId: 'run-1',
        reviewedTaskId: plan.tasks[0].id,
        artifactId,
        reviewerTaskId: 'reviewer-1',
        verdict: 'pass',
        summary: 'looks good',
        findings: [],
        createdAt: Date.now()
      })
    })

    const result = await promise
    expect(result.status).toBe('completed')
    expect(events.some((e) => e.type === 'artifact_review_completed')).toBe(true)
  })

  it('fails the run when a review request throws', async () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- reviewable task')
    plan.tasks[0].gate = 'review'
    const events: TeamEvent[] = []
    const registry = createInMemoryArtifactRegistry()

    const { promise } = executePlan({
      runId: 'run-1',
      plan,
      team,
      executeTask: async () => 'task output',
      signal: createCancellationController().signal,
      onEvent: (e) => events.push(e),
      sharedContext: { entries: [], append: () => ({ id: '', taskId: '', taskTitle: '', delta: '', createdAt: 0 }), snapshot: () => '' } as any,
      onApprovalRequest: async () => ({ approved: true }),
      artifactRegistry: registry,
      onReviewRequest: async () => {
        throw new Error('review engine unavailable')
      }
    })

    const result = await promise
    expect(result.status).toBe('failed')
    expect(events.some((e) => e.type === 'task_failed')).toBe(true)
  })

  it('does not create artifacts or workspace files when registries are absent', async () => {
    const team = buildTeam()
    const plan = buildPlan(team, 'o', '- write code')
    const events: TeamEvent[] = []

    const { promise } = executePlan({
      runId: 'run-1',
      plan,
      team,
      executeTask: async () => 'output',
      signal: createCancellationController().signal,
      onEvent: (e) => events.push(e),
      sharedContext: { entries: [], append: () => ({ id: '', taskId: '', taskTitle: '', delta: '', createdAt: 0 }), snapshot: () => '' } as any,
      onApprovalRequest: async () => ({ approved: true })
    })

    const result = await promise
    expect(result.status).toBe('completed')
    expect(events.some((e) => e.type === 'artifact_created')).toBe(false)
    expect(events.some((e) => e.type === 'workspace_file_locked')).toBe(false)
  })
})
