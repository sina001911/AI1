import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { uuidPrimaryKeyOrdered } from './_columnHelpers'
import { teamRunTable } from './teamRun'

export const teamRunEventTable = sqliteTable(
  'team_run_event',
  {
    id: uuidPrimaryKeyOrdered(),
    runId: text()
      .notNull()
      .references(() => teamRunTable.id, { onDelete: 'cascade' }),
    type: text().notNull(),
    payload: text({ mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    createdAt: integer().notNull()
  },
  (t) => [index('team_run_event_run_idx').on(t.runId), index('team_run_event_created_idx').on(t.createdAt)]
)

export type TeamRunEventRow = typeof teamRunEventTable.$inferSelect
export type InsertTeamRunEventRow = typeof teamRunEventTable.$inferInsert
