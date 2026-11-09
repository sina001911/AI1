import { pickSpecialistByCapability } from './capabilities'
import { createId, now } from './team'
import { type AgentCapabilities, type ExecutionPlan, type Task, type TaskGate, type Team } from './types'

export function buildPlan(team: Team, objective: string, raw: string): ExecutionPlan {
  const tasks = parseTaskList(raw, team.id)
  const assigned = assignTasks(
    { teamId: team.id, objective, tasks, strategy: team.strategy, reasoning: '', createdAt: now() },
    team
  )
  return {
    teamId: team.id,
    objective,
    tasks: assigned.tasks,
    strategy: team.strategy,
    reasoning: '',
    createdAt: now()
  }
}

function parseTaskList(raw: string, teamId: string): Task[] {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const tasks: Task[] = []
  const byTitle = new Map<string, string>()
  for (const line of lines) {
    const cleaned = line.replace(/^[-*\d.\s)\]]+/, '')
    const depMatch = cleaned.match(/(?:depends on|requires|blocked by|after)\s+["']?([^"'\n]+?)["']?(?:[.,;]|$)/i)
    const deps: string[] = []
    if (depMatch) {
      const ref = depMatch[1].trim()
      const id = byTitle.get(ref)
      if (id) deps.push(id)
    }
    // A task marked `requires approval` or `needs review` is held at the gate
    // until a human decides. The marker is stripped from the title/description
    // so the specialist never sees the housekeeping.
    const gateMatch = cleaned.match(/\b(requires approval|needs review|approval required|review required)\b/i)
    const gate: TaskGate = gateMatch ? (gateMatch[1].toLowerCase().includes('review') ? 'review' : 'approval') : 'none'
    const id = createId()
    byTitle.set(cleaned, id)
    tasks.push({
      id,
      teamId,
      parentId: null,
      title: cleaned.slice(0, 120),
      description: cleaned,
      assignedTo: null,
      dependencies: deps,
      status: 'pending',
      gate,
      input: cleaned,
      output: null,
      error: null,
      retryCount: 0,
      maxRetries: 2,
      createdAt: now(),
      startedAt: null,
      completedAt: null
    })
  }
  return tasks
}

export function assignTasks(plan: ExecutionPlan, team: Team): ExecutionPlan {
  const enabled = team.specialists.filter((s) => s.enabled)
  if (enabled.length === 0) throw new Error('Team has no enabled specialists')
  // Route every task through the shared capability engine instead of a
  // hand-rolled keyword map, so the coding/research/image/video/data
  // domains are all scored by the same feature-overlap logic.
  const capabilityCache = new Map<string, AgentCapabilities>()
  const assigned = plan.tasks.map((t) => {
    const specialist = pickSpecialistByCapability(t, enabled, capabilityCache)
    if (!specialist) throw new Error(`No specialist available for task "${t.title}"`)
    return { ...t, assignedTo: specialist.id }
  })
  return { ...plan, tasks: assigned }
}

export function validatePlan(plan: ExecutionPlan, team: Team): string[] {
  const errors: string[] = []
  if (!plan.objective || plan.objective.trim().length === 0) errors.push('Objective is required')
  if (plan.tasks.length === 0) errors.push('Plan must contain at least one task')
  const ids = new Set(plan.tasks.map((t) => t.id))
  for (const t of plan.tasks) {
    for (const d of t.dependencies) {
      if (!ids.has(d)) errors.push(`Task ${t.title} depends on unknown task ${d}`)
    }
    if (t.assignedTo && !team.specialists.some((s) => s.id === t.assignedTo)) {
      errors.push(`Task ${t.title} assigned to unknown specialist ${t.assignedTo}`)
    }
  }
  return errors
}

export function topologicalOrder(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const visited = new Set<string>()
  const temp = new Set<string>()
  const order: Task[] = []
  const visit = (id: string): boolean => {
    if (visited.has(id)) return true
    if (temp.has(id)) return false
    temp.add(id)
    const t = byId.get(id)
    if (!t) return false
    for (const d of t.dependencies) {
      if (!visit(d)) return false
    }
    temp.delete(id)
    visited.add(id)
    order.push(t)
    return true
  }
  for (const t of tasks) {
    if (!visit(t.id)) {
      return tasks
    }
  }
  return order
}
