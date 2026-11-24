import { mkdirSync, existsSync } from 'node:fs'

import Database from 'better-sqlite3'
import type { Database as BetterSqlite3Database } from 'better-sqlite3'

const DB_PATH = process.env.DB_PATH ?? './data/ai1.db'

// Ensure the data directory exists
const dir = DB_PATH.includes('/') ? DB_PATH.split('/').slice(0, -1).join('/') : '.'
if (dir && dir !== '.' && !existsSync(dir)) {
  mkdirSync(dir, { recursive: true })
}

const database: BetterSqlite3Database = new Database(DB_PATH)
database.pragma('journal_mode = WAL')
database.pragma('foreign_keys = ON')

export { database }

export function runMigrations() {
  // Migrations are applied via drizzle-kit; this is a placeholder for future programmatic migration
}

export function closeDb() {
  database.close()
}
