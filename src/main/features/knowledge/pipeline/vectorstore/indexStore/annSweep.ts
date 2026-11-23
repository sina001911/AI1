import { loggerService } from '@logger'

import type { SqliteDriver } from './types'

const logger = loggerService.withContext('KnowledgeIndexStoreSweep')

/**
 * Sweep orphaned ANN shadow rows: delete `ann_embedding` rows whose hash no longer
 * exists in `embedding`, plus orphaned `ann_embedding_map` entries whose `ann_rowid`
 * no longer exists in `ann_embedding`.
 *
 * Runs under the caller's transaction (same base mutation lock as the delete/sweep
 * that orphaned them). Safe to call even when the shadow table doesn't exist
 * (vec0 unsupported) — returns 0 without error.
 *
 * @param driver - The SQLite driver for the per-base index.
 * @returns Number of shadow rows swept.
 */
export function sweepAnnShadow(driver: SqliteDriver): number {
  // If either shadow table doesn't exist (vec0 unsupported), there's nothing to sweep.
  try {
    driver.execute(`SELECT 1 FROM ann_embedding LIMIT 1`)
    driver.execute(`SELECT 1 FROM ann_embedding_map LIMIT 1`)
  } catch {
    return 0
  }

  let totalSwept = 0

  // Delete shadow map entries whose ann_rowid no longer exists in ann_embedding
  // (orphaned by a failed or partial backfill).
  const mapResult = driver.execute(
    `DELETE FROM ann_embedding_map
     WHERE ann_rowid NOT IN (SELECT rowid FROM ann_embedding)`
  )
  totalSwept += mapResult.changes

  // Delete vec0 rows whose embedding_text_hash no longer exists in embedding.
  // Join via ann_embedding_map to identify orphaned vec0 rows.
  const vecResult = driver.execute(
    `DELETE FROM ann_embedding
     WHERE rowid IN (
       SELECT m.ann_rowid
       FROM ann_embedding_map m
       LEFT JOIN embedding e ON e.embedding_text_hash = m.embedding_text_hash
       WHERE e.embedding_text_hash IS NULL
     )`
  )
  totalSwept += vecResult.changes

  if (totalSwept > 0) {
    logger.debug('Ann shadow sweep complete', { swept: totalSwept })
  }

  return totalSwept
}
