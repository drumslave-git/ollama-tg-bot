import type { SqlDatabase } from "../../../contracts/index.js";
import {
  applyMoodCooldown,
  moodValuesEqual,
  normalizeMoodValues,
  type MoodValues,
} from "../values.js";
import { getFeatureLiveHooks } from "../../../contracts/index.js";
import { getActivePersonalityMoodDefaults } from "./personalities.js";

const MOOD_ANCHOR_KEY = "moodAnchor";
const MOOD_VALUES_KEY = "moodValues";
const MOOD_UPDATED_AT_KEY = "moodUpdatedAt";

let db: SqlDatabase;
let readSettings: () => Promise<{ moodCooldownMinutes: number }> = () => {
  throw new Error("Mood feature not initialized");
};

export interface MoodState {
  values: MoodValues;
  updatedAt: string;
}

export interface MoodStateView extends MoodState {
  effectiveValues: MoodValues;
}

export function bindMoodDatabase(database: SqlDatabase): void {
  db = database;
}

export function configureMoodAccess(
  getSettings: () => Promise<{ moodCooldownMinutes: number }>,
): void {
  readSettings = getSettings;
}

function moodDefaults(): Promise<MoodValues> {
  return getActivePersonalityMoodDefaults();
}

async function moodCooldownMinutes(): Promise<number> {
  return (await readSettings()).moodCooldownMinutes;
}

async function readMeta(key: string): Promise<string | null> {
  const { rows } = await db.query<{ value: string }>(
    "SELECT value FROM stats_meta WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

async function writeMeta(key: string, value: string): Promise<void> {
  await db.query(
    "INSERT INTO stats_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

async function deleteMeta(key: string): Promise<void> {
  await db.query("DELETE FROM stats_meta WHERE key = $1", [key]);
}

function parseMoodJson(
  json: string | null,
  fallback: MoodValues,
): MoodValues | null {
  if (!json) return null;
  try {
    return normalizeMoodValues(
      JSON.parse(json) as Partial<Record<string, unknown>>,
      fallback,
    );
  } catch {
    return null;
  }
}

async function getMoodAnchorState(): Promise<{
  anchor: MoodValues;
  updatedAt: string;
} | null> {
  const updatedAt = await readMeta(MOOD_UPDATED_AT_KEY);
  if (!updatedAt) return null;

  const defaults = await moodDefaults();
  const anchorJson =
    (await readMeta(MOOD_ANCHOR_KEY)) ?? (await readMeta(MOOD_VALUES_KEY));
  const anchor = parseMoodJson(anchorJson, defaults);
  if (!anchor) return null;

  return { anchor, updatedAt };
}

/** Apply linear cooldown from the last interaction anchor and persist decayed values. */
export async function tickMoodCooldown(): Promise<boolean> {
  const anchorState = await getMoodAnchorState();
  if (!anchorState) return false;

  const defaults = await moodDefaults();
  const decayed = applyMoodCooldown(
    anchorState.anchor,
    defaults,
    anchorState.updatedAt,
    await moodCooldownMinutes(),
  );

  const current = parseMoodJson(await readMeta(MOOD_VALUES_KEY), defaults);
  if (current && moodValuesEqual(current, decayed)) return false;

  await writeMeta(MOOD_VALUES_KEY, JSON.stringify(decayed));
  getFeatureLiveHooks().emitMoodUpdated?.();
  return true;
}

/** Current mood kept up to date by the background cooldown worker. */
export async function getEffectiveMood(): Promise<MoodValues> {
  const defaults = await moodDefaults();
  const current = parseMoodJson(await readMeta(MOOD_VALUES_KEY), defaults);
  if (current) return current;
  return { ...defaults };
}

export async function getMoodStateView(): Promise<MoodStateView | null> {
  const anchorState = await getMoodAnchorState();
  if (!anchorState) return null;

  const defaults = await moodDefaults();
  const values = parseMoodJson(await readMeta(MOOD_VALUES_KEY), defaults);
  if (!values) return null;

  return {
    values,
    updatedAt: anchorState.updatedAt,
    effectiveValues: applyMoodCooldown(
      anchorState.anchor,
      defaults,
      anchorState.updatedAt,
      await moodCooldownMinutes(),
    ),
  };
}

export async function saveMoodState(values: MoodValues): Promise<MoodState> {
  const normalized = normalizeMoodValues(values, await moodDefaults());
  const updatedAt = new Date().toISOString();
  const encoded = JSON.stringify(normalized);

  await writeMeta(MOOD_ANCHOR_KEY, encoded);
  await writeMeta(MOOD_VALUES_KEY, encoded);
  await writeMeta(MOOD_UPDATED_AT_KEY, updatedAt);

  getFeatureLiveHooks().emitMoodUpdated?.();
  return { values: normalized, updatedAt };
}

export async function resetMoodState(): Promise<boolean> {
  const hadValues = (await readMeta(MOOD_VALUES_KEY)) != null;
  await deleteMeta(MOOD_ANCHOR_KEY);
  await deleteMeta(MOOD_VALUES_KEY);
  await deleteMeta(MOOD_UPDATED_AT_KEY);
  if (hadValues) {
    getFeatureLiveHooks().emitMoodUpdated?.();
  }
  return hadValues;
}
