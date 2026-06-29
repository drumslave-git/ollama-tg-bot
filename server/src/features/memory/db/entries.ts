import type { SqlDatabase } from "../../../contracts/index.js";
import { getFeatureLiveHooks } from "../../../contracts/index.js";

let db: SqlDatabase;

export const MIN_FACT_LENGTH = 2;
/**
 * Upper bound for a single raw note. Generous on purpose — a note may be a
 * pasted profile or multi-sentence fact that the daily job later folds into the
 * consolidated record. The `content` column itself is unbounded TEXT.
 */
export const MAX_FACT_LENGTH = 4000;

export type MemoryType = "user" | "general";

export interface MemoryEntryRecord {
  id: number;
  type: MemoryType;
  entityId: string | null;
  content: string;
  createdAt: number;
}

export interface PendingEntity {
  type: MemoryType;
  entityId: string | null;
}

export async function bindMemoryEntriesDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS memory_entry (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      type TEXT NOT NULL,
      entity_id TEXT,
      content TEXT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_memory_entry_entity
       ON memory_entry (type, entity_id);`,
  );
}

interface MemoryEntryRow {
  id: number;
  type: string;
  entity_id: string | null;
  content: string;
  created_at: number;
}

function rowToEntry(r: MemoryEntryRow): MemoryEntryRecord {
  return {
    id: Number(r.id),
    type: r.type as MemoryType,
    entityId: r.entity_id,
    content: r.content,
    createdAt: Number(r.created_at),
  };
}

function notifyEntriesChanged(): void {
  getFeatureLiveHooks().emitDataUpdated?.(["memory_entry"]);
}

/** Append one raw note the model wrote via memory_save (no dedupe). */
export async function addMemoryEntry(
  type: MemoryType,
  entityId: string | null,
  content: string,
): Promise<MemoryEntryRecord | null> {
  const text = content.trim();
  if (text.length < MIN_FACT_LENGTH || text.length > MAX_FACT_LENGTH) {
    return null;
  }
  const id = type === "general" ? null : entityId;
  const { rows } = await db.query<MemoryEntryRow>(
    `INSERT INTO memory_entry (type, entity_id, content)
     VALUES ($1, $2, $3)
     RETURNING id, type, entity_id, content, created_at`,
    [type, id, text],
  );
  notifyEntriesChanged();
  return rows[0] ? rowToEntry(rows[0]) : null;
}

/** Distinct (type, entity_id) pairs that have pending entries to consolidate. */
export async function listPendingEntities(): Promise<PendingEntity[]> {
  const { rows } = await db.query<{ type: string; entity_id: string | null }>(
    `SELECT DISTINCT type, entity_id FROM memory_entry
       ORDER BY type, entity_id`,
  );
  return rows.map((r) => ({
    type: r.type as MemoryType,
    entityId: r.entity_id,
  }));
}

/** All pending entries for one entity, oldest first. */
export async function getEntriesFor(
  type: MemoryType,
  entityId: string | null,
): Promise<MemoryEntryRecord[]> {
  const { rows } = await db.query<MemoryEntryRow>(
    `SELECT id, type, entity_id, content, created_at FROM memory_entry
       WHERE type = $1 AND entity_id IS NOT DISTINCT FROM $2
       ORDER BY id ASC`,
    [type, entityId],
  );
  return rows.map(rowToEntry);
}

/** All pending entries across every entity, for the dashboard view. */
export async function listAllEntries(): Promise<MemoryEntryRecord[]> {
  const { rows } = await db.query<MemoryEntryRow>(
    `SELECT id, type, entity_id, content, created_at FROM memory_entry
       ORDER BY id DESC`,
  );
  return rows.map(rowToEntry);
}

/** Case-insensitive substring search over pending entries (not yet embedded). */
export async function searchEntries(
  query: string,
  limit = 20,
): Promise<MemoryEntryRecord[]> {
  const q = query.trim();
  if (!q) return [];
  const { rows } = await db.query<MemoryEntryRow>(
    `SELECT id, type, entity_id, content, created_at FROM memory_entry
       WHERE content ILIKE '%' || $1 || '%'
       ORDER BY id DESC LIMIT $2`,
    [q, limit],
  );
  return rows.map(rowToEntry);
}

/** Replace the text of one pending entry (dashboard edit). */
export async function updateEntryContent(
  id: number,
  content: string,
): Promise<MemoryEntryRecord | null> {
  const text = content.trim();
  if (text.length < MIN_FACT_LENGTH || text.length > MAX_FACT_LENGTH) {
    return null;
  }
  const { rows } = await db.query<MemoryEntryRow>(
    `UPDATE memory_entry SET content = $2 WHERE id = $1
       RETURNING id, type, entity_id, content, created_at`,
    [id, text],
  );
  if (rows[0]) notifyEntriesChanged();
  return rows[0] ? rowToEntry(rows[0]) : null;
}

/** Remove processed entries by id. */
export async function deleteEntries(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await db.query(
    `DELETE FROM memory_entry WHERE id = ANY($1::bigint[])`,
    [ids],
  );
  const deleted = result.rowCount ?? 0;
  if (deleted > 0) notifyEntriesChanged();
  return deleted;
}

/** Remove all pending entries for one entity (used when memory is cleared). */
export async function deleteEntriesFor(
  type: MemoryType,
  entityId: string | null,
): Promise<number> {
  const result = await db.query(
    `DELETE FROM memory_entry WHERE type = $1 AND entity_id IS NOT DISTINCT FROM $2`,
    [type, entityId],
  );
  const deleted = result.rowCount ?? 0;
  if (deleted > 0) notifyEntriesChanged();
  return deleted;
}

export async function deleteEntryById(id: number): Promise<boolean> {
  const result = await db.query(`DELETE FROM memory_entry WHERE id = $1`, [id]);
  const deleted = (result.rowCount ?? 0) > 0;
  if (deleted) notifyEntriesChanged();
  return deleted;
}
