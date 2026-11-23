# Spec: P2-4 — ANN index for Knowledge RAG

**Version:** 1.0.0  
**Status:** Draft  
**Date:** 2026-11-23  
**Scope:** Spec only — no implementation code, no source-file changes, no timeline commitments.  
**Source findings:** `knowledge-rag-audit.json` (Understand findings), `docs/references/knowledge/experiment/knowledge-vec0-ann-shadow.md` (Approach B), `docs/references/knowledge/experiment/knowledge-technical-design.md` (current implementation contract), `docs/references/project-audit.md` §4 (P2-4 roadmap item).

---

## 1. Title, version, status, date

| Field | Value |
|---|---|
| Title | P2-4: ANN index for Knowledge RAG — sub-linear vector retrieval for per-base knowledge indexes |
| Version | 1.0.0 |
| Status | Draft |
| Date | 2026-11-23 |
| Related roadmap item | P2-4 "ANN index を Knowledge RAG に追加" (docs/references/project-audit.md §4, P2 tier) |

---

## 2. Problem statement

Every knowledge base owns a derived retrieval index (`{baseId}/.cherry/index.sqlite`, better-sqlite3 + sqlite-vec) whose `embedding` table stores raw little-endian float32 vectors in a plain `BLOB` column. Vector search today is a **brute-force cosine scan** over every stored embedding row:

```sql
SELECT ... FROM embedding e
JOIN search_text st ON st.embedding_text_hash = e.embedding_text_hash ...
JOIN search_unit su ON su.unit_id = st.target_id
WHERE vec_distance_cosine(e.vector_blob, ?) IS NOT NULL
ORDER BY dist
LIMIT ?
```

`vec_distance_cosine` is evaluated over **all** embeddings, so vector search is O(n) in index size and runs synchronously on the main-process event loop (better-sqlite3 is a single synchronous connection). For large bases this is the retrieval latency ceiling and it only grows with the index. The limitation is documented (`KnowledgeIndexStore.ts:498-499`, `knowledge-technical-design.md §5.6`) and ranked as the top scale gap in the Knowledge/RAG audit (`knowledge-rag-audit.json` gaps: "No ANN index: vector search is brute-force O(N)... will not scale to very large bases").

Affected retrieval: `KnowledgeQueryService.search()` runs hybrid (vector + BM25 + RRF) for every vector-capable base, so every semantic search pays the full scan. Base configuration (`knowledge_base.dimensions`, `knowledge_base.embeddingModelId`) is immutable per base, so there is no per-query dimension heterogeneity to absorb.

---

## 3. Goals and non-goals

### Goals

1. **Sub-linear vector search** via sqlite-vec's `vec0` virtual table (HNSW ANN) for per-base indexes, leaving the plain-BLOB `embedding` column untouched as the source of truth — no re-encode, no `F32_BLOB` migration, no user-facing data migration.
2. **Asynchronous, off-critical-path population**: `rebuildMaterial` keeps writing `embedding` synchronously exactly as today; ANN shadow writes happen after commit and never block indexing.
3. **Sound and complete results**: ANN answers first; the brute-force scan covers shadow misses and stale entries. Search results remain correct even when the shadow is empty or stale — only latency changes.
4. **Instant, safe rollback**: disabling the shadow restores today's brute-force behavior with no data migration; the shadow is a fully derived, rebuildable artifact.
5. **No caller contract change**: `KnowledgeIndexStore.search()` input/output shape, `KnowledgeIndexSearchMatch`, BM25, hybrid RRF, visibility filtering, reranking, thresholds, and all four `kb_*` tools are unchanged.
6. **No engine-portability regression**: sqlite-vec is already required for `vec_distance_cosine` (BetterSqlite3Driver.ts:178); adding `vec0` adds no new engine dependency, and the brute-force fallback preserves behavior on any engine.

### Non-goals

- Replacing `embedding.vector_blob` with a native vector column (that is Approach C, evaluated and not selected — §6).
- Removing the brute-force lane (it stays as the permanent correctness backstop).
- Changing BM25/hybrid RRF, `KnowledgeIndexSearchMatch`, or any caller of `KnowledgeIndexStore.search()`.
- Multi-base or cross-base ANN; ANN is per-base only.
- AbortSignal/cancellation plumbing on knowledge lookup (tracked separately, knowledge-rag-audit.json gaps).
- In-place migration of existing tables beyond the existing schema-version reset contract (changing an existing table still requires bumping `KNOWLEDGE_INDEX_SCHEMA_VERSION`; adding a new table does not).

---

## 4. Current state with file:line

| Area | Current behavior | File:line |
|---|---|---|
| Index store | 7-table derived material model (`meta`, `content`, `material`, `search_unit`, `search_text`, `embedding`, `search_text_fts`) per base; `KNOWLEDGE_INDEX_SCHEMA_VERSION = 2` | `src/main/features/knowledge/pipeline/vectorstore/indexStore/schema.ts:66,77-203` |
| Vector storage | `embedding(embedding_text_hash PK, vector_blob BLOB, created_at)`; raw LE float32 bytes, dimensionless BLOB | `schema.ts:168-172`; `vectorBlob.ts:1` |
| Vector search | Brute-force cosine scan over all rows via `vec_distance_cosine(e.vector_blob, ?)`, `ORDER BY dist LIMIT ?`; zero-norm vectors dropped with `WHERE dist IS NOT NULL` | `KnowledgeIndexStore.ts:498-519` |
| Search dispatcher | `search()`: `bm25` → BM25 lane; `vector` → vector lane; `hybrid` → both lanes over-fetched (topK×5) fused with RRF (`RRF_K=60`, alpha=0.5) | `KnowledgeIndexStore.ts:401-416`; `fuseWithRrf` at :656-680 |
| Vector index adapter | `BetterSqlite3VectorIndex.buildDistanceExpression` = `vec_distance_cosine(column, ?)`; `bindQueryVector` = raw LE float32 blob | `BetterSqlite3VectorIndex.ts:14-25` |
| Driver/engine | better-sqlite3 single synchronous connection; `busy_timeout=5000`, `synchronous=NORMAL`, `foreign_keys=ON`, `journal_mode=WAL`; sqlite-vec extension loaded via `getLoadablePath()`/`toAsarUnpackedPath()` | `BetterSqlite3Driver.ts:165-186` |
| Store open | `createKnowledgeIndexStoreAtPath`: driver → schema (IF NOT EXISTS) → version check → `resetKnowledgeIndexSchema` on mismatch → `ensureIndexMeta` base_id check → store; close-on-throw | `createIndexStore.ts:36-75` |
| Store cache | `KnowledgeVectorStoreService` caches one `KnowledgeIndexStore` per base id; closes all on stop | `KnowledgeVectorStoreService.ts:35-59` |
| Write path | `indexDocumentsJobHandler` → chunks → embeds (`AiService.embedMany`, width validated === `base.dimensions`) → `rebuildMaterial` under per-base `KeyedMutex`; item flipped to `completed` in same locked section | `indexDocumentsJobHandler.ts:300-390`; `embed.ts:7-76` |
| Query path | `KnowledgeQueryService.search`: mode = hybrid if vector-capable base else BM25; query embedding via `embedKnowledgeQuery`; overfetch cap 200; visibility filter (`toVisibleSearchResults`), optional rerank, trim to `documentCount ?? 10`, threshold | `KnowledgeQueryService.ts:53-93`; constants at :36-38 |
| Main DB config | `knowledge_base.dimensions` (nullable integer), `embeddingModelId`; CHECK couples model/dimensions pairing and status/error | `src/main/data/db/schemas/knowledge.ts:24-82` (`dimensions` at :31) |
| Agent tools | `kb_search`/`kb_read`/`kb_list`/`kb_manage` share `knowledgeLookup.ts` core; search core scopes baseIds against `allowedIds`, never throws | `src/main/ai/tools/knowledgeLookup.ts:141` (per audit) |
| Test coverage | ~87 test files across knowledge domain incl. `KnowledgeIndexStore.test.ts`, `KnowledgeIndexStore.search.test.ts`, `schema.test.ts`, `query/__tests__/search.test.ts`, `tasks/__tests__/indexDocumentsJobHandler.test.ts`, `KnowledgeVectorStoreService.test.ts` | see §9 |

---

## 5. ANN primitive: sqlite-vec vec0 capabilities

The index already depends on sqlite-vec (`@aiany/sqlite-vec@0.1.10-alpha.4.aiany.2`, package.json) for the `vec_distance_cosine` scalar function. `vec0` is sqlite-vec's ANN virtual table primitive:

- **Table**: `CREATE VIRTUAL TABLE ... USING vec0(embedding FLOAT32[k])` — fixed dimension `k` baked into DDL at creation (variable-dim `F32_BLOB` also supported by the engine). One row per vector; the engine's hidden `rowid` is the ANN id.
- **Index**: HNSW graph built automatically over the vectors; `INSERT/DELETE/UPDATE` maintain it incrementally.
- **Query**: `SELECT rowid, distance FROM vec0 WHERE embedding MATCH <query> ORDER BY distance LIMIT k` — sub-linear approximate nearest neighbor by cosine/L2/dot distance.
- **Distance semantics**: `vec_distance_cosine(a, b)` = cosine distance (0 = identical). The existing score mapping `1 - distance` is therefore shared between the ANN lane (`v.distance`) and the brute-force lane (`1 - vec_distance_cosine(...)`), so the two lanes are score-comparable if sqlite-vec's `distance` column equals `vec_distance_cosine` — to be confirmed against the bundled build (§13 open questions).
- **Writes**: `INSERT INTO vec0(rowid, embedding) VALUES (?, ?)`; `DELETE FROM vec0 WHERE rowid = ?`. Query vector binds as raw LE float32 bytes — byte-identical to the stored `vector_blob` encoding (`encodeVectorBlob`, vectorBlob.ts:1), so no re-encode.
- **Portability**: `vec0` is a sqlite-vec-specific virtual table, like `search_text_fts` is FTS5-specific. The index already requires sqlite-vec, so `vec0` adds no new engine dependency; a health probe + brute-force fallback guarantees results if `vec0` is unavailable or unreadable.

---

## 6. Design options compared (A / B / C) + trade-off matrix

### Approach A — Status quo: brute-force cosine scan (current)

Every vector search scans all embedding rows with `vec_distance_cosine` and sorts.

- **Pros**: Zero change; simplest; exact results; already implemented and tested.
- **Cons**: O(n) per vector search; blocks the main-process event loop for the scan duration; latency grows linearly with index size; does not address P2-4.

### Approach B — Dual-layer ANN shadow table (vec0) — documented design

Keep `embedding.vector_blob` as the source of truth. Add a derived `vec0` shadow table (`ann_embedding`) plus a `ann_embedding_map(rowid → embedding_text_hash)` table. Shadow populated asynchronously after `rebuildMaterial` commits (backfill + incremental + sweeper), queried first with brute-force fallback for misses/stale entries. Full design in `knowledge-vec0-ann-shadow.md`.

- **Pros**: Sub-linear ANN hits; write latency unchanged; results always correct (join-filter + fallback); instant rollback via feature flag; no data migration; no new engine dependency.
- **Cons**: Vectors stored twice (BLOB + vec0); added components (backfill job, sweeper, coverage gate, health probe, feature flag); eventual shadow freshness (latency only, never correctness).

### Approach C — Full native vec0 migration (evaluated, not selected)

Replace the plain-BLOB `embedding` source-of-truth column with a native `vec0(embedding F32_BLOB[k])` virtual table as the vector store, keyed by `rowid → embedding_text_hash`. ANN is native to the table; no shadow, no fallback lane needed for freshness.

- **Pros**: Simplest query path (single ANN table); vectors stored once; no dual-write complexity.
- **Cons**: Requires a one-time per-base re-encode/migration (BLOB → F32_BLOB) of every stored vector — a user-facing migration on a derived artifact the contract treats as rebuildable-but-not-migrated; dimension `k` baked into DDL per base (dimension change = new base anyway, but the migration surface is larger); tighter engine coupling (schema no longer engine-neutral SQL — violates schema.ts engine-portability note, §5); no brute-force backstop within the store (fallback would need a parallel plain table anyway, collapsing back toward Approach B); rollback requires re-creating the plain `embedding` table.
- **Verdict**: Not selected. Approach B gives the same sub-linear latency with a derived, instantly rollbackable shadow and keeps the brute-force lane as a permanent backstop.

### Trade-off matrix

| Dimension | A: Brute force (current) | B: Dual-layer vec0 shadow (selected) | C: Native vec0 migration |
|---|---|---|---|
| Vector-search latency | O(n) cosine scan, every search | Sub-linear ANN hits; brute-force only for residual slots | Sub-linear ANN (native table) |
| Write (indexing) latency | Unchanged | Unchanged (`embedding` sync; shadow async) | Unchanged at write; migration cost up front |
| Correctness | Exact | Exact (join-filter + fallback) | Exact while fresh; migration risk during cutover |
| Storage | Vectors once | Vectors twice (BLOB + vec0) | Vectors once (native) |
| Components added | None | Backfill job, sweeper, coverage gate, health probe, feature flag | Migration job, DDL conversion, rowid↔hash map |
| Engine coupling | sqlite-vec scalar only (already required) | Adds `vec0` virtual table (already required engine) | Schema coupled to `vec0` DDL (breaks engine-neutral SQL) |
| Rollback | N/A | Instant (feature flag); derived artifact rebuildable | Requires reverse migration / plain-table restore |
| Caller contract change | None | None | None (store-internal) |
| Addresses P2-4 | No | Yes | Yes |

---

## 7. Selected approach + rationale

**Approach B: dual-layer ANN shadow table (vec0)**, behind a feature flag defaulting off during rollout.

**Rationale**: It is the only option that satisfies all six goals simultaneously: sub-linear ANN latency with zero change to the synchronous write path, sound-and-complete results regardless of shadow freshness (brute-force backstop), instant rollback with no data migration, no new engine dependency, and no caller-contract change. Approach A leaves P2-4 unaddressed. Approach C delivers the latency but at the cost of a user-facing vector re-encode migration, loss of the engine-neutral DDL contract, and no in-store brute-force backstop; its rollback is materially heavier. Because the shadow is fully derived from `embedding`, every failure mode resolves to correct (if slower) results — there is no scenario where ANN degradation produces incorrect search results, only slower ones.

The brute-force lane remains the permanent backstop; ANN is an acceleration layer, never a correctness dependency.

---

## 8. Detailed design

### 8.1 DDL (per-base `index.sqlite`, derived artifact)

Add two objects to the index schema. Dimension `{dim}` is concrete per base (immutable per base — existing invariant; changing it means a new base), baked into the `vec0` DDL at store open.

```sql
-- ANN index proper: engine-specific, vector-only, one row per embedding.
-- Dimension is the base's immutable `dimensions` (baked into the DDL at store open).
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

- `ann_embedding.rowid` is the ANN id returned by `vec0` queries; `ann_embedding_map` translates it to `embedding_text_hash`, then to `search_text` → `search_unit` → `material`, exactly like the brute-force lane (`KnowledgeIndexStore.ts:506-517`).
- The shadow is **never consulted for membership**: every ANN hit is inner-joined against `search_text`/`search_unit`/`material`, so stale shadow rows fail to join and are dropped.
- DDL is added to `KNOWLEDGE_INDEX_SCHEMA_STATEMENTS` (`schema.ts:77-203`) with a `KNOWLEDGE_INDEX_SCHEMA_VERSION` bump (2 → 3), so store-open (`createIndexStore.ts:51-58`) recreates the derived index — shadow included — on mismatch. New tables only would need no bump (`CREATE ... IF NOT EXISTS` is a no-op on existing files, `schema.ts:61` note); adding objects to the object set changes the layout, so it does.
- Store-open validates that a mounted `ann_embedding` dimension matches `base.dimensions`; a mismatch marks the shadow unhealthy and falls back to brute-force (sqlite-vec raises a dimension error on query otherwise).
- Drop statements extended in `KNOWLEDGE_INDEX_DROP_STATEMENTS` (`schema.ts:231-242`, child→parent order: drop `ann_embedding_map`, `ann_embedding` before `embedding`).

### 8.2 Write-path sync (unchanged write latency)

**No change to `rebuildMaterial`** (`KnowledgeIndexStore.ts:66-218`): it continues to write `content`/`material`/`search_unit`/`search_text`/`embedding` synchronously in one `BEGIN IMMEDIATE` driver transaction under the per-base `KeyedMutex` (`indexDocumentsJobHandler.ts:377-389`).

Shadow population is **post-commit, asynchronous, and never on the indexing critical path**:

1. **Initial backfill (one-time, per base)**: a backfill job scans hashes present in `embedding` but absent from `ann_embedding_map` in bounded batches:
   ```sql
   SELECT e.embedding_text_hash, e.vector_blob
   FROM embedding e
   LEFT JOIN ann_embedding_map m ON m.embedding_text_hash = e.embedding_text_hash
   WHERE m.ann_rowid IS NULL
   LIMIT {batch};
   ```
   For each row: `INSERT INTO ann_embedding(rowid, embedding) VALUES (?, ?)` → capture `lastInsertRowid` → `INSERT INTO ann_embedding_map(ann_rowid, embedding_text_hash, inserted_at) VALUES (?, ?, ?)`. Runs under the base mutation lock in short transactions with yields between batches (mirroring `deleteMaterials`, `KnowledgeIndexStore.ts:255-277`), so a large backfill does not freeze the window. Reads `vector_blob` only — no embedding API calls, no re-encode (`encodeVectorBlob`, vectorBlob.ts:1).
2. **Incremental population**: after `rebuildMaterial` commits new `embedding` rows, their hashes are enqueued to the same backlog scan (the next backfill cycle picks them up). The async window (embedding written, ANN not yet) is the "missing ANN entry" case handled in §8.6/query fallback.
3. **Deletion / orphan sweep**: `collectIndexGarbage` already removes orphaned `embedding`/`content` rows (`KnowledgeIndexStore.ts:289-299`). A matching shadow sweep under the base lock removes shadow rows whose hash no longer exists in `embedding`, plus orphaned `vec0` rows (rowid present in `ann_embedding` but missing from `ann_embedding_map`).

Consistency model: **source-strong / shadow-eventual**. Correctness of search does not depend on shadow freshness; only latency does (stale shadow → more brute-force → slower, still correct). Summarized in a table in Approach B's design doc (`knowledge-vec0-ann-shadow.md §6`), carried into this Spec unchanged.

### 8.3 Query-path change

`KnowledgeIndexStore.search(vector, topK)` (`KnowledgeIndexStore.ts:405-407`, vector lane) becomes ANN-first with fallback:

1. **Coverage gate**: `mapCount = count(ann_embedding_map)`, `embCount = count(embedding)`. If `mapCount == 0 OR mapCount / embCount < ANN_MIN_COVERAGE` (default 0.90, tune by measurement) → skip ANN, brute-force lane only.
2. **ANN lane**:
   ```sql
   SELECT m.embedding_text_hash, v.distance
   FROM ann_embedding v
   JOIN ann_embedding_map m ON m.ann_rowid = v.rowid
   WHERE v.embedding MATCH <query_vector>
   ORDER BY v.distance
   LIMIT topK * OVERFETCH   -- OVERFETCH = 5, matching existing hybrid prefetch
   ```
3. **Filter / materialize**: join rows against `search_text` + `search_unit` (visibility handled by the caller as today). Each valid ANN hit scored `1 - distance` (sqlite-vec cosine distance == `vec_distance_cosine`, same scale as brute-force — confirm against bundled build, §13).
4. **Fallback on misses**: if valid ANN hits >= topK → return topK ANN hits ranked by score; else brute = existing `vec_distance_cosine` scan LIMIT `(topK - valid) * OVERFETCH`, excluding unitIds already returned; merged = valid ANN ∪ brute, dedupe by unitId keeping higher score, sort descending, trim to topK.

The final `KnowledgeIndexSearchMatch[]` shape is identical (`unitId`, `materialId`, `unitIndex`, `text`, `score`), so `toVisibleSearchResults` (`KnowledgeQueryService.ts:175-211`), rerank, threshold, and ranks are untouched. BM25 and hybrid modes are unaffected (hybrid continues to fuse BM25 with the vector lane by rank, `fuseWithRrf` at `KnowledgeIndexStore.ts:656-680`).

**Why ANN-first rather than parallel**: ANN is sub-linear; brute-force is O(n). Query ANN first, pay brute-force only for the residual slots the shadow could not fill. When the shadow is fresh and dense, most searches return from ANN alone.

### 8.4 Change dimension handling

`base.dimensions` is immutable for an existing base (changing it means migrating into a new base — existing invariant, `KnowledgeIndexStore.ts:500-502` comment). The `{dim}` in `ann_embedding` DDL is baked per base at store open. A dimension change therefore requires a new base; the shadow table never needs an `ALTER`. Store-open dimension mismatch → shadow unhealthy → brute-force only (§8.1).

### 8.5 Migration

- Existing databases: the shadow tables are new objects (`CREATE ... IF NOT EXISTS`) added to the DDL with a `KNOWLEDGE_INDEX_SCHEMA_VERSION` bump (2 → 3). Store-open on a lower-version file applies the DDL; the backfill job populates the shadow from `embedding` on the next cycle. No user data migration, no re-embed, no API cost.
- The index is a rebuildable derived artifact (`knowledge-technical-design.md §9`): on any future schema-version mismatch the store is dropped and recreated, shadow included, and the base re-indexes from `knowledge_item` + raw materials.
- No changes to the main Drizzle migration chain (`src/main/data/db/schemas/`) — `knowledge_base`/`knowledge_item` are untouched.

### 8.6 Rollback

Because the shadow is fully derived from `embedding`, every rollback level is safe (carried from Approach B §9):

1. **Feature-flag rollback (instant)**: a `useAnnShadow` gate (default off during rollout) makes `search()` skip the ANN lane and run today's brute-force query. No DDL, no data migration, no user impact.
2. **Shadow rebuild (cheap)**: drop `ann_embedding_map` + `ann_embedding`, re-run the backfill from `embedding`. Zero data loss; the index stays searchable via brute-force during rebuild.
3. **Index recreation**: store-open already drops and recreates the whole derived `index.sqlite` on `KNOWLEDGE_INDEX_SCHEMA_VERSION` mismatch; shadow tables come along for free.
4. **Bad batch rollback**: `inserted_at`/`ann_rowid` on `ann_embedding_map` lets a single backfill batch be deleted (`DELETE ... WHERE inserted_at = ?` plus matching vec0 rowids) without touching other batches.

Rolling back the *feature* means removing the gate and DDL in a later version; existing shadow tables are simply ignored (old code never reads them) and dropped on the next index recreation.

---

## 9. Blast radius — callers and tests affected (file:line)

### Source files touched (design surface only)

| File | Role | Lines |
|---|---|---|
| `src/main/features/knowledge/pipeline/vectorstore/indexStore/schema.ts` | Add `ann_embedding` + `ann_embedding_map` DDL; bump `KNOWLEDGE_INDEX_SCHEMA_VERSION` 2→3; extend drop statements | :66, :77-203, :231-242 |
| `src/main/features/knowledge/pipeline/vectorstore/indexStore/KnowledgeIndexStore.ts` | ANN-first query + brute-force fallback; coverage gate; health probe | :401-416, :498-519 (vector lane to wrap) |
| `src/main/features/knowledge/pipeline/vectorstore/indexStore/createIndexStore.ts` | Open path applies new DDL; version-mismatch reset covers shadow | :36-75 |
| `src/main/features/knowledge/pipeline/vectorstore/indexStore/indexMeta.ts` | (optional) dimension validation at open | :23-38 |
| `src/main/features/knowledge/pipeline/vectorstore/KnowledgeVectorStoreService.ts` | (optional) expose shadow health metric | :35-59 |
| `src/main/features/knowledge/pipeline/indexing/embed.ts` | No change (embedding path untouched) | :7-76 |
| `src/main/features/knowledge/tasks/indexDocumentsJobHandler.ts` | No change (`rebuildMaterial` untouched; shadow post-commit) | :377-389 |
| `src/main/ai/tools/knowledgeLookup.ts` | No change (shared search core unchanged) | :141 |

### Callers affected (none — contract stable)

- `KnowledgeIndexStore.search()` input/output (`KnowledgeIndexSearchMatch`, model.ts:90-107) unchanged → `KnowledgeQueryService.search()` (`KnowledgeQueryService.ts:53-93`) unchanged → `knowledgeLookup.ts` `searchKnowledge` (`:141`) unchanged → all four `kb_*` AI tools and the Claude Code MCP bridge unchanged.
- No renderer change; no IPC schema change (`src/shared/ipc/schemas/` untouched); no main-DB Drizzle change (`src/main/data/db/schemas/knowledge.ts` untouched).

### Test files affected (existing coverage to extend)

| Test file | Current coverage | Extension for P2-4 |
|---|---|---|
| `src/main/features/knowledge/pipeline/vectorstore/indexStore/__tests__/KnowledgeIndexStore.test.ts` | `rebuildMaterial`, `deleteMaterials`, search lanes | ANN write-path (shadow insert after rebuild), orphan sweep |
| `.../__tests__/KnowledgeIndexStore.search.test.ts` | vector/bm25/hybrid lanes | ANN-first + fallback, coverage gate, stale/missing entries |
| `.../__tests__/schema.test.ts` | Schema DDL | New shadow tables + version bump |
| `src/main/features/knowledge/query/__tests__/search.test.ts` | Search query tests | End-to-end ANN vs brute-force parity |
| `src/main/features/knowledge/tasks/__tests__/indexDocumentsJobHandler.test.ts` | Indexing job | Shadow not blocking indexing latency |
| `src/main/features/knowledge/pipeline/vectorstore/__tests__/KnowledgeVectorStoreService.test.ts` | Store open/cache/version-mismatch | Version-mismatch reset recreates shadow |

### Test files NOT affected (out of scope)

All reader, chunk, embed, rerank, concept, ingestion, base-admin, renderer KnowledgePage, and API-gateway tests — their contracts do not change.

---

## 10. Test plan

1. **Schema**: new `ann_embedding` (vec0) + `ann_embedding_map` DDL applies via `createKnowledgeIndexSchema`; version bump 2→3 triggers `resetKnowledgeIndexSchema` drop+recreate including shadow; drop statements remove shadow objects in correct order. (`schema.test.ts`)
2. **Write path**: after `rebuildMaterial` commits `embedding` rows, backfill inserts `ann_embedding`/`ann_embedding_map` rows from `vector_blob` without re-embed; rebuild latency unchanged (shadow writes post-commit, outside the `rebuildMaterial` transaction). (`KnowledgeIndexStore.test.ts`, `indexDocumentsJobHandler.test.ts`)
3. **Deletion sweep**: `collectIndexGarbage` equivalent removes shadow rows whose hash is absent from `embedding`; orphaned `vec0` rows swept. (`KnowledgeIndexStore.test.ts`)
4. **Query parity**: ANN lane results match brute-force `vec_distance_cosine` ranking for the same query (score `1 - distance` equivalence); ANN-first + fallback returns identical top-K to pure brute-force across fresh/stale/empty shadow states; coverage gate (< 0.90) forces brute-force only. (`KnowledgeIndexStore.search.test.ts`, `query/__tests__/search.test.ts`)
5. **Consistency**: stale shadow rows (hash deleted from `embedding`) never returned (inner join drops them); missing shadow entries (new embeddings) still found via fallback. (`KnowledgeIndexStore.search.test.ts`)
6. **Engine/portability**: `vec0` unavailable or dimension-mismatched → health probe marks shadow unhealthy → brute-force only, same results. (`BetterSqlite3Driver.test.ts`, `KnowledgeVectorStoreService.test.ts`)
7. **No regressions**: existing BM25/hybrid/RRF, visibility filter, rerank, threshold, `knowledgeLookup` scope gating, and all four `kb_*` tool tests pass unchanged. Run per-project wrapper: `pnpm test:main <test-file>` for the files in §9 (per CLAUDE.md testing rules — scoped run, not full gate).

**Exit criteria**: vector search latency sub-linear on a large base (measurement-backed), brute-force parity on top-K, zero new test failures in the affected files, typecheck clean for touched projects.

---

## 11. Risks and mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `vec0` does not accept raw LE float32 BLOB binding (requires text float literal) | Medium | High | Open question (§13); verify against bundled build before DDL finalize; add `vec_from_bytes` conversion layer in `BetterSqlite3VectorIndex.bindQueryVector` if needed |
| sqlite-vec `distance` scale != `vec_distance_cosine` → ANN/BM25 score merge skew | Medium | Medium | Confirm `1 - distance` equivalence; if not, normalize scores before merging in `search()` |
| `ANN_MIN_COVERAGE` / backfill batch size wrong → little latency gain or window freezes | Medium | Medium | Tune by measurement on large bases; backfill yields every `DELETE_YIELD_BUDGET_MS` (50ms) mirroring `deleteMaterials` |
| Shadow staleness perceived as incorrect results | Low | Low | Documented correctness does not depend on freshness; fallback covers misses; loud diagnostics already exist (`reportInvisibleIndexContents`, indexMeta base_id refusal) |
| `vec0` load failure in packaged app (asar unpack) | Low | Medium | Already solved for `vec_distance_cosine` (`toAsarUnpackedPath`, BetterSqlite3Driver.ts:177-178); same path reused |
| Dimension mismatch between `ann_embedding` and `base.dimensions` | Low | Medium | Store-open probe; mismatch → shadow unhealthy → brute-force |
| Main-process event loop blocked by large backfill | Medium | Medium | Short transactions + `setImmediate` yields between batches (same pattern as `deleteMaterials`) |

---

## 12. Rollout strategy

No implementation timeline commitments are made in this Spec; the rollout below is the release approach.

1. **Build the shadow machinery behind a feature flag** (`useAnnShadow`, default off): DDL, backfill job, sweeper, coverage gate, health probe. No user-facing behavior change while off.
2. **Enable per-base after validation**: for a base, run backfill to coverage ≥ `ANN_MIN_COVERAGE`, then flip the flag on for that base. Brute-force remains available during and after.
3. **Default on**: once stable across bases, flip the default to on; the flag remains available for instant per-base or global rollback (§8.6).
4. **Keep brute-force permanently**: the brute-force lane is never removed; it is the correctness backstop if ANN is ever disabled or unhealthy.
5. **Remove the flag (later version)**: once the shadow has proven stable, the gate can be removed; existing shadow tables are ignored by old code and dropped on next index recreation.

---

## 13. Open questions (confirmation points, not blockers)

- Confirm `vec0` accepts a raw FLOAT32 BLOB binding (the stored encoding) as the vector input, or whether a text float literal / `vec_from_bytes` is required.
- Confirm sqlite-vec `distance` for cosine equals `vec_distance_cosine` so `1 - distance` is score-comparable across lanes; if not, normalize scores before merging.
- Pick `ANN_MIN_COVERAGE` default (0.90 proposed), backfill batch size, and yield budget by measurement on large bases.
- Decide whether `ann_embedding` DDL lands in `KNOWLEDGE_INDEX_SCHEMA_STATEMENTS` with version bump (3) or is managed as a separate optional shadow (this Spec assumes the former).

---
