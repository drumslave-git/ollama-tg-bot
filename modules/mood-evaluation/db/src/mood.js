import { applyMoodCooldown, moodValuesEqual, normalizeMoodValues, } from "@llm-tg-bot/modules-mood-evaluation";
import { getModuleLiveHooks } from "@llm-tg-bot/modules-registry";
import { getActivePersonalityMoodDefaults } from "./personalities.js";
const MOOD_ANCHOR_KEY = "moodAnchor";
const MOOD_VALUES_KEY = "moodValues";
const MOOD_UPDATED_AT_KEY = "moodUpdatedAt";
let db;
let readSettings = () => {
    throw new Error("Mood module not initialized");
};
export function bindMoodDatabase(database) {
    db = database;
}
export function configureMoodAccess(getSettings) {
    readSettings = getSettings;
}
function moodDefaults() {
    return getActivePersonalityMoodDefaults();
}
function moodCooldownMinutes() {
    return readSettings().moodCooldownMinutes;
}
function readMeta(key) {
    const row = db
        .prepare("SELECT value FROM stats_meta WHERE key = ?")
        .get(key);
    return row?.value ?? null;
}
function writeMeta(key, value) {
    db.prepare("INSERT INTO stats_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
function deleteMeta(key) {
    db.prepare("DELETE FROM stats_meta WHERE key = ?").run(key);
}
function parseMoodJson(json, fallback) {
    if (!json)
        return null;
    try {
        return normalizeMoodValues(JSON.parse(json), fallback);
    }
    catch {
        return null;
    }
}
function getMoodAnchorState() {
    const updatedAt = readMeta(MOOD_UPDATED_AT_KEY);
    if (!updatedAt)
        return null;
    const defaults = moodDefaults();
    const anchorJson = readMeta(MOOD_ANCHOR_KEY) ?? readMeta(MOOD_VALUES_KEY);
    const anchor = parseMoodJson(anchorJson, defaults);
    if (!anchor)
        return null;
    return { anchor, updatedAt };
}
/** Apply linear cooldown from the last interaction anchor and persist decayed values. */
export function tickMoodCooldown() {
    const anchorState = getMoodAnchorState();
    if (!anchorState)
        return false;
    const defaults = moodDefaults();
    const decayed = applyMoodCooldown(anchorState.anchor, defaults, anchorState.updatedAt, moodCooldownMinutes());
    const current = parseMoodJson(readMeta(MOOD_VALUES_KEY), defaults);
    if (current && moodValuesEqual(current, decayed))
        return false;
    writeMeta(MOOD_VALUES_KEY, JSON.stringify(decayed));
    getModuleLiveHooks().emitMoodUpdated?.();
    return true;
}
export function getMoodState() {
    const anchorState = getMoodAnchorState();
    if (!anchorState)
        return null;
    const values = parseMoodJson(readMeta(MOOD_VALUES_KEY), moodDefaults());
    if (!values)
        return null;
    return { values, updatedAt: anchorState.updatedAt };
}
/** Current mood kept up to date by the background cooldown worker. */
export function getEffectiveMood() {
    const defaults = moodDefaults();
    const current = parseMoodJson(readMeta(MOOD_VALUES_KEY), defaults);
    if (current)
        return current;
    return { ...defaults };
}
export function getMoodStateView() {
    const anchorState = getMoodAnchorState();
    if (!anchorState)
        return null;
    const values = parseMoodJson(readMeta(MOOD_VALUES_KEY), moodDefaults());
    if (!values)
        return null;
    return {
        values,
        updatedAt: anchorState.updatedAt,
        effectiveValues: applyMoodCooldown(anchorState.anchor, moodDefaults(), anchorState.updatedAt, moodCooldownMinutes()),
    };
}
export function saveMoodState(values) {
    const normalized = normalizeMoodValues(values, moodDefaults());
    const updatedAt = new Date().toISOString();
    const encoded = JSON.stringify(normalized);
    writeMeta(MOOD_ANCHOR_KEY, encoded);
    writeMeta(MOOD_VALUES_KEY, encoded);
    writeMeta(MOOD_UPDATED_AT_KEY, updatedAt);
    getModuleLiveHooks().emitMoodUpdated?.();
    return { values: normalized, updatedAt };
}
export function resetMoodState() {
    const hadValues = readMeta(MOOD_VALUES_KEY) != null;
    deleteMeta(MOOD_ANCHOR_KEY);
    deleteMeta(MOOD_VALUES_KEY);
    deleteMeta(MOOD_UPDATED_AT_KEY);
    if (hadValues) {
        getModuleLiveHooks().emitMoodUpdated?.();
    }
    return hadValues;
}
