import { asc, desc, eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'

import { application } from '@application'
import { teamTable } from '@data/db/schemas/team'
import type { InsertTeamRow, TeamRow } from '@data/db/schemas/team'
import { teamMemberTable } from '@data/db/schemas/teamMember'
import type { InsertTeamMemberRow, TeamMemberRow } from '@data/db/schemas/teamMember'
import { teamRunTable } from '@data/db/schemas/teamRun'
import type { InsertTeamRunRow, TeamRunRow } from '@data/db/schemas/teamRun'
import { teamRunEventTable } from '@data/db/schemas/teamRunEvent'
import type { InsertTeamRunEventRow, TeamRunEventRow } from '@data/db/schemas/teamRunEvent'
import { teamTaskTable } from '@data/db/schemas/teamTask'
import type { InsertTeamTaskRow, TeamTaskRow } from '@data/db/schemas/teamTask'
import type { DbOrTx } from '@data/db/types'

/**
 * Persistence layer for Collaborative Studio domain objects.
 *
 * Reads use the live DB connection (`getDb()`); writes run inside a single
 * synchronous `BEGIN IMMEDIATE` transaction via `withWriteTx()`. All FK
 * cascades are declared at the schema level, so deleting a team removes its
 * members, tasks, runs and events automatically.
 */
export class TeamRepository {
  private db(): DbOrTx {
    return application.get('DbService').getDb()
  }

  private tx<T>(fn: (tx: DbOrTx) => T): T {
    return application.get('DbService').withWriteTx(fn)
  }

  // ------------------------------------------------------------------ teams

  createTeam(row: InsertTeamRow): TeamRow {
    const created = this.tx((tx) =>
      tx
        .insert(teamTable)
        .values({ id: uuidv4(), ...row })
        .returning()
        .all()
    )
    return created[0]
  }

  getTeam(id: string): TeamRow | undefined {
    return this.db().select().from(teamTable).where(eq(teamTable.id, id)).get()
  }

  listTeams(): TeamRow[] {
    return this.db().select().from(teamTable).orderBy(asc(teamTable.name)).all()
  }

  updateTeam(id: string, patch: Partial<Omit<InsertTeamRow, 'id'>>): TeamRow | undefined {
    const updated = this.tx((tx) =>
      tx
        .update(teamTable)
        .set({ ...patch, updatedAt: Date.now() })
        .where(eq(teamTable.id, id))
        .returning()
        .all()
    )
    return updated[0]
  }

  deleteTeam(id: string): void {
    this.tx((tx) => tx.delete(teamTable).where(eq(teamTable.id, id)).run())
  }

  // ---------------------------------------------------------------- members

  createMember(row: InsertTeamMemberRow): TeamMemberRow {
    const created = this.tx((tx) =>
      tx
        .insert(teamMemberTable)
        .values({ id: uuidv4(), ...row })
        .returning()
        .all()
    )
    return created[0]
  }

  getMember(id: string): TeamMemberRow | undefined {
    return this.db().select().from(teamMemberTable).where(eq(teamMemberTable.id, id)).get()
  }

  listMembers(teamId: string): TeamMemberRow[] {
    return this.db()
      .select()
      .from(teamMemberTable)
      .where(eq(teamMemberTable.teamId, teamId))
      .orderBy(asc(teamMemberTable.orderKey))
      .all()
  }

  updateMember(id: string, patch: Partial<Omit<InsertTeamMemberRow, 'id'>>): TeamMemberRow | undefined {
    const updated = this.tx((tx) =>
      tx
        .update(teamMemberTable)
        .set({ ...patch, updatedAt: Date.now() })
        .where(eq(teamMemberTable.id, id))
        .returning()
        .all()
    )
    return updated[0]
  }

  deleteMember(id: string): void {
    this.tx((tx) => tx.delete(teamMemberTable).where(eq(teamMemberTable.id, id)).run())
  }

  // ------------------------------------------------------------------ tasks

  createTask(row: InsertTeamTaskRow): TeamTaskRow {
    const created = this.tx((tx) =>
      tx
        .insert(teamTaskTable)
        .values({ id: uuidv4(), ...row })
        .returning()
        .all()
    )
    return created[0]
  }

  getTask(id: string): TeamTaskRow | undefined {
    return this.db().select().from(teamTaskTable).where(eq(teamTaskTable.id, id)).get()
  }

  listTasksByRun(runId: string): TeamTaskRow[] {
    return this.db()
      .select()
      .from(teamTaskTable)
      .where(eq(teamTaskTable.runId, runId))
      .orderBy(asc(teamTaskTable.createdAt))
      .all()
  }

  listTasksByTeam(teamId: string): TeamTaskRow[] {
    return this.db()
      .select()
      .from(teamTaskTable)
      .where(eq(teamTaskTable.teamId, teamId))
      .orderBy(asc(teamTaskTable.createdAt))
      .all()
  }

  updateTask(id: string, patch: Partial<Omit<InsertTeamTaskRow, 'id'>>): TeamTaskRow | undefined {
    const updated = this.tx((tx) =>
      tx
        .update(teamTaskTable)
        .set({ ...patch, updatedAt: Date.now() })
        .where(eq(teamTaskTable.id, id))
        .returning()
        .all()
    )
    return updated[0]
  }

  deleteTask(id: string): void {
    this.tx((tx) => tx.delete(teamTaskTable).where(eq(teamTaskTable.id, id)).run())
  }

  // -------------------------------------------------------------------- runs

  createRun(row: InsertTeamRunRow): TeamRunRow {
    const created = this.tx((tx) =>
      tx
        .insert(teamRunTable)
        .values({ id: uuidv4(), ...row })
        .returning()
        .all()
    )
    return created[0]
  }

  getRun(id: string): TeamRunRow | undefined {
    return this.db().select().from(teamRunTable).where(eq(teamRunTable.id, id)).get()
  }

  listRuns(teamId: string): TeamRunRow[] {
    return this.db()
      .select()
      .from(teamRunTable)
      .where(eq(teamRunTable.teamId, teamId))
      .orderBy(desc(teamRunTable.startedAt))
      .all()
  }

  updateRun(id: string, patch: Partial<Omit<InsertTeamRunRow, 'id'>>): TeamRunRow | undefined {
    const updated = this.tx((tx) =>
      tx
        .update(teamRunTable)
        .set({ ...patch, updatedAt: Date.now() })
        .where(eq(teamRunTable.id, id))
        .returning()
        .all()
    )
    return updated[0]
  }

  // ------------------------------------------------------------- run events

  appendEvent(row: InsertTeamRunEventRow): TeamRunEventRow {
    const created = this.tx((tx) => tx.insert(teamRunEventTable).values(row).returning().all())
    return created[0]
  }

  listEvents(runId: string): TeamRunEventRow[] {
    return this.db()
      .select()
      .from(teamRunEventTable)
      .where(eq(teamRunEventTable.runId, runId))
      .orderBy(asc(teamRunEventTable.createdAt))
      .all()
  }

  /**
   * Insert a run and its tasks in a single synchronous `BEGIN IMMEDIATE`
   * transaction. The caller supplies the run id so every task row can cite
   * it as its FK in the same statement that creates the run — the run row is
   * the parent of every task row, and if any task fails to insert, no run row
   * is left orphaned.
   */
  createRunWithTasks(
    runId: string,
    run: Omit<InsertTeamRunRow, 'id'>,
    tasks: Omit<InsertTeamTaskRow, 'id'>[]
  ): { run: TeamRunRow; tasks: TeamTaskRow[] } {
    return this.tx((tx) => {
      const runRow = tx
        .insert(teamRunTable)
        .values({ id: runId, ...run })
        .returning()
        .all()
      const taskRows = tx
        .insert(teamTaskTable)
        .values(tasks.map((t) => ({ id: uuidv4(), ...t, runId })))
        .returning()
        .all() as TeamTaskRow[]
      return { run: runRow[0], tasks: taskRows }
    })
  }
}

export const teamRepository = new TeamRepository()
