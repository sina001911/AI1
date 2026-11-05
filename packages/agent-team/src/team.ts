import * as z from 'zod'

import {
  type Leader,
  type ModelConfig,
  type Specialist,
  type SpecialistRole,
  type Team,
  type ToolPermissionMap,
  EXECUTION_STRATEGIES,
  SPECIALIST_ROLES,
  TOOL_PERMISSIONS
} from './types'

export const SpecialistRoleSchema = z.enum(SPECIALIST_ROLES)
export const ExecutionStrategySchema = z.enum(EXECUTION_STRATEGIES)
export const ToolPermissionSchema = z.enum(TOOL_PERMISSIONS)

export const ModelConfigSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional()
})

export const ToolPermissionMapSchema = z.record(z.string(), ToolPermissionSchema)

export const SpecialistSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  name: z.string().min(1).max(80),
  role: SpecialistRoleSchema,
  modelConfig: ModelConfigSchema,
  systemPrompt: z.string().max(8000),
  toolPermissions: ToolPermissionMapSchema,
  enabled: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number()
})

export const LeaderSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  name: z.string().min(1).max(80),
  modelConfig: ModelConfigSchema,
  systemPrompt: z.string().max(8000),
  createdAt: z.number(),
  updatedAt: z.number()
})

export const TeamSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(500),
  strategy: ExecutionStrategySchema,
  maxConcurrency: z.number().int().min(1).max(16),
  leader: LeaderSchema,
  specialists: z.array(SpecialistSchema),
  createdAt: z.number(),
  updatedAt: z.number()
})

export function createId(): string {
  return crypto.randomUUID()
}

export function now(): number {
  return Date.now()
}

export function makeModelConfig(
  providerId: string,
  modelId: string,
  overrides: Partial<ModelConfig> = {}
): ModelConfig {
  return { providerId, modelId, ...overrides }
}

export function makeSpecialist(
  teamId: string,
  input: Omit<Specialist, 'id' | 'teamId' | 'createdAt' | 'updatedAt'>
): Specialist {
  const t = now()
  return {
    ...input,
    id: createId(),
    teamId,
    createdAt: t,
    updatedAt: t
  }
}

export function makeLeader(teamId: string, input: Omit<Leader, 'id' | 'teamId' | 'createdAt' | 'updatedAt'>): Leader {
  const t = now()
  return {
    ...input,
    id: createId(),
    teamId,
    createdAt: t,
    updatedAt: t
  }
}

export function makeTeam(
  input: Omit<Team, 'id' | 'createdAt' | 'updatedAt' | 'specialists' | 'leader'> & {
    leader: Omit<Leader, 'id' | 'teamId' | 'createdAt' | 'updatedAt'>
    specialists: Omit<Specialist, 'id' | 'teamId' | 'createdAt' | 'updatedAt'>[]
  }
): Team {
  const t = now()
  const id = createId()
  const leader = makeLeader(id, input.leader)
  const specialists = input.specialists.map((s) => makeSpecialist(id, s))
  return {
    ...input,
    id,
    leader,
    specialists,
    createdAt: t,
    updatedAt: t
  }
}

export function validateTeam(input: unknown): Team {
  return TeamSchema.parse(input)
}

export function validateSpecialist(input: unknown): Specialist {
  return SpecialistSchema.parse(input)
}

export function validateLeader(input: unknown): Leader {
  return LeaderSchema.parse(input)
}

export function validateModelConfig(input: unknown): ModelConfig {
  return ModelConfigSchema.parse(input)
}

export function defaultSystemPrompt(role: SpecialistRole): string {
  switch (role) {
    case 'coding':
      return 'You are a senior software engineer. Write clean, correct, well-tested code. Explain your reasoning briefly and provide complete, runnable code.'
    case 'research':
      return 'You are a thorough research analyst. Summarize findings clearly, cite sources where available, and flag uncertainty.'
    case 'image':
      return 'You are an image generation specialist. Produce a detailed, evocative prompt suitable for an image model, including subject, style, lighting, composition, and mood.'
    case 'video':
      return 'You are a video production specialist. Produce a detailed shot list and prompt suitable for a video model, including subject, camera movement, pacing, and style.'
    case 'data-analyst':
      return 'You are a data analyst. Analyze data rigorously, describe distributions and trends, and present findings with clear structure and caveats.'
    case 'reviewer':
      return 'You are a code and content reviewer. Evaluate work against explicit criteria, cite specific issues, and give actionable feedback.'
    case 'general':
      return 'You are a helpful general-purpose assistant. Answer clearly and concisely, adapting to the user request.'
    default:
      return 'You are a helpful assistant.'
  }
}

export function defaultToolPermissions(role: SpecialistRole): ToolPermissionMap {
  const prompt: ToolPermissionMap = { '*': 'prompt' }
  const allow: ToolPermissionMap = { '*': 'allow' }
  switch (role) {
    case 'coding':
      return { 'file.read': 'allow', 'file.write': 'prompt', 'shell.execute': 'prompt', ...allow }
    case 'research':
      return { 'web.search': 'allow', 'web.fetch': 'allow', ...allow }
    case 'image':
      return { 'image.generate': 'allow', ...allow }
    case 'video':
      return { 'video.generate': 'allow', ...allow }
    case 'data-analyst':
      return { 'file.read': 'allow', 'data.query': 'allow', ...allow }
    case 'reviewer':
      return { 'file.read': 'allow', ...allow }
    case 'general':
      return { ...prompt }
    default:
      return { ...prompt }
  }
}
