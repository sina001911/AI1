import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { createUpdateTimestamps, uuidPrimaryKey } from './_columnHelpers'
import { teamTable } from './team'

export const RUN_STATUS_VALUES = ['created', 'running', 'paused', 'completed', 'failed', 'cancelled'] as const

export const teamRunTable = sqliteTable(
  'team_run',
  {
    id: uuidPrimaryKey(),
    teamId: text()
      .notNull()
      .references(() => teamTable.id, { onDelete: 'cascade' }),
    objective: text().notNull(),
    status: text({ enum: RUN_STATUS_VALUES }).notNull().default('created'),
    result: text(),
    error: text(),
    startedAt: integer().notNull(),
    completedAt: integer(),
    cancelledAt: integer(),
    ...createUpdateTimestamps
  },
  (t) => [
    index('team_run_team_idx').on(t.teamId),
    index('team_run_status_idx').on(t.status),
    index('team_run_started_idx').on(t.startedAt)
  ]
)

export type TeamRunRow = typeof teamRunTable.$inferSelect
export type InsertTeamRunRow = typeof teamRunTable.$inferInsert
export type RunStatusValue = (typeof RUN_STATUS_VALUES)[number]
