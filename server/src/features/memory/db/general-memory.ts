import type { SqlDatabase } from "../../../contracts/index.js";
import { getModuleLiveHooks } from "../../../contracts/index.js";
import { normalizeFactText } from "./memory-facts.js";

const MAX_GENERAL_FACTS = 128;

let db: SqlDatabase;

export async function bindGeneralMemoryDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS general_facts (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      fact TEXT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
}

export interface GeneralFactRecord {
  id: number;
  fact: string;
  createdAt: string;
}

interface GeneralFactRow {
  id: number;
  fact: string;
  created_at: number;
}

export async function getGeneralFacts(): Promise<string[]> {
  return (await listGeneralFacts()).map((r) => r.fact);
}

export async function listGeneralFacts(): Promise<GeneralFactRecord[]> {
  const { rows } = await db.query<GeneralFactRow>(
    `SELECT id, fact, created_at FROM general_facts ORDER BY id ASC`,
  );
  return rows.map(rowToGeneralFactRecord);
}

function rowToGeneralFactRecord(r: GeneralFactRow): GeneralFactRecord {
  return {
    id: r.id,
    fact: r.fact,
    createdAt: new Date(r.created_at * 1000).toISOString(),
  };
}

export interface GeneralMemoryMatch {
  id: number;
  fact: string;
}

/** Case-insensitive substring search over general facts. */
export async function searchGeneralFacts(
  query: string,
  limit = 50,
): Promise<GeneralMemoryMatch[]> {
  const q = query.trim();
  if (!q) return [];
  const { rows } = await db.query<{ id: number; fact: string }>(
    `SELECT id, fact FROM general_facts
       WHERE fact ILIKE '%' || $1 || '%'
       ORDER BY id ASC LIMIT $2`,
    [q, limit],
  );
  return rows.map((r) => ({ id: r.id, fact: r.fact }));
}

export async function getGeneralFactById(
  id: number,
): Promise<GeneralFactRecord | null> {
  const { rows } = await db.query<GeneralFactRow>(
    `SELECT id, fact, created_at FROM general_facts WHERE id = $1`,
    [id],
  );
  return rows[0] ? rowToGeneralFactRecord(rows[0]) : null;
}

function notifyGeneralMemoryChanged(): void {
  const hooks = getModuleLiveHooks();
  hooks.emitMemoryUpdated?.("general");
  hooks.emitDataUpdated?.(["general_facts"]);
}

export async function deleteGeneralFactById(id: number): Promise<boolean> {
  const result = await db.query(`DELETE FROM general_facts WHERE id = $1`, [id]);
  const deleted = (result.rowCount ?? 0) > 0;
  if (deleted) notifyGeneralMemoryChanged();
  return deleted;
}

export async function createGeneralFact(
  fact: string,
): Promise<GeneralFactRecord | null> {
  const normalized = normalizeFactText(fact);
  if (!normalized) return null;

  const existing = new Set((await getGeneralFacts()).map((f) => f.toLowerCase()));
  if (existing.has(normalized.toLowerCase())) {
    const { rows } = await db.query<GeneralFactRow>(
      `SELECT id, fact, created_at FROM general_facts
         WHERE lower(fact) = lower($1)`,
      [normalized],
    );
    return rows[0] ? rowToGeneralFactRecord(rows[0]) : null;
  }

  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO general_facts (fact) VALUES ($1) RETURNING id`,
    [normalized],
  );
  await pruneGeneralFacts();
  notifyGeneralMemoryChanged();
  return rows[0] ? getGeneralFactById(rows[0].id) : null;
}

export async function updateGeneralFactById(
  id: number,
  fact: string,
): Promise<GeneralFactRecord | "duplicate" | null> {
  const normalized = normalizeFactText(fact);
  if (!normalized) return null;

  const current = await getGeneralFactById(id);
  if (!current) return null;

  const { rows: dup } = await db.query(
    `SELECT 1 FROM general_facts
       WHERE lower(fact) = lower($1) AND id != $2`,
    [normalized, id],
  );
  if (dup.length > 0) return "duplicate";

  await db.query(`UPDATE general_facts SET fact = $1 WHERE id = $2`, [
    normalized,
    id,
  ]);
  notifyGeneralMemoryChanged();
  return getGeneralFactById(id);
}

export async function addGeneralFacts(facts: string[]): Promise<number> {
  const existing = new Set((await getGeneralFacts()).map((f) => f.toLowerCase()));
  let added = 0;

  for (const fact of facts) {
    const normalized = normalizeFactText(fact);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);
    await db.query(`INSERT INTO general_facts (fact) VALUES ($1)`, [normalized]);
    added++;
  }

  await pruneGeneralFacts();
  if (added > 0) notifyGeneralMemoryChanged();
  return added;
}

export async function clearAllGeneralFacts(): Promise<number> {
  const result = await db.query(`DELETE FROM general_facts`);
  const deleted = result.rowCount ?? 0;
  if (deleted > 0) notifyGeneralMemoryChanged();
  return deleted;
}

export async function replaceGeneralFacts(facts: string[]): Promise<void> {
  await db.query(`DELETE FROM general_facts`);
  for (const fact of facts) {
    const normalized = normalizeFactText(fact);
    if (!normalized) continue;
    await db.query(`INSERT INTO general_facts (fact) VALUES ($1)`, [normalized]);
  }
  await pruneGeneralFacts();
  notifyGeneralMemoryChanged();
}

async function pruneGeneralFacts(): Promise<void> {
  await db.query(
    `DELETE FROM general_facts
     WHERE id NOT IN (
       SELECT id FROM general_facts
       ORDER BY id DESC
       LIMIT $1
     )`,
    [MAX_GENERAL_FACTS],
  );
}

export { formatGeneralMemoryForPrompt } from "../index.js";
