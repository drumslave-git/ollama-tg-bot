import { getModuleLiveHooks } from "@llm-tg-bot/modules-registry";
import { normalizeFactText } from "./memory-facts.js";
const MAX_MEMORY_CHARS = 12000;
let db;
export function bindGroupMemoryDatabase(database) {
    db = database;
    db.exec(`
    CREATE TABLE IF NOT EXISTS group_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_group_memories_group
      ON group_memories (group_id);
  `);
}
export function getGroupFacts(groupId) {
    const content = getGroupMemoryContent(groupId);
    return content ? [content] : [];
}
export function getGroupMemoryContent(groupId) {
    const row = db
        .prepare(`SELECT content FROM group_memories WHERE group_id = ?`)
        .get(groupId);
    return row?.content ?? "";
}
export function listAllGroupFacts() {
    const rows = db
        .prepare(`SELECT id, group_id, content, updated_at FROM group_memories
       ORDER BY group_id ASC`)
        .all();
    return rows.map(rowToGroupFactRecord);
}
export function listGroupFacts(groupId) {
    const row = getGroupMemoryRecord(groupId);
    return row ? [row] : [];
}
function rowToGroupFactRecord(r) {
    return {
        id: r.id,
        groupId: r.group_id,
        fact: r.content,
        createdAt: new Date(r.updated_at * 1000).toISOString(),
    };
}
export function getGroupFactById(id) {
    const row = db
        .prepare(`SELECT id, group_id, content, updated_at FROM group_memories WHERE id = ?`)
        .get(id);
    return row ? rowToGroupFactRecord(row) : null;
}
function getGroupMemoryRecord(groupId) {
    const row = db
        .prepare(`SELECT id, group_id, content, updated_at FROM group_memories
       WHERE group_id = ?`)
        .get(groupId);
    return row ? rowToGroupFactRecord(row) : null;
}
function notifyGroupMemoryChanged() {
    const hooks = getModuleLiveHooks();
    hooks.emitMemoryUpdated?.("group");
    hooks.emitDataUpdated?.(["group_memories"]);
}
export function deleteGroupFactById(id) {
    const result = db.prepare(`DELETE FROM group_memories WHERE id = ?`).run(id);
    if (result.changes > 0)
        notifyGroupMemoryChanged();
    return result.changes > 0;
}
export function createGroupFact(groupId, fact) {
    const normalized = normalizeFactText(fact);
    if (!normalized)
        return null;
    const existing = getGroupMemoryContent(groupId);
    const content = appendUniqueLine(existing, normalized);
    replaceGroupMemory(groupId, content);
    return getGroupMemoryRecord(groupId);
}
export function updateGroupFactById(id, fact) {
    const normalized = normalizeMemoryContent(fact);
    if (!normalized)
        return null;
    const current = getGroupFactById(id);
    if (!current)
        return null;
    replaceGroupMemory(current.groupId, normalized);
    return getGroupMemoryRecord(current.groupId);
}
export function clearGroupFactsForGroup(groupId) {
    const result = db
        .prepare(`DELETE FROM group_memories WHERE group_id = ?`)
        .run(groupId);
    const deleted = Number(result.changes);
    if (deleted > 0)
        notifyGroupMemoryChanged();
    return deleted;
}
export function addGroupFacts(groupId, facts) {
    const existing = getGroupMemoryContent(groupId);
    let content = existing;
    let added = 0;
    for (const fact of facts) {
        const normalized = normalizeFactText(fact);
        if (!normalized)
            continue;
        const next = appendUniqueLine(content, normalized);
        if (next === content)
            continue;
        content = next;
        added++;
    }
    if (added > 0)
        replaceGroupMemory(groupId, content);
    return added;
}
export function clearGroupMemory(groupId) {
    const result = db
        .prepare(`DELETE FROM group_memories WHERE group_id = ?`)
        .run(groupId);
    if (result.changes > 0)
        notifyGroupMemoryChanged();
}
export { formatGroupMemoryForPrompt } from "@llm-tg-bot/modules-memory";
export function groupMemoryTotalChars(facts) {
    return facts.reduce((n, f) => n + f.length, 0);
}
export function replaceGroupFacts(groupId, facts) {
    replaceGroupMemory(groupId, facts.join("\n").trim());
}
export function replaceGroupMemory(groupId, content) {
    const normalized = normalizeMemoryContent(content);
    if (!normalized) {
        clearGroupMemory(groupId);
        return;
    }
    db.prepare(`INSERT INTO group_memories (group_id, content, updated_at)
     VALUES (?, ?, unixepoch())
     ON CONFLICT(group_id) DO UPDATE SET
       content = excluded.content,
       updated_at = excluded.updated_at`).run(groupId, normalized);
    notifyGroupMemoryChanged();
}
function appendUniqueLine(existing, fact) {
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
function normalizeMemoryContent(content) {
    if (typeof content !== "string")
        return null;
    const normalized = content.trim();
    if (normalized.length < 2)
        return null;
    return normalized.slice(0, MAX_MEMORY_CHARS);
}
