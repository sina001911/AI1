import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { createUpdateTimestamps, uuidPrimaryKey } from './_columnHelpers'

export const EXECUTION_STRATEGY_VALUES = ['sequential', 'parallel', 'dependency-based', 'leader-delegation'] as const

export const teamTable = sqliteTable(
  'team',
  {
    id: uuidPrimaryKey(),
    name: text().notNull(),
    description: text().notNull().default(''),
    strategy: text({ enum: EXECUTION_STRATEGY_VALUES }).notNull().default('dependency-based'),
    maxConcurrency: integer().notNull().default(4),
    // Leader configuration stored as JSON (1:1 with team).
    leaderConfig: text({ mode: 'json' })
      .$type<{
        name: string
        providerId: string
        modelId: string
        temperature?: number
        maxTokens?: number
        systemPrompt: string
      }>()
      .notNull()
      .default(sql`'{}'`),
    ...createUpdateTimestamps
  },
  (t) => [index('team_name_idx').on(t.name)]
)

export type TeamRow = typeof teamTable.$inferSelect
export type InsertTeamRow = typeof teamTable.$inferInsert
export type ExecutionStrategyValue = (typeof EXECUTION_STRATEGY_VALUES)[number]
