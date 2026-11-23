import { loggerService } from '@logger'

import type { SqliteDriver } from './types'

const logger = loggerService.withContext('KnowledgeIndexStoreBackfill')

/** How many embedding rows to backfill per transaction. */
const BACKFILL_BATCH_SIZE = 500

/** How long a backfill pass may run before yielding to the OS message pump. */
const BACKFILL_YIELD_BUDGET_MS = 50

/**
 * Backfill the ANN shadow table from the embedding source of truth.
 *
 * Scans `embedding` rows whose hash is absent from `ann_embedding_map` in bounded
 * batches, inserting each into `ann_embedding` (capturing lastInsertRowid) and
 * `ann_embedding_map`. Runs under the caller's transaction; the caller is
 * responsible for holding the base mutation lock (KeyedMutex.runExclusive) and
 * yielding between batches via `setImmediate` if needed.
 *
 * Returns the number of rows backfilled in this call (0 when the shadow is fully
 * caught up). If the shadow table doesn't exist (vec0 unsupported), returns 0
 * without error.
 *
 * @param driver - The SQLite driver for the per-base index.
 * @param batchSize - Max rows to backfill in this call.
 * @returns Number of rows backfilled.
 */
export function backfillAnnShadow(driver: SqliteDriver, batchSize = BACKFILL_BATCH_SIZE): number {
  // If either shadow table doesn't exist (vec0 unsupported), there's nothing to backfill.
  try {
    driver.execute(`SELECT 1 FROM ann_embedding LIMIT 1`)
    driver.execute(`SELECT 1 FROM ann_embedding_map LIMIT 1`)
  } catch {
    return 0
  }

  let totalBackfilled = 0

  while (true) {
    const missing = driver.execute(
      `SELECT e.embedding_text_hash, e.vector_blob
       FROM embedding e
       LEFT JOIN ann_embedding_map m ON m.embedding_text_hash = e.embedding_text_hash
       WHERE m.ann_rowid IS NULL
       LIMIT ?`,
      [batchSize]
    )

    if (missing.rows.length === 0) break

    driver.transaction(() => {
      for (const row of missing.rows) {
        const hash = row.embedding_text_hash as string
        const blob = row.vector_blob as Buffer | Uint8Array | null
        if (blob == null) continue

        const insertResult = driver.execute(`INSERT INTO ann_embedding(rowid, embedding) VALUES (NULL, ?)`, [blob])
        const annRowid = insertResult.lastInsertRowid

        driver.execute(`INSERT INTO ann_embedding_map(ann_rowid, embedding_text_hash, inserted_at) VALUES (?, ?, ?)`, [
          annRowid,
          hash,
          Date.now()
        ])
      }
    })

    totalBackfilled += missing.rows.length
  }

  logger.debug('Ann shadow backfill batch complete', { backfilled: totalBackfilled })
  return totalBackfilled
}

/**
 * Repeatedly call {@link backfillAnnShadow} until the shadow is caught up, yielding
 * to the event loop between batches so a large backfill doesn't freeze the window.
 *
 * Mirrors `deleteMaterials`'s yield pattern: each batch runs in its own synchronous
 * transaction, and we `setImmediate` between batches once `BACKFILL_YIELD_BUDGET_MS`
 * has elapsed.
 *
 * @param driver - The SQLite driver for the per-base index.
 * @returns Total rows backfilled across all batches.
 */
export async function backfillAnnShadowUntilCaughtUp(driver: SqliteDriver): Promise<number> {
  let total = 0
  let lastYieldAt = Date.now()

  while (true) {
    const batch = backfillAnnShadow(driver)
    total += batch
    if (batch === 0) break

    if (Date.now() - lastYieldAt >= BACKFILL_YIELD_BUDGET_MS) {
      await new Promise<void>((resolve) => setImmediate(resolve))
      lastYieldAt = Date.now()
    }
  }

  return total
}
