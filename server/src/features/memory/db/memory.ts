import type { SqlDatabase } from "../../../contracts/index.js";
import { getFeatureLiveHooks } from "../../../contracts/index.js";
import { EMBEDDING_DIM, toVectorLiteral } from "../../../llm/embeddings.js";
import { deleteEntriesFor, type MemoryType } from "./entries.js";

let db: SqlDatabase;

export interface MemoryRecord {
  id: number;
  type: MemoryType;
  entityId: string | null;
  content: string;
  updatedAt: number;
}

export interface MemoryMatch {
  type: MemoryType;
  entityId: string | null;
  content: string;
  /** Reciprocal-rank-fusion score (higher = more relevant). */
  score: number;
}

export interface UpsertMemoryInput {
  type: MemoryType;
  entityId: string | null;
  content: string;
  embedding: number[];
}

export async function bindMemoryDatabase(database: SqlDatabase): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS memory (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      type TEXT NOT NULL,
      entity_id TEXT,
      content TEXT NOT NULL,
      embedding vector(${EMBEDDING_DIM}),
      tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint,
      updated_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
  // NULL entity_id (the 'general' scope) must still be unique per type, so key on
  // COALESCE rather than the raw column (Postgres treats NULLs as distinct).
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_entity
       ON memory (type, COALESCE(entity_id, ''));`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_memory_tsv
       ON memory USING GIN (tsv);`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_memory_embedding
       ON memory USING hnsw (embedding vector_cosine_ops);`,
  );
}

interface MemoryRow {
  id: number;
  type: string;
  entity_id: string | null;
  content: string;
  updated_at: number;
}

function rowToRecord(r: MemoryRow): MemoryRecord {
  return {
    id: Number(r.id),
    type: r.type as MemoryType,
    entityId: r.entity_id,
    content: r.content,
    updatedAt: Number(r.updated_at),
  };
}

function notifyMemoryChanged(type?: MemoryType): void {
  const hooks = getFeatureLiveHooks();
  if (type) hooks.emitMemoryUpdated?.(type);
  hooks.emitDataUpdated?.(["memory"]);
}

/** The consolidated record for one entity, or null when none exists yet. */
export async function getMemoryRecord(
  type: MemoryType,
  entityId: string | null,
): Promise<MemoryRecord | null> {
  const { rows } = await db.query<MemoryRow>(
    `SELECT id, type, entity_id, content, updated_at FROM memory
       WHERE type = $1 AND entity_id IS NOT DISTINCT FROM $2`,
    [type, entityId],
  );
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function listAllMemory(): Promise<MemoryRecord[]> {
  const { rows } = await db.query<MemoryRow>(
    `SELECT id, type, entity_id, content, updated_at FROM memory
       ORDER BY type, entity_id`,
  );
  return rows.map(rowToRecord);
}

/** Insert or replace the consolidated record + embedding for one entity. */
export async function upsertMemory(input: UpsertMemoryInput): Promise<void> {
  const id = input.type === "general" ? null : input.entityId;
  await db.query(
    `INSERT INTO memory (type, entity_id, content, embedding, updated_at)
       VALUES ($1, $2, $3, $4::vector, extract(epoch from now())::bigint)
     ON CONFLICT (type, COALESCE(entity_id, '')) DO UPDATE SET
       content = excluded.content,
       embedding = excluded.embedding,
       updated_at = excluded.updated_at`,
    [input.type, id, input.content, toVectorLiteral(input.embedding)],
  );
  notifyMemoryChanged(input.type);
}

/** Replace just the text of a record (dashboard edit). Embedding is left stale until reconsolidation. */
export async function replaceMemoryContent(
  id: number,
  content: string,
): Promise<MemoryRecord | null> {
  const text = content.trim();
  if (!text) return null;
  const { rows } = await db.query<MemoryRow>(
    `UPDATE memory SET content = $2, updated_at = extract(epoch from now())::bigint
       WHERE id = $1
       RETURNING id, type, entity_id, content, updated_at`,
    [id, text],
  );
  if (rows[0]) notifyMemoryChanged(rows[0].type as MemoryType);
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function deleteMemory(id: number): Promise<boolean> {
  const { rows } = await db.query<{ type: string }>(
    `DELETE FROM memory WHERE id = $1 RETURNING type`,
    [id],
  );
  if (rows[0]) {
    notifyMemoryChanged(rows[0].type as MemoryType);
    return true;
  }
  return false;
}

/** Consolidated user-memory facts as individual lines (for mention context). */
export async function getUserFacts(userId: string): Promise<string[]> {
  const record = await getMemoryRecord("user", userId);
  if (!record) return [];
  return record.content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Delete an entity's consolidated record and its pending notes. */
async function clearMemoryFor(
  type: MemoryType,
  entityId: string | null,
): Promise<void> {
  await db.query(
    `DELETE FROM memory WHERE type = $1 AND entity_id IS NOT DISTINCT FROM $2`,
    [type, entityId],
  );
  await deleteEntriesFor(type, entityId);
  notifyMemoryChanged(type);
}

export function clearUserMemory(userId: string): Promise<void> {
  return clearMemoryFor("user", userId);
}

export function clearGroupMemory(groupId: string): Promise<void> {
  return clearMemoryFor("group", groupId);
}

interface MemorySearchRow {
  type: string;
  entity_id: string | null;
  content: string;
}

const RRF_K = 60;

/**
 * Hybrid memory search: blends cosine-distance vector ranking with full-text
 * ranking via reciprocal rank fusion across ALL entities. Returns the records
 * most relevant to the query, each tagged with its type + entity_id.
 */
export async function searchMemory(
  queryVector: number[],
  queryText: string,
  limit = 8,
): Promise<MemoryMatch[]> {
  const poolSize = Math.max(limit * 4, 20);

  const { rows: vectorRows } = await db.query<MemorySearchRow>(
    `SELECT type, entity_id, content
       FROM memory
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
    [toVectorLiteral(queryVector), poolSize],
  );

  const ftsQuery = queryText.trim();
  const { rows: ftsRows } = ftsQuery
    ? await db.query<MemorySearchRow>(
        `SELECT type, entity_id, content
           FROM memory
           WHERE tsv @@ websearch_to_tsquery('simple', $1)
           ORDER BY ts_rank(tsv, websearch_to_tsquery('simple', $1)) DESC
           LIMIT $2`,
        [ftsQuery, poolSize],
      )
    : { rows: [] as MemorySearchRow[] };

  const fused = new Map<string, MemoryMatch>();
  const fuse = (rows: MemorySearchRow[]) => {
    rows.forEach((row, index) => {
      const key = `${row.type}::${row.entity_id ?? ""}`;
      const contribution = 1 / (RRF_K + index + 1);
      const existing = fused.get(key);
      if (existing) {
        existing.score += contribution;
      } else {
        fused.set(key, {
          type: row.type as MemoryType,
          entityId: row.entity_id,
          content: row.content,
          score: contribution,
        });
      }
    });
  };
  fuse(vectorRows);
  fuse(ftsRows);

  return [...fused.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
