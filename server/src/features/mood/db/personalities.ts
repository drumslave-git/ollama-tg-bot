import type { SqlDatabase } from "../../../contracts/index.js";
import {
  DEFAULT_MOOD_VALUES,
  MOOD_KEYS,
  clampMoodLevel,
  normalizeMoodValues,
  type MoodValues,
} from "../values.js";
import { getModuleLiveHooks } from "../../../contracts/index.js";

export const MAX_PERSONALITIES = 32;
export const MAX_PERSONALITY_NAME_LENGTH = 64;
export const MAX_PERSONALITY_PROMPT_LENGTH = 32000;

let db: SqlDatabase;
let getActivePersonalityId: () => Promise<number> = async () => 0;

export interface PersonalityRecord {
  id: number;
  name: string;
  prompt: string;
  moodDefaults: MoodValues;
  createdAt: string;
  updatedAt: string;
}

interface PersonalityRow {
  id: number;
  name: string;
  prompt: string;
  mood_defaults: string | null;
  created_at: number;
  updated_at: number;
}

export async function bindPersonalitiesDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS personalities (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL DEFAULT '',
      mood_defaults TEXT,
      created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint,
      updated_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_personalities_name
       ON personalities (lower(name));`,
  );
}

export function configurePersonalityAccess(
  getSettingsFn: () => Promise<{ activePersonalityId: number }>,
): void {
  getActivePersonalityId = async () =>
    (await getSettingsFn()).activePersonalityId;
}

export function normalizePersonalityMoodDefaults(
  raw: Partial<Record<string, unknown>> | null | undefined,
  fallback: MoodValues = DEFAULT_MOOD_VALUES,
): MoodValues {
  const normalized = normalizeMoodValues(raw, fallback);
  for (const key of MOOD_KEYS) {
    const value = normalized[key];
    if (
      !Number.isInteger(value) ||
      value !== clampMoodLevel(value) ||
      value < 0 ||
      value > 5
    ) {
      throw new Error(`moodDefaults.${key} must be an integer 0–5`);
    }
  }
  return normalized;
}

export function normalizePersonalityName(raw: string | undefined): string {
  const name = raw?.trim() ?? "";
  if (!name) throw new Error("Personality name is required");
  if (name.length > MAX_PERSONALITY_NAME_LENGTH) {
    throw new Error(
      `Personality name must be at most ${MAX_PERSONALITY_NAME_LENGTH} characters`,
    );
  }
  return name;
}

export function normalizePersonalityPrompt(raw: string | undefined): string {
  const prompt = raw?.trim() ?? "";
  if (prompt.length > MAX_PERSONALITY_PROMPT_LENGTH) {
    throw new Error(
      `Personality prompt must be at most ${MAX_PERSONALITY_PROMPT_LENGTH} characters`,
    );
  }
  return prompt;
}

function parseMoodDefaultsColumn(raw: string | null | undefined): MoodValues {
  if (!raw?.trim()) return { ...DEFAULT_MOOD_VALUES };
  try {
    return normalizePersonalityMoodDefaults(
      JSON.parse(raw) as Partial<Record<string, unknown>>,
    );
  } catch {
    return { ...DEFAULT_MOOD_VALUES };
  }
}

function rowToPersonality(r: PersonalityRow): PersonalityRecord {
  return {
    id: r.id,
    name: r.name,
    prompt: r.prompt,
    moodDefaults: parseMoodDefaultsColumn(r.mood_defaults),
    createdAt: new Date(r.created_at * 1000).toISOString(),
    updatedAt: new Date(r.updated_at * 1000).toISOString(),
  };
}

export async function countPersonalities(): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM personalities",
  );
  return rows[0]?.n ?? 0;
}

export async function listPersonalities(): Promise<PersonalityRecord[]> {
  const { rows } = await db.query<PersonalityRow>(
    `SELECT id, name, prompt, mood_defaults, created_at, updated_at
       FROM personalities
       ORDER BY id ASC`,
  );
  return rows.map(rowToPersonality);
}

export async function getPersonalityById(
  id: number,
): Promise<PersonalityRecord | null> {
  const { rows } = await db.query<PersonalityRow>(
    `SELECT id, name, prompt, mood_defaults, created_at, updated_at
       FROM personalities WHERE id = $1`,
    [id],
  );
  return rows[0] ? rowToPersonality(rows[0]) : null;
}

export async function resolveActivePersonalityId(
  storedId: number,
): Promise<number> {
  if (storedId <= 0) return 0;
  return (await getPersonalityById(storedId)) ? storedId : 0;
}

export async function getActivePersonalityPrompt(): Promise<string> {
  const id = await resolveActivePersonalityId(await getActivePersonalityId());
  if (!id) return "";
  return (await getPersonalityById(id))?.prompt ?? "";
}

export async function getActivePersonalityMoodDefaults(): Promise<MoodValues> {
  const id = await resolveActivePersonalityId(await getActivePersonalityId());
  if (!id) return { ...DEFAULT_MOOD_VALUES };
  return (await getPersonalityById(id))?.moodDefaults ?? { ...DEFAULT_MOOD_VALUES };
}

async function nameTaken(name: string, exceptId?: number): Promise<boolean> {
  const { rows } =
    exceptId != null
      ? await db.query(
          `SELECT 1 FROM personalities WHERE lower(name) = lower($1) AND id != $2`,
          [name, exceptId],
        )
      : await db.query(
          `SELECT 1 FROM personalities WHERE lower(name) = lower($1)`,
          [name],
        );
  return rows.length > 0;
}

export async function createPersonality(
  name: string,
  prompt: string,
  moodDefaults: MoodValues = DEFAULT_MOOD_VALUES,
): Promise<PersonalityRecord | null> {
  if ((await countPersonalities()) >= MAX_PERSONALITIES) return null;
  if (await nameTaken(name)) return null;

  const normalizedMood = normalizePersonalityMoodDefaults(moodDefaults);

  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO personalities (name, prompt, mood_defaults)
       VALUES ($1, $2, $3) RETURNING id`,
    [name, prompt, JSON.stringify(normalizedMood)],
  );

  getModuleLiveHooks().emitPersonalitiesUpdated?.();
  return rows[0] ? getPersonalityById(rows[0].id) : null;
}

export async function updatePersonalityById(
  id: number,
  patch: { name?: string; prompt?: string; moodDefaults?: MoodValues },
): Promise<PersonalityRecord | "duplicate" | null> {
  const existing = await getPersonalityById(id);
  if (!existing) return null;

  const nextName =
    patch.name !== undefined ? normalizePersonalityName(patch.name) : existing.name;
  const nextPrompt =
    patch.prompt !== undefined
      ? normalizePersonalityPrompt(patch.prompt)
      : existing.prompt;
  const nextMood =
    patch.moodDefaults !== undefined
      ? normalizePersonalityMoodDefaults(patch.moodDefaults, existing.moodDefaults)
      : existing.moodDefaults;

  if (nextName !== existing.name && (await nameTaken(nextName, id))) {
    return "duplicate";
  }

  await db.query(
    `UPDATE personalities
       SET name = $1, prompt = $2, mood_defaults = $3,
           updated_at = extract(epoch from now())::bigint
       WHERE id = $4`,
    [nextName, nextPrompt, JSON.stringify(nextMood), id],
  );

  getModuleLiveHooks().emitPersonalitiesUpdated?.();
  return getPersonalityById(id);
}

export async function deletePersonalityById(id: number): Promise<boolean> {
  const result = await db.query("DELETE FROM personalities WHERE id = $1", [id]);
  const deleted = (result.rowCount ?? 0) > 0;
  if (deleted) {
    getModuleLiveHooks().emitPersonalitiesUpdated?.();
  }
  return deleted;
}
