import { getModuleLiveHooks } from "@llm-tg-bot/modules-registry";
import { normalizeFactText } from "./memory-facts.js";
const MAX_GENERAL_FACTS = 128;
let db;
export function bindGeneralMemoryDatabase(database) {
    db = database;
    db.exec(`
    CREATE TABLE IF NOT EXISTS general_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fact TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_general_facts_id
      ON general_facts (id);
  `);
}
export function getGeneralFacts() {
    return listGeneralFacts().map((r) => r.fact);
}
export function listGeneralFacts() {
    const rows = db
        .prepare(`SELECT id, fact, created_at FROM general_facts ORDER BY id ASC`)
        .all();
    return rows.map(rowToGeneralFactRecord);
}
function rowToGeneralFactRecord(r) {
    return {
        id: r.id,
        fact: r.fact,
        createdAt: new Date(r.created_at * 1000).toISOString(),
    };
}
export function getGeneralFactById(id) {
    const row = db
        .prepare(`SELECT id, fact, created_at FROM general_facts WHERE id = ?`)
        .get(id);
    return row ? rowToGeneralFactRecord(row) : null;
}
function notifyGeneralMemoryChanged() {
    const hooks = getModuleLiveHooks();
    hooks.emitMemoryUpdated?.("general");
    hooks.emitDataUpdated?.(["general_facts"]);
}
export function deleteGeneralFactById(id) {
    const result = db.prepare(`DELETE FROM general_facts WHERE id = ?`).run(id);
    if (result.changes > 0)
        notifyGeneralMemoryChanged();
    return result.changes > 0;
}
export function createGeneralFact(fact) {
    const normalized = normalizeFactText(fact);
    if (!normalized)
        return null;
    const existing = new Set(getGeneralFacts().map((f) => f.toLowerCase()));
    if (existing.has(normalized.toLowerCase())) {
        const row = db
            .prepare(`SELECT id, fact, created_at FROM general_facts
         WHERE lower(fact) = lower(?)`)
            .get(normalized);
        return row ? rowToGeneralFactRecord(row) : null;
    }
    const result = db
        .prepare(`INSERT INTO general_facts (fact) VALUES (?)`)
        .run(normalized);
    pruneGeneralFacts();
    notifyGeneralMemoryChanged();
    return getGeneralFactById(Number(result.lastInsertRowid));
}
export function updateGeneralFactById(id, fact) {
    const normalized = normalizeFactText(fact);
    if (!normalized)
        return null;
    const current = getGeneralFactById(id);
    if (!current)
        return null;
    const duplicate = db
        .prepare(`SELECT 1 FROM general_facts
       WHERE lower(fact) = lower(?) AND id != ?`)
        .get(normalized, id);
    if (duplicate)
        return "duplicate";
    db.prepare(`UPDATE general_facts SET fact = ? WHERE id = ?`).run(normalized, id);
    notifyGeneralMemoryChanged();
    return getGeneralFactById(id);
}
export function addGeneralFacts(facts) {
    const existing = new Set(getGeneralFacts().map((f) => f.toLowerCase()));
    const insert = db.prepare(`INSERT INTO general_facts (fact) VALUES (?)`);
    let added = 0;
    for (const fact of facts) {
        const normalized = normalizeFactText(fact);
        if (!normalized)
            continue;
        const key = normalized.toLowerCase();
        if (existing.has(key))
            continue;
        existing.add(key);
        insert.run(normalized);
        added++;
    }
    pruneGeneralFacts();
    if (added > 0)
        notifyGeneralMemoryChanged();
    return added;
}
export function clearAllGeneralFacts() {
    const result = db.prepare(`DELETE FROM general_facts`).run();
    const deleted = Number(result.changes);
    if (deleted > 0)
        notifyGeneralMemoryChanged();
    return deleted;
}
export function replaceGeneralFacts(facts) {
    db.prepare(`DELETE FROM general_facts`).run();
    const insert = db.prepare(`INSERT INTO general_facts (fact) VALUES (?)`);
    for (const fact of facts) {
        const normalized = normalizeFactText(fact);
        if (!normalized)
            continue;
        insert.run(normalized);
    }
    pruneGeneralFacts();
    notifyGeneralMemoryChanged();
}
function pruneGeneralFacts() {
    db.prepare(`DELETE FROM general_facts
     WHERE id NOT IN (
       SELECT id FROM general_facts
       ORDER BY id DESC
       LIMIT ?
     )`).run(MAX_GENERAL_FACTS);
}
export { formatGeneralMemoryForPrompt } from "@llm-tg-bot/modules-memory";
