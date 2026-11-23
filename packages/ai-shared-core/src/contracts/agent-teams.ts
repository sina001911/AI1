import * as z from 'zod'

export const CreateTeamRequest = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  strategy: z.enum(['sequential', 'parallel', 'dependency-based', 'leader-delegation']),
  maxConcurrency: z.number().int().positive().max(10).optional().default(3)
})

export type CreateTeamRequest = z.infer<typeof CreateTeamRequest>

export const TeamResponse = z.object({
  id: z.string(),
  name: z.string(),
  description: z.nullable(z.string()),
  strategy: z.enum(['sequential', 'parallel', 'dependency-based', 'leader-delegation']),
  maxConcurrency: z.number(),
  createdAt: z.number(),
  updatedAt: z.number()
})

export type TeamResponse = z.infer<typeof TeamResponse>

export const CreateRunRequest = z.object({
  teamId: z.string(),
  objective: z.string().min(1)
})

export type CreateRunRequest = z.infer<typeof CreateRunRequest>

export const RunResponse = z.object({
  id: z.string(),
  teamId: z.string(),
  objective: z.string(),
  status: z.enum(['created', 'running', 'paused', 'completed', 'failed', 'cancelled']),
  result: z.nullable(z.string()),
  error: z.nullable(z.string()),
  startedAt: z.number(),
  completedAt: z.nullable(z.number()),
  cancelledAt: z.nullable(z.number())
})

export type RunResponse = z.infer<typeof RunResponse>

export const AgentTeamEvent = z.object({
  type: z.string(),
  runId: z.string()
})

export type AgentTeamEvent = z.infer<typeof AgentTeamEvent>
