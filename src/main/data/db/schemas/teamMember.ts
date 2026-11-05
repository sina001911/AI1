import { sql } from 'drizzle-orm'
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { createUpdateTimestamps, orderKeyColumns, scopedOrderKeyIndex, uuidPrimaryKey } from './_columnHelpers'
import { teamTable } from './team'

export const SPECIALIST_ROLE_VALUES = [
  'coding',
  'research',
  'image',
  'video',
  'data-analyst',
  'reviewer',
  'general'
] as const

export const TOOL_PERMISSION_VALUES = ['allow', 'prompt', 'deny'] as const

export const teamMemberTable = sqliteTable(
  'team_member',
  {
    id: uuidPrimaryKey(),
    teamId: text()
      .notNull()
      .references(() => teamTable.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    role: text({ enum: SPECIALIST_ROLE_VALUES }).notNull(),
    providerId: text().notNull(),
    modelId: text().notNull(),
    temperature: real(),
    maxTokens: integer(),
    systemPrompt: text().notNull().default(''),
    toolPermissions: text({ mode: 'json' })
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'`),
    enabled: integer({ mode: 'boolean' }).notNull().default(true),
    ...orderKeyColumns,
    ...createUpdateTimestamps
  },
  (t) => [
    index('team_member_team_idx').on(t.teamId),
    index('team_member_role_idx').on(t.role),
    scopedOrderKeyIndex('team_member', 'teamId')(t)
  ]
)

export type TeamMemberRow = typeof teamMemberTable.$inferSelect
export type InsertTeamMemberRow = typeof teamMemberTable.$inferInsert
export type SpecialistRoleValue = (typeof SPECIALIST_ROLE_VALUES)[number]
