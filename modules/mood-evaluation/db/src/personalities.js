import { DEFAULT_MOOD_VALUES, MOOD_KEYS, clampMoodLevel, normalizeMoodValues, } from "@llm-tg-bot/modules-mood-evaluation";
import { getModuleLiveHooks } from "@llm-tg-bot/modules-registry";
export const MAX_PERSONALITIES = 32;
export const MAX_PERSONALITY_NAME_LENGTH = 64;
export const MAX_PERSONALITY_PROMPT_LENGTH = 32000;
let db;
let getActivePersonalityId = () => 0;
export function bindPersonalitiesDatabase(database) {
    db = database;
    db.exec(`
    CREATE TABLE IF NOT EXISTS personalities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_personalities_name
      ON personalities (name COLLATE NOCASE);
  `);
    const columns = db.prepare("PRAGMA table_info(personalities)").all();
    if (!columns.some((column) => column.name === "mood_defaults")) {
        db.exec(`ALTER TABLE personalities ADD COLUMN mood_defaults TEXT`);
    }
}
export function configurePersonalityAccess(getSettingsFn) {
    getActivePersonalityId = () => getSettingsFn().activePersonalityId;
}
export function normalizePersonalityMoodDefaults(raw, fallback = DEFAULT_MOOD_VALUES) {
    const normalized = normalizeMoodValues(raw, fallback);
    for (const key of MOOD_KEYS) {
        const value = normalized[key];
        if (!Number.isInteger(value) ||
            value !== clampMoodLevel(value) ||
            value < 0 ||
            value > 5) {
            throw new Error(`moodDefaults.${key} must be an integer 0–5`);
        }
    }
    return normalized;
}
export function normalizePersonalityName(raw) {
    const name = raw?.trim() ?? "";
    if (!name)
        throw new Error("Personality name is required");
    if (name.length > MAX_PERSONALITY_NAME_LENGTH) {
        throw new Error(`Personality name must be at most ${MAX_PERSONALITY_NAME_LENGTH} characters`);
    }
    return name;
}
export function normalizePersonalityPrompt(raw) {
    const prompt = raw?.trim() ?? "";
    if (prompt.length > MAX_PERSONALITY_PROMPT_LENGTH) {
        throw new Error(`Personality prompt must be at most ${MAX_PERSONALITY_PROMPT_LENGTH} characters`);
    }
    return prompt;
}
function parseMoodDefaultsColumn(raw) {
    if (!raw?.trim())
        return { ...DEFAULT_MOOD_VALUES };
    try {
        return normalizePersonalityMoodDefaults(JSON.parse(raw));
    }
    catch {
        return { ...DEFAULT_MOOD_VALUES };
    }
}
function rowToPersonality(r) {
    return {
        id: r.id,
        name: r.name,
        prompt: r.prompt,
        moodDefaults: parseMoodDefaultsColumn(r.mood_defaults),
        createdAt: new Date(r.created_at * 1000).toISOString(),
        updatedAt: new Date(r.updated_at * 1000).toISOString(),
    };
}
export function countPersonalities() {
    const row = db
        .prepare("SELECT COUNT(*) AS n FROM personalities")
        .get();
    return row.n;
}
export function listPersonalities() {
    const rows = db
        .prepare(`SELECT id, name, prompt, mood_defaults, created_at, updated_at
       FROM personalities
       ORDER BY id ASC`)
        .all();
    return rows.map(rowToPersonality);
}
export function getPersonalityById(id) {
    const row = db
        .prepare(`SELECT id, name, prompt, mood_defaults, created_at, updated_at
       FROM personalities WHERE id = ?`)
        .get(id);
    return row ? rowToPersonality(row) : null;
}
export function resolveActivePersonalityId(storedId) {
    if (storedId <= 0)
        return 0;
    return getPersonalityById(storedId) ? storedId : 0;
}
export function getActivePersonalityPrompt() {
    const id = resolveActivePersonalityId(getActivePersonalityId());
    if (!id)
        return "";
    return getPersonalityById(id)?.prompt ?? "";
}
export function getActivePersonalityMoodDefaults() {
    const id = resolveActivePersonalityId(getActivePersonalityId());
    if (!id)
        return { ...DEFAULT_MOOD_VALUES };
    return getPersonalityById(id)?.moodDefaults ?? { ...DEFAULT_MOOD_VALUES };
}
function nameTaken(name, exceptId) {
    const row = db
        .prepare(`SELECT 1 FROM personalities
       WHERE name = ? COLLATE NOCASE
       ${exceptId != null ? "AND id != ?" : ""}`)
        .get(...(exceptId != null ? [name, exceptId] : [name]));
    return Boolean(row);
}
export function createPersonality(name, prompt, moodDefaults = DEFAULT_MOOD_VALUES) {
    if (countPersonalities() >= MAX_PERSONALITIES)
        return null;
    if (nameTaken(name))
        return null;
    const normalizedMood = normalizePersonalityMoodDefaults(moodDefaults);
    const result = db
        .prepare(`INSERT INTO personalities (name, prompt, mood_defaults, created_at, updated_at)
       VALUES (?, ?, ?, unixepoch(), unixepoch())`)
        .run(name, prompt, JSON.stringify(normalizedMood));
    const id = Number(result.lastInsertRowid);
    getModuleLiveHooks().emitPersonalitiesUpdated?.();
    return getPersonalityById(id);
}
export function updatePersonalityById(id, patch) {
    const existing = getPersonalityById(id);
    if (!existing)
        return null;
    const nextName = patch.name !== undefined ? normalizePersonalityName(patch.name) : existing.name;
    const nextPrompt = patch.prompt !== undefined
        ? normalizePersonalityPrompt(patch.prompt)
        : existing.prompt;
    const nextMood = patch.moodDefaults !== undefined
        ? normalizePersonalityMoodDefaults(patch.moodDefaults, existing.moodDefaults)
        : existing.moodDefaults;
    if (nextName !== existing.name && nameTaken(nextName, id)) {
        return "duplicate";
    }
    db.prepare(`UPDATE personalities
     SET name = ?, prompt = ?, mood_defaults = ?, updated_at = unixepoch()
     WHERE id = ?`).run(nextName, nextPrompt, JSON.stringify(nextMood), id);
    getModuleLiveHooks().emitPersonalitiesUpdated?.();
    return getPersonalityById(id);
}
export function deletePersonalityById(id) {
    const result = db.prepare("DELETE FROM personalities WHERE id = ?").run(id);
    if (result.changes > 0) {
        getModuleLiveHooks().emitPersonalitiesUpdated?.();
    }
    return result.changes > 0;
}
