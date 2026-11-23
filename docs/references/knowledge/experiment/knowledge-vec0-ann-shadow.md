---
description: Approach B design - dual-layer ANN shadow table (sqlite-vec vec0) over the immutable embedding BLOB source of truth, for sub-linear knowledge vector search
sources:
  - src/main/features/knowledge/pipeline/vectorstore/indexStore
  - docs/references/knowledge/experiment/knowledge-technical-design.md
---

# Knowledge Vector Search: Approach B — Dual-layer ANN Shadow Table (vec0)

**Status:** Proposed spec — spec only, zero code changes.  
**Scope:** Per-base derived `index.sqlite`, vector retrieval lane only. BM25, hybrid RRF, visibility filtering, reranking, and ranking are unchanged.  
**Decisions referenced:** knowledge-technical-design.md §4 (index schema), §5.6 (driver/portability, decision A1), §6 (retrieval); `KNOWLEDGE_INDEX_SCHEMA_VERSION = 2`.

## 1. Context and problem

Today (Approach A) every vector search executes a brute-force cosine scan:

```sql
SELECT ... FROM embedding e
JOIN search_text st ON st.embedding_text_hash = e.embedding_text_hash ...
JOIN search_unit su ON su.unit_id = st.target_id
WHERE vec_distance_cosine(e.vector_blob, ?) IS NOT NULL
ORDER BY dist
LIMIT ?
```

`vec_distance_cosine` is evaluated over **every** stored embedding, so vector search is O(n) in index size and blocks the main-process event loop for the duration of the scan (better-sqlite3 is synchronous). For large bases this is the retrieval latency ceiling, and it only grows with the index.

## 2. Goals and non-goals

**Goals**

- Sub-linear ANN vector search via sqlite-vec's `vec0` virtual table (HNSW), with the plain-BLOB `embedding` column left untouched as the source of truth — no re-encode, no `F32_BLOB` migration, no user-facing migration.
- ANN population is asynchronous and off the critical indexing path (`rebuildMaterial` keeps writing `embedding` synchronously exactly as today).
- Search results remain sound and complete: ANN answers first, brute-force scan covers misses.
- Instant rollback: disabling the shadow restores today's brute-force behavior with no data migration.

**Non-goals**

- Replacing `embedding.vector_blob` with a native vector column.
- Removing the brute-force lane (it stays as the correctness backstop).
- Changing BM25/hybrid RRF, the `KnowledgeIndexSearchMatch` shape, or any caller of `KnowledgeIndexStore.search()`.
- Multi-base or cross-base ANN.

## 3. Design overview

Two layers, one derived index database:

| Layer | Table | Role | Consistency |
|---|---|---|---|
| Source of truth | `embedding(embedding_text_hash, vector_blob)` | Canonical float32 BLOB; written synchronously by `rebuildMaterial` | Strong (unchanged) |
| ANN shadow | `ann_embedding` (vec0) + `ann_embedding_map` | HNSW index over the same vectors, keyed by `ann_rowid → embedding_text_hash` | Eventual (async population) |

The shadow is a **derived, rebuildable artifact**, like the rest of `index.sqlite`: everything it holds can be reconstructed from `embedding` at any time. It is never consulted for membership — every ANN hit is re-joined against `search_text`/`search_unit`/`material`, so stale shadow rows simply fail to join and are dropped.

## 4. (1) Schema for the shadow ANN table

`vec0` holds only the vector column (plus hidden `rowid`/`distance`), so the business key lives in a parallel plain table:

```sql
-- ANN index proper: engine-specific, vector-only, one row per embedding.
-- Dimension is the base's immutable `dimensions` (baked into the DDL at store open;
-- a dimension change means a new base, so the table never needs an ALTER).
CREATE VIRTUAL TABLE IF NOT EXISTS ann_embedding
  USING vec0(embedding FLOAT32[{dim}]);

-- Rowid ↔ business key map. FK to `embedding` keeps orphans detectable;
-- `inserted_at` supports batch-scoped rollback of a backfill run.
CREATE TABLE IF NOT EXISTS ann_embedding_map (
  ann_rowid INTEGER PRIMARY KEY,
  embedding_text_hash TEXT NOT NULL UNIQUE,
  inserted_at INTEGER NOT NULL,
  FOREIGN KEY (embedding_text_hash) REFERENCES embedding(embedding_text_hash)
);
CREATE INDEX IF NOT EXISTS ann_embedding_map_hash_idx
  ON ann_embedding_map(embedding_text_hash);
```

- `ann_embedding.rowid` is the ANN id returned by `vec0` queries; `ann_embedding_map` translates it to `embedding_text_hash`, then to `search_text` → `search_unit` → `material`, exactly like the brute-force lane.
- `{dim}` is concrete per base (immutable per base — existing invariant). Store-open validates that a mounted `ann_embedding` table's dimension matches `base.dimensions`; a mismatch marks the shadow unhealthy and falls back to brute-force (sqlite-vec raises a dimension error on query otherwise).
- DDL is added to `KNOWLEDGE_INDEX_SCHEMA_STATEMENTS` with a `KNOWLEDGE_INDEX_SCHEMA_VERSION` bump (3 →), so store-open recreates the derived index — shadow included — on mismatch. New tables only (`CREATE ... IF NOT EXISTS`) need no bump; this one changes the object set, so it does.
- Portability note (decision A1): the `vec0` virtual table is sqlite-vec-specific, unlike the rest of the schema. The index already requires sqlite-vec for `vec_distance_cosine`, so this adds no new engine dependency; the fallback guarantees the same results on any engine if `vec0` is unavailable.

## 5. (2) How the shadow is populated

All population reads `vector_blob` (the source of truth) — **no embedding API calls**. Raw LE float32 bytes bind directly as the `vec0` vector value (no re-encode).

### Initial backfill (one-time, per base)

A backfill job scans for hashes present in `embedding` but absent from the map, in bounded batches:

```sql
SELECT e.embedding_text_hash, e.vector_blob
FROM embedding e
LEFT JOIN ann_embedding_map m ON m.embedding_text_hash = e.embedding_text_hash
WHERE m.ann_rowid IS NULL
LIMIT {batch};
```

For each row: `INSERT INTO ann_embedding(rowid, embedding) VALUES (?, ?)` → capture `lastInsertRowid` → `INSERT INTO ann_embedding_map(ann_rowid, embedding_text_hash, inserted_at) VALUES (?, ?, ?)`. Runs under the base mutation lock (same as other index writes) but in its own short transactions with yields between batches, mirroring `deleteMaterials`, so a large backfill does not freeze the window.

### Incremental population

After `rebuildMaterial` commits new `embedding` rows, their hashes are enqueued to the same backlog scan — the next backfill cycle picks them up. No change to the synchronous `rebuildMaterial` transaction: the shadow is written **after** commit, so indexing latency is unchanged. The async window (embedding written, ANN not yet) is the "missing ANN entry" case handled in §7.

### Deletion

`collectIndexGarbage` already removes orphaned `embedding`/`content` rows. A matching shadow sweep (same transaction, or a separate sweep under the base lock) removes shadow rows whose hash no longer exists in `embedding`:

```sql
DELETE FROM ann_embedding_map
WHERE embedding_text_hash NOT IN (SELECT embedding_text_hash FROM embedding);
DELETE FROM ann_embedding
WHERE rowid IN (SELECT ann_rowid FROM ann_embedding_map ... orphaned rowids);
```

Orphaned `vec0` rows (rowid present in `ann_embedding` but missing from `ann_embedding_map`) are swept the same way.

## 6. (3) Consistency model

| Property | Guarantee |
|---|---|
| Source of truth | `embedding.vector_blob` only; never the shadow. |
| Write path | Unchanged: `embedding` written synchronously in `rebuildMaterial`; shadow writes are async and never block indexing. |
| Read path soundness | ANN hits are inner-joined to `search_text`/`search_unit`/`material`. A stale shadow row (hash deleted from `embedding`) never joins → never returned. No incorrect results. |
| Read path completeness | Brute-force fallback covers every hash missing or stale in the shadow → no false negatives at search time. |
| Shadow freshness | Eventual: backfill + sweeper converge. Recently indexed units may be absent from ANN until the next cycle; they are still found via fallback. |

Consistency is **source-strong / shadow-eventual**. Correctness of search does not depend on shadow freshness; only latency does (stale shadow → more brute-force → slower, still correct).

## 7. (4) Query flow: ANN → filter → fallback

`KnowledgeIndexStore.search(vector, topK)` becomes:

```
1. Coverage gate:
   mapCount = count(ann_embedding_map)
   embCount = count(embedding)
   if mapCount == 0 OR mapCount / embCount < ANN_MIN_COVERAGE (default 0.90)
       → skip ANN, go to brute-force lane only (§7 step 4)

2. ANN lane:
   rows = SELECT m.embedding_text_hash, v.distance
          FROM ann_embedding v
          JOIN ann_embedding_map m ON m.ann_rowid = v.rowid
          WHERE v.embedding MATCH <query_vector>
          ORDER BY v.distance
          LIMIT topK * OVERFETCH   (OVERFETCH = 5, matching existing hybrid prefetch)

3. Filter / materialize:
   join rows against search_text + search_unit (+ material visibility handled by caller as today)
   → valid ANN hits, each scored `1 - distance` (sqlite-vec cosine distance == vec_distance_cosine,
      same scale as the brute-force score `1 - vec_distance_cosine(...)` — verify against bundled build)

4. Fallback on misses:
   if valid ANN hits >= topK:
       return topK ANN hits ranked by score
   else:
       brute = existing vec_distance_cosine scan LIMIT (topK - valid) * OVERFETCH,
               excluding unitIds already returned
       merged = valid ANN hits ∪ brute, dedupe by unitId keeping higher score,
                sort descending, trim to topK
```

The final `KnowledgeIndexSearchMatch[]` shape is identical to today, so `toVisibleSearchResults`, rerank, threshold, and ranks in `KnowledgeQueryService.search()` are untouched. BM25 and hybrid modes are unaffected (hybrid continues to fuse BM25 with the vector lane by rank).

**Why ANN-first rather than parallel:** ANN is sub-linear; brute-force is O(n). Query ANN first, pay brute-force only for the residual slots the shadow could not fill. When the shadow is fresh and dense, most searches return from ANN alone.

## 8. (5) Handling stale and missing ANN entries

| Case | How it arises | Query-time effect | Background repair |
|---|---|---|---|
| In `embedding`, not in shadow (missing) | New embedding written before backfill ran; crash between commit and shadow write | Found by brute-force fallback; not in ANN results | Backfill job inserts it on next cycle |
| In shadow, not in `embedding` (stale orphan) | `collectIndexGarbage` deleted the embedding row; shadow write not yet swept | Inner join fails → row dropped, never returned | Shadow sweeper deletes map + vec0 row |
| Shadow present but vector diverged from `embedding` | Should not happen (shadow written from `embedding` bytes); possible only on torn write | ANN may rank it wrongly; still valid if it joins | Full shadow rebuild (rollback, §9) |
| `ann_embedding` unreadable / dimension mismatch | vec0 load failure, or base dimension changed | Open-time probe marks shadow unhealthy → brute-force only | Recreate `ann_embedding` table from `embedding` |
| Shadow table missing entirely | Older index file, version mismatch before migration | Coverage gate: mapCount = 0 → brute-force only | Store-open applies DDL; backfill populates |

All cases resolve to **correct results**; only latency and repair-path differ.

## 9. (6) Rollback

Because the shadow is fully derived from `embedding`, every rollback level is safe:

1. **Feature-flag rollback (instant):** a `useAnnShadow` gate (default off during rollout) makes `search()` skip the ANN lane and run today's brute-force query. No DDL, no data migration, no user impact.
2. **Shadow rebuild (cheap):** drop `ann_embedding_map` + `ann_embedding`, re-run the backfill from `embedding`. Zero data loss; the index stays searchable via brute-force during rebuild.
3. **Index recreation:** store-open already drops and recreates the whole derived `index.sqlite` on `KNOWLEDGE_INDEX_SCHEMA_VERSION` mismatch; shadow tables come along for free.
4. **Bad batch rollback:** `inserted_at`/`ann_rowid` on `ann_embedding_map` lets a single backfill batch be deleted (`DELETE ... WHERE inserted_at = ?` plus matching vec0 rowids) without touching other batches.

Rolling back the *feature* means removing the gate and DDL in a later version; existing shadow tables are simply ignored (old code never reads them) and dropped on the next index recreation.

## 10. Trade-offs

| Dimension | Approach B (dual-layer) | Approach A (brute force, current) |
|---|---|---|
| Search latency | Sub-linear ANN hits; brute-force only for residual slots | O(n) cosine scan over all embeddings, every vector search |
| Write latency | Unchanged (`embedding` sync; shadow async) | Unchanged |
| Correctness | Unchanged (join-filter + fallback) | Unchanged |
| Storage | Vectors stored twice (BLOB + vec0) | Once |
| Complexity | Backfill job, sweeper, coverage gate, health probe, feature flag | None |
| Engine coupling | Adds `vec0` dependency (already required for `vec_distance_cosine`) | sqlite-vec scalar only |
| Failure modes | Shadow staleness (handled), vec0 errors (handled by fallback) | Scan cost only |
| Rollback | Trivial (feature flag; derived artifact) | N/A |

**Recommendation:** adopt Approach B behind a feature flag, default off; enable per-base after the backfill job and coverage gate prove stable, then default on. The brute-force lane remains the permanent backstop, so there is no scenario where ANN degradation produces incorrect search results — only slower ones.

## 11. Open questions (confirmation points, not blockers)

- Confirm `vec0` accepts a raw FLOAT32 BLOB binding (our stored encoding) as the vector input, or whether a text float literal is required.
- Confirm sqlite-vec `distance` for cosine equals `vec_distance_cosine` so `1 - distance` is score-comparable across lanes; if not, normalize scores before merging.
- Pick `ANN_MIN_COVERAGE` default and backfill batch size/yield budget by measurement on large bases.
- Decide whether `ann_embedding` DDL lands in `KNOWLEDGE_INDEX_SCHEMA_STATEMENTS` with a version bump (3) or is managed separately as an optional shadow.
