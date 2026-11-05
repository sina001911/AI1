import { buildPlan, validatePlan } from '@cherrystudio/agent-team/plan'
import type { ExecutionPlan, Team } from '@cherrystudio/agent-team/types'
import { loggerService } from '@logger'

import { callLeaderText } from './LeaderModel'

const logger = loggerService.withContext('AgentTeam:LeaderDecomposer')

const DECOMPOSE_SYSTEM_PROMPT = `You are the Leader of a collaborative AI studio.
Decompose the user's objective into an ordered list of concrete subtasks that
specialists can execute independently. Each subtask must include:
- title: short imperative phrase
- description: what the specialist should produce
- dependencies: titles of subtasks that must finish first (empty array if none)

Reply with ONLY a JSON array, no prose:
[{"title":"...","description":"...","dependencies":[]}]
If the objective is already atomic, return a single-element array.`

export interface DecomposeInput {
  team: Team
  objective: string
}

export interface DecomposeResult {
  plan: ExecutionPlan
  raw: string
}

/**
 * Ask the configured Leader model to decompose an objective into an
 * ExecutionPlan. Falls back to a single-task plan if the model call fails.
 */
export async function decomposeObjective(input: DecomposeInput): Promise<DecomposeResult> {
  const { team, objective } = input
  const leader = team.leader

  try {
    const text = await callLeaderText(
      {
        providerId: leader.modelConfig.providerId,
        modelId: leader.modelConfig.modelId,
        temperature: leader.modelConfig.temperature,
        maxTokens: leader.modelConfig.maxTokens,
        systemPrompt: leader.systemPrompt || DECOMPOSE_SYSTEM_PROMPT
      },
      `Objective:\n${objective}\n\nTeam strategy: ${team.strategy}`
    )

    const plan = buildPlan(team, objective, text)
    const errors = validatePlan(plan, team)
    if (errors.length > 0) {
      logger.warn('Leader plan failed validation, using fallback', { errors })
      return fallbackPlan(team, objective, `plan validation failed: ${errors.join('; ')}`)
    }
    return { plan, raw: text }
  } catch (error) {
    logger.warn('Leader decomposition failed', {
      providerId: leader.modelConfig.providerId,
      modelId: leader.modelConfig.modelId,
      error: (error as Error).message
    })
    return fallbackPlan(team, objective, `decomposition failed: ${(error as Error).message}`)
  }
}

function fallbackPlan(team: Team, objective: string, reason: string): DecomposeResult {
  logger.info('Using single-task fallback plan', { reason })
  const plan = buildPlan(
    team,
    objective,
    JSON.stringify([{ title: objective.slice(0, 120), description: objective, dependencies: [] }])
  )
  return { plan, raw: `fallback:${reason}` }
}
