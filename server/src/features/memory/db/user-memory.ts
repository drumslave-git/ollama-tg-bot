import type { SqlDatabase } from "../../../contracts/index.js";
import { getFeatureLiveHooks } from "../../../contracts/index.js";
import { normalizeFactText } from "./memory-facts.js";

const MAX_MEMORY_CHARS = 12000;

let db: SqlDatabase;

export async function bindUserMemoryDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_memories (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint,
      updated_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_user_memories_user
       ON user_memories (user_id);`,
  );
}

export interface UserFactRecord {
  id: number;
  userId: string;
  fact: string;
  createdAt: string;
}

interface UserMemoryRow {
  id: number;
  user_id: string;
  content: string;
  updated_at: number;
}

export async function getUserFacts(userId: string): Promise<string[]> {
  const content = await getUserMemoryContent(userId);
  return content ? [content] : [];
}

export async function getUserMemoryContent(userId: string): Promise<string> {
  const { rows } = await db.query<{ content: string }>(
    `SELECT content FROM user_memories WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.content ?? "";
}

export async function listAllUserFacts(): Promise<UserFactRecord[]> {
  const { rows } = await db.query<UserMemoryRow>(
    `SELECT id, user_id, content, updated_at FROM user_memories
       ORDER BY user_id ASC`,
  );
  return rows.map(rowToUserFactRecord);
}

export async function listUserFacts(userId: string): Promise<UserFactRecord[]> {
  const row = await getUserMemoryRecord(userId);
  return row ? [row] : [];
}

export interface UserMemoryMatch {
  userId: string;
  content: string;
}

/** Case-insensitive substring search over user memory documents. */
export async function searchUserMemories(
  query: string,
  limit = 50,
): Promise<UserMemoryMatch[]> {
  const q = query.trim();
  if (!q) return [];
  const { rows } = await db.query<{ user_id: string; content: string }>(
    `SELECT user_id, content FROM user_memories
       WHERE content ILIKE '%' || $1 || '%'
       ORDER BY user_id ASC LIMIT $2`,
    [q, limit],
  );
  return rows.map((r) => ({ userId: r.user_id, content: r.content }));
}

function rowToUserFactRecord(r: UserMemoryRow): UserFactRecord {
  return {
    id: r.id,
    userId: r.user_id,
    fact: r.content,
    createdAt: new Date(r.updated_at * 1000).toISOString(),
  };
}

export async function getUserFactById(
  id: number,
): Promise<UserFactRecord | null> {
  const { rows } = await db.query<UserMemoryRow>(
    `SELECT id, user_id, content, updated_at FROM user_memories WHERE id = $1`,
    [id],
  );
  return rows[0] ? rowToUserFactRecord(rows[0]) : null;
}

async function getUserMemoryRecord(
  userId: string,
): Promise<UserFactRecord | null> {
  const { rows } = await db.query<UserMemoryRow>(
    `SELECT id, user_id, content, updated_at FROM user_memories
       WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ? rowToUserFactRecord(rows[0]) : null;
}

function notifyUserMemoryChanged(): void {
  const hooks = getFeatureLiveHooks();
  hooks.emitMemoryUpdated?.("user");
  hooks.emitDataUpdated?.(["user_memories"]);
}

export async function deleteUserFactById(id: number): Promise<boolean> {
  const result = await db.query(`DELETE FROM user_memories WHERE id = $1`, [id]);
  const deleted = (result.rowCount ?? 0) > 0;
  if (deleted) notifyUserMemoryChanged();
  return deleted;
}

export async function createUserFact(
  userId: string,
  fact: string,
): Promise<UserFactRecord | null> {
  const normalized = normalizeFactText(fact);
  if (!normalized) return null;
  const existing = await getUserMemoryContent(userId);
  const content = appendUniqueLine(existing, normalized);
  await replaceUserMemory(userId, content);
  return getUserMemoryRecord(userId);
}

export async function updateUserFactById(
  id: number,
  fact: string,
): Promise<UserFactRecord | "duplicate" | null> {
  const normalized = normalizeMemoryContent(fact);
  if (!normalized) return null;

  const current = await getUserFactById(id);
  if (!current) return null;

  await replaceUserMemory(current.userId, normalized);
  return getUserMemoryRecord(current.userId);
}

export async function clearUserFactsForUser(userId: string): Promise<number> {
  const result = await db.query(
    `DELETE FROM user_memories WHERE user_id = $1`,
    [userId],
  );
  const deleted = result.rowCount ?? 0;
  if (deleted > 0) notifyUserMemoryChanged();
  return deleted;
}

export async function addUserFacts(
  userId: string,
  facts: string[],
): Promise<number> {
  const existing = await getUserMemoryContent(userId);
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

  if (added > 0) await replaceUserMemory(userId, content);
  return added;
}

export async function clearUserMemory(userId: string): Promise<void> {
  const result = await db.query(
    `DELETE FROM user_memories WHERE user_id = $1`,
    [userId],
  );
  if ((result.rowCount ?? 0) > 0) notifyUserMemoryChanged();
}

export { formatUserMemoryForPrompt } from "../inject.js";

export async function replaceUserFacts(
  userId: string,
  facts: string[],
): Promise<void> {
  await replaceUserMemory(userId, facts.join("\n").trim());
}

export async function replaceUserMemory(
  userId: string,
  content: string,
): Promise<void> {
  const normalized = normalizeMemoryContent(content);
  if (!normalized) {
    await clearUserMemory(userId);
    return;
  }
  await db.query(
    `INSERT INTO user_memories (user_id, content, updated_at)
     VALUES ($1, $2, extract(epoch from now())::bigint)
     ON CONFLICT (user_id) DO UPDATE SET
       content = excluded.content,
       updated_at = excluded.updated_at`,
    [userId, normalized],
  );
  notifyUserMemoryChanged();
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
