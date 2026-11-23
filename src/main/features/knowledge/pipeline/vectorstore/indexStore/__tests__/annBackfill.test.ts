import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { backfillAnnShadow, backfillAnnShadowUntilCaughtUp } from '../annBackfill'
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

describe('annBackfill', () => {
  let tempDir: string
  let driver: BetterSqlite3Driver
  let store: KnowledgeIndexStore

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cs-ann-backfill-'))
    driver = openBetterSqlite3IndexDriver(join(tempDir, 'index.sqlite'))
    createKnowledgeIndexSchema(driver, 3)
    store = new KnowledgeIndexStore(driver, betterSqlite3VectorIndex, true)
  })

  afterEach(() => {
    store.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('hasAnnShadow returns false when vec0 unsupported (shadow table absent)', () => {
    expect(store.hasAnnShadow()).toBe(false)
  })

  it('backfillAnnShadow returns 0 when shadow table is absent', () => {
    const h1 = hashEmbeddingText('alpha')
    buildEmbeddingRow(driver, h1, [0.1, 0.2, 0.3])

    const backfilled = backfillAnnShadow(driver)
    expect(backfilled).toBe(0)
  })

  it('backfillAnnShadowUntilCaughtUp returns 0 when shadow table is absent', async () => {
    const h1 = hashEmbeddingText('alpha')
    buildEmbeddingRow(driver, h1, [0.1, 0.2, 0.3])

    const total = await backfillAnnShadowUntilCaughtUp(driver)
    expect(total).toBe(0)
  })

  it('backfillAnnShadow is idempotent when table absent (repeated calls return 0)', () => {
    const h1 = hashEmbeddingText('alpha')
    buildEmbeddingRow(driver, h1, [0.1, 0.2, 0.3])

    expect(backfillAnnShadow(driver)).toBe(0)
    expect(backfillAnnShadow(driver)).toBe(0)
    expect(backfillAnnShadow(driver)).toBe(0)
  })
})
