import type { SqlDatabase } from "../../../contracts/index.js";
import { getModuleLiveHooks } from "../../../contracts/index.js";
import { normalizeFactText } from "./memory-facts.js";

const MAX_MEMORY_CHARS = 12000;

let db: SqlDatabase;

export async function bindGroupMemoryDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS group_memories (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      group_id TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint,
      updated_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_group_memories_group
       ON group_memories (group_id);`,
  );
}

export interface GroupFactRecord {
  id: number;
  groupId: string;
  fact: string;
  createdAt: string;
}

interface GroupMemoryRow {
  id: number;
  group_id: string;
  content: string;
  updated_at: number;
}

export async function getGroupFacts(groupId: string): Promise<string[]> {
  const content = await getGroupMemoryContent(groupId);
  return content ? [content] : [];
}

export async function getGroupMemoryContent(groupId: string): Promise<string> {
  const { rows } = await db.query<{ content: string }>(
    `SELECT content FROM group_memories WHERE group_id = $1`,
    [groupId],
  );
  return rows[0]?.content ?? "";
}

export async function listAllGroupFacts(): Promise<GroupFactRecord[]> {
  const { rows } = await db.query<GroupMemoryRow>(
    `SELECT id, group_id, content, updated_at FROM group_memories
       ORDER BY group_id ASC`,
  );
  return rows.map(rowToGroupFactRecord);
}

export async function listGroupFacts(
  groupId: string,
): Promise<GroupFactRecord[]> {
  const row = await getGroupMemoryRecord(groupId);
  return row ? [row] : [];
}

export interface GroupMemoryMatch {
  groupId: string;
  content: string;
}

/** Case-insensitive substring search over group memory documents. */
export async function searchGroupMemories(
  query: string,
  limit = 50,
): Promise<GroupMemoryMatch[]> {
  const q = query.trim();
  if (!q) return [];
  const { rows } = await db.query<{ group_id: string; content: string }>(
    `SELECT group_id, content FROM group_memories
       WHERE content ILIKE '%' || $1 || '%'
       ORDER BY group_id ASC LIMIT $2`,
    [q, limit],
  );
  return rows.map((r) => ({ groupId: r.group_id, content: r.content }));
}

function rowToGroupFactRecord(r: GroupMemoryRow): GroupFactRecord {
  return {
    id: r.id,
    groupId: r.group_id,
    fact: r.content,
    createdAt: new Date(r.updated_at * 1000).toISOString(),
  };
}

export async function getGroupFactById(
  id: number,
): Promise<GroupFactRecord | null> {
  const { rows } = await db.query<GroupMemoryRow>(
    `SELECT id, group_id, content, updated_at FROM group_memories WHERE id = $1`,
    [id],
  );
  return rows[0] ? rowToGroupFactRecord(rows[0]) : null;
}

async function getGroupMemoryRecord(
  groupId: string,
): Promise<GroupFactRecord | null> {
  const { rows } = await db.query<GroupMemoryRow>(
    `SELECT id, group_id, content, updated_at FROM group_memories
       WHERE group_id = $1`,
    [groupId],
  );
  return rows[0] ? rowToGroupFactRecord(rows[0]) : null;
}

function notifyGroupMemoryChanged(): void {
  const hooks = getModuleLiveHooks();
  hooks.emitMemoryUpdated?.("group");
  hooks.emitDataUpdated?.(["group_memories"]);
}

export async function deleteGroupFactById(id: number): Promise<boolean> {
  const result = await db.query(`DELETE FROM group_memories WHERE id = $1`, [
    id,
  ]);
  const deleted = (result.rowCount ?? 0) > 0;
  if (deleted) notifyGroupMemoryChanged();
  return deleted;
}

export async function createGroupFact(
  groupId: string,
  fact: string,
): Promise<GroupFactRecord | null> {
  const normalized = normalizeFactText(fact);
  if (!normalized) return null;
  const existing = await getGroupMemoryContent(groupId);
  const content = appendUniqueLine(existing, normalized);
  await replaceGroupMemory(groupId, content);
  return getGroupMemoryRecord(groupId);
}

export async function updateGroupFactById(
  id: number,
  fact: string,
): Promise<GroupFactRecord | "duplicate" | null> {
  const normalized = normalizeMemoryContent(fact);
  if (!normalized) return null;

  const current = await getGroupFactById(id);
  if (!current) return null;

  await replaceGroupMemory(current.groupId, normalized);
  return getGroupMemoryRecord(current.groupId);
}

export async function clearGroupFactsForGroup(
  groupId: string,
): Promise<number> {
  const result = await db.query(
    `DELETE FROM group_memories WHERE group_id = $1`,
    [groupId],
  );
  const deleted = result.rowCount ?? 0;
  if (deleted > 0) notifyGroupMemoryChanged();
  return deleted;
}

export async function addGroupFacts(
  groupId: string,
  facts: string[],
): Promise<number> {
  const existing = await getGroupMemoryContent(groupId);
  let content = existing;
  let added = 0;

  for (const fact of facts) {
    const normalized = normalizeFactText(fact);
    if (!normalized) continue;
    const next = appendUniqueLine(content, normalized);
    if (next === content) continue;
    content = next;
    added++;
  }

  if (added > 0) await replaceGroupMemory(groupId, content);
  return added;
}

export async function clearGroupMemory(groupId: string): Promise<void> {
  const result = await db.query(
    `DELETE FROM group_memories WHERE group_id = $1`,
    [groupId],
  );
  if ((result.rowCount ?? 0) > 0) notifyGroupMemoryChanged();
}

export { formatGroupMemoryForPrompt } from "../inject.js";

export function groupMemoryTotalChars(facts: string[]): number {
  return facts.reduce((n, f) => n + f.length, 0);
}

export async function replaceGroupFacts(
  groupId: string,
  facts: string[],
): Promise<void> {
  await replaceGroupMemory(groupId, facts.join("\n").trim());
}

export async function replaceGroupMemory(
  groupId: string,
  content: string,
): Promise<void> {
  const normalized = normalizeMemoryContent(content);
  if (!normalized) {
    await clearGroupMemory(groupId);
    return;
  }
  await db.query(
    `INSERT INTO group_memories (group_id, content, updated_at)
     VALUES ($1, $2, extract(epoch from now())::bigint)
     ON CONFLICT (group_id) DO UPDATE SET
       content = excluded.content,
       updated_at = excluded.updated_at`,
    [groupId, normalized],
  );
  notifyGroupMemoryChanged();
}

function appendUniqueLine(existing: string, fact: string): string {
  const lines = existing
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const key = fact.toLowerCase();
  if (lines.some((line) => line.toLowerCase() === key)) {
    return existing.trim();
  }
  return [...lines, fact].join("\n").slice(0, MAX_MEMORY_CHARS);
}

function normalizeMemoryContent(content: unknown): string | null {
  if (typeof content !== "string") return null;
  const normalized = content.trim();
  if (normalized.length < 2) return null;
  return normalized.slice(0, MAX_MEMORY_CHARS);
}
