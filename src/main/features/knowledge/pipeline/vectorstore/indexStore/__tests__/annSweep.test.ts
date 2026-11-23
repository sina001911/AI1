import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { sweepAnnShadow } from '../annSweep'
import { type BetterSqlite3Driver, openBetterSqlite3IndexDriver } from '../BetterSqlite3Driver'
import { betterSqlite3VectorIndex } from '../BetterSqlite3VectorIndex'
import { hashEmbeddingText } from '../hashing'
import { KnowledgeIndexStore } from '../KnowledgeIndexStore'
import { createKnowledgeIndexSchema } from '../schema'

function buildEmbeddingRow(driver: BetterSqlite3Driver, hash: string, vector: number[]): void {
  driver.execute(`INSERT INTO embedding(embedding_text_hash, vector_blob, created_at) VALUES (?, ?, ?)`, [
    hash,
    Buffer.from(new Float32Array(vector).buffer),
    Date.now()
  ])
}

describe('annSweep', () => {
  let tempDir: string
  let driver: BetterSqlite3Driver
  let store: KnowledgeIndexStore

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cs-ann-sweep-'))
    driver = openBetterSqlite3IndexDriver(join(tempDir, 'index.sqlite'))
    createKnowledgeIndexSchema(driver, 3)
    store = new KnowledgeIndexStore(driver, betterSqlite3VectorIndex, true)
  })

  afterEach(() => {
    store.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('sweepAnnShadow returns 0 when shadow table is absent', () => {
    const h1 = hashEmbeddingText('alpha')
    buildEmbeddingRow(driver, h1, [0.1, 0.2, 0.3])

    const swept = sweepAnnShadow(driver)
    expect(swept).toBe(0)
  })

  it('sweepAnnShadow returns 0 when shadow table is empty but present', () => {
    // Manually create the map table (simulating a future vec0 build where
    // schema creation succeeded). No rows to sweep.
    driver.execute(
      `CREATE TABLE IF NOT EXISTS ann_embedding_map (
        ann_rowid INTEGER PRIMARY KEY,
        embedding_text_hash TEXT NOT NULL UNIQUE,
        inserted_at INTEGER NOT NULL,
        FOREIGN KEY (embedding_text_hash) REFERENCES embedding(embedding_text_hash)
      )`
    )

    const swept = sweepAnnShadow(driver)
    expect(swept).toBe(0)
  })
})
