import { type ExecutionResult, type Task, type TeamEvent } from './types'

export interface SynthesisInput {
  runId: string
  objective: string
  tasks: Task[]
  leaderPrompt?: string
}

export interface SynthesisResult {
  result: string
  usedTaskIds: string[]
}

export function buildSynthesisPrompt(input: SynthesisInput): string {
  const completed = input.tasks.filter((t) => t.status === 'completed' && t.output)
  const failed = input.tasks.filter((t) => t.status === 'failed')
  const cancelled = input.tasks.filter((t) => t.status === 'cancelled')

  const sections: string[] = []
  sections.push(`Objective: ${input.objective}`)
  sections.push('')
  sections.push('Synthesize the following specialist outputs into a single coherent final answer.')
  sections.push('Cite which specialist contributed each section.')
  sections.push('If some tasks failed, note the gap and work around it if possible.')
  sections.push('')

  if (completed.length > 0) {
    sections.push('=== COMPLETED TASK OUTPUTS ===')
    for (const t of completed) {
      sections.push(`--- Task: ${t.title} ---`)
      sections.push(t.output ?? '(empty)')
      sections.push('')
    }
  }

  if (failed.length > 0) {
    sections.push('=== FAILED TASKS ===')
    for (const t of failed) {
      sections.push(`- ${t.title}: ${t.error ?? 'unknown error'}`)
    }
    sections.push('')
  }

  if (cancelled.length > 0) {
    sections.push('=== CANCELLED TASKS ===')
    for (const t of cancelled) {
      sections.push(`- ${t.title}`)
    }
    sections.push('')
  }

  if (input.leaderPrompt) {
    sections.push('=== ADDITIONAL CONTEXT ===')
    sections.push(input.leaderPrompt)
    sections.push('')
  }

  return sections.join('\n')
}

export function extractUsedTaskIds(result: string, tasks: Task[]): string[] {
  const used = new Set<string>()
  for (const t of tasks) {
    if (t.output && result.includes(t.output.slice(0, 40))) {
      used.add(t.id)
    }
  }
  return Array.from(used)
}

export function makeSynthesisEvent(runId: string, result: SynthesisResult): TeamEvent {
  return { type: 'synthesis_completed', runId, result: result.result }
}

export function makeRunCompletedEvent(runId: string, result: ExecutionResult): TeamEvent {
  return { type: 'run_completed', runId, result: result.result ?? '(no result)' }
}

export function makeRunFailedEvent(runId: string, error: string): TeamEvent {
  return { type: 'run_failed', runId, error }
}
