import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { createUpdateTimestamps, uuidPrimaryKey } from './_columnHelpers'
import { teamTable } from './team'
import { teamMemberTable } from './teamMember'
import { teamRunTable } from './teamRun'

export const TASK_STATUS_VALUES = [
  'pending',
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
  'retrying'
] as const

export const teamTaskTable = sqliteTable(
  'team_task',
  {
    id: uuidPrimaryKey(),
    teamId: text()
      .notNull()
      .references(() => teamTable.id, { onDelete: 'cascade' }),
    runId: text().references(() => teamRunTable.id, { onDelete: 'cascade' }),
    parentId: text().references(() => teamTaskTable.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    description: text().notNull().default(''),
    assignedTo: text().references(() => teamMemberTable.id, { onDelete: 'set null' }),
    dependencies: text({ mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    gate: text({ enum: ['none', 'approval', 'review'] })
      .notNull()
      .default('none'),
    status: text({ enum: TASK_STATUS_VALUES }).notNull().default('pending'),
    input: text().notNull().default(''),
    output: text(),
    error: text(),
    retryCount: integer().notNull().default(0),
    maxRetries: integer().notNull().default(2),
    ...createUpdateTimestamps
  },
  (t) => [
    index('team_task_team_idx').on(t.teamId),
    index('team_task_run_idx').on(t.runId),
    index('team_task_status_idx').on(t.status),
    index('team_task_assigned_idx').on(t.assignedTo),
    index('team_task_parent_idx').on(t.parentId)
  ]
)

export type TeamTaskRow = typeof teamTaskTable.$inferSelect
export type InsertTeamTaskRow = typeof teamTaskTable.$inferInsert
export type TaskStatusValue = (typeof TASK_STATUS_VALUES)[number]
