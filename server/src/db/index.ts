import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config/index.js";
import {
  appendErrorLog,
  bindErrorLogDatabase,
  clearErrorLog,
} from "./debug/error-log.js";
import { bindDebugTracesDatabase } from "./debug/traces.js";
import { bindKnownUsersDatabase } from "./users/known-users.js";
import { bindDataBrowserDatabase } from "./data/browser.js";
import { getPersonalityById } from "./personalities/index.js";
import {
  invalidateModelContextCache,
  refreshModelContextCache,
} from "../llm/model-context-cache.js";
import { getResolvedSettings } from "../settings/runtime.js";
import {
  normalizeTokenBudget,
  validateSettingsFields,
} from "../settings/limits.js";
import {
  configureModuleDatabases,
  initModuleDatabases,
} from "../runtime/modules.js";
import { buildModuleDbHost } from "../runtime/module-db-host.js";

export interface Settings {
  model: string;
  /** Id of the personality whose prompt is layered on the base system prompt (0 = none). */
  activePersonalityId: number;
  /** Max tokens LLM may generate per reply (lower = faster). */
  numPredict: number;
  /** Context window size sent to LLM. */
  numCtx: number;
  temperature: number;
  /** Nucleus sampling — lower = more focused (LLM top_p). */
  topP: number;
  /** Limits candidate tokens per step (LLM top_k). */
  topK: number;
  /** Penalizes repeated tokens (LLM repeat_penalty). */
  repeatPenalty: number;
  /** LLM request timeout in seconds. */
  chatTimeoutSec: number;
  /** Longest edge for vision images (pixels). */
  visionMaxDimension: number;
  /** Telegram @username of the bot owner (empty = not set). */
  ownerUsername: string;
  /** Resolved numeric user id for ownerUsername (set by the server). */
  ownerUserId: string;
  /** Send stickers from a configured Telegram sticker set. */
  stickersEnabled: boolean;
  /** Telegram sticker set name (e.g. HotCherry or MyPack_by_botname). */
  stickerPackName: string;
  /** How often the model should include a sticker (0–100). */
  stickerReplyChance: number;
  /** Minutes of inactivity until mood returns to the active personality's defaults. */
  moodCooldownMinutes: number;
  /** Request model reasoning when the backend supports it. */
  thinkingEnabled: boolean;
  /** Level of reasoning effort for models that support it (none, low, medium, high). */
  reasoningEffort: "none" | "low" | "medium" | "high";
  /** When on, only the owner can trigger LLM-backed bot behavior. */
  maintenanceModeEnabled: boolean;
  /** Enabled modular workflow steps. */
  workflowSteps: string[];
  workflowNodes: { id: string; x: number; y: number }[];
  workflowEdges: { id: string; source: string; target: string }[];
}

export interface Stats {
  messagesReceived: number;
  messagesReplied: number;
  visionRequests: number;
  errors: number;
  lastActivityAt: string | null;
}

const DEFAULT_SETTINGS: Settings = {
  model: "gpt-4o-mini",
  activePersonalityId: 0,
  numPredict: 512,
  numCtx: 4096,
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  repeatPenalty: 1.1,
  chatTimeoutSec: 120,
  visionMaxDimension: 768,
  ownerUsername: "",
  ownerUserId: "",
  stickersEnabled: false,
  stickerPackName: "",
  stickerReplyChance: 70,
  moodCooldownMinutes: 120,
  thinkingEnabled: false,
  reasoningEffort: "medium",
  maintenanceModeEnabled: false,
  workflowSteps: ["mood", "links", "search", "sticker"],
  workflowNodes: [],
  workflowEdges: [],
};

let db: DatabaseSync;

export async function initDatabase(): Promise<void> {
  const dir = path.dirname(config.databasePath);
  fs.mkdirSync(dir, { recursive: true });

  db = new DatabaseSync(config.databasePath);
  db.exec("PRAGMA journal_mode = WAL");

  db.exec(`
    DROP TABLE IF EXISTS message_refs;
    DROP TABLE IF EXISTS group_activity;

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stats (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS stats_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  const existsSetting = db.prepare(
    "SELECT 1 FROM settings WHERE key = ?",
  );
  const insertSetting = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?)",
  );

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!existsSetting.get(key)) {
      insertSetting.run(key, JSON.stringify(value));
    }
  }

  const existsStat = db.prepare("SELECT 1 FROM stats WHERE key = ?");
  const insertStat = db.prepare("INSERT INTO stats (key, value) VALUES (?, 0)");

  for (const key of [
    "messagesReceived",
    "messagesReplied",
    "visionRequests",
    "errors",
  ]) {
    if (!existsStat.get(key)) {
      insertStat.run(key);
    }
  }

  await initModuleDatabases(db);
  configureModuleDatabases(buildModuleDbHost());

  bindErrorLogDatabase(db);
  bindDebugTracesDatabase(db);
  bindKnownUsersDatabase(db);
  bindDataBrowserDatabase(db);
}

function getSetting<T>(key: keyof Settings): T {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  if (!row) return DEFAULT_SETTINGS[key] as T;
  return JSON.parse(row.value) as T;
}

function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, JSON.stringify(value));
}

export function getSettings(): Settings {
  return {
    model: getSetting<string>("model"),
    activePersonalityId: getSetting<number>("activePersonalityId"),
    numPredict: getSetting<number>("numPredict"),
    numCtx: getSetting<number>("numCtx"),
    temperature: getSetting<number>("temperature"),
    topP: getSetting<number>("topP"),
    topK: getSetting<number>("topK"),
    repeatPenalty: getSetting<number>("repeatPenalty"),
    chatTimeoutSec: getSetting<number>("chatTimeoutSec"),
    visionMaxDimension: getSetting<number>("visionMaxDimension"),
    ownerUsername: getSetting<string>("ownerUsername"),
    ownerUserId: getSetting<string>("ownerUserId"),
    stickersEnabled: getSetting<boolean>("stickersEnabled"),
    stickerPackName: getSetting<string>("stickerPackName"),
    stickerReplyChance: getSetting<number>("stickerReplyChance"),
    moodCooldownMinutes: getSetting<number>("moodCooldownMinutes"),
    thinkingEnabled: getSetting<boolean>("thinkingEnabled"),
    reasoningEffort: getSetting<Settings["reasoningEffort"]>("reasoningEffort"),
    maintenanceModeEnabled: getSetting<boolean>("maintenanceModeEnabled"),
    workflowSteps: getSetting<string[]>("workflowSteps"),
    workflowNodes: getSetting<{ id: string; x: number; y: number }[]>("workflowNodes"),
    workflowEdges: getSetting<{ id: string; source: string; target: string }[]>("workflowEdges"),
  };
}

export function updateSettings(partial: Partial<Settings>): Settings {
  const current = getSettings();
  const { numCtx: _ignoredCtx, ...rest } = partial;
  const next = { ...current, ...rest };
  if (partial.ownerUsername !== undefined) {
    const raw = partial.ownerUsername.trim();
    next.ownerUsername =
      raw === "" ? "" : raw.replace(/^@/, "").toLowerCase();
  }
  if (partial.ownerUserId !== undefined) {
    next.ownerUserId = partial.ownerUserId.trim();
  }
  if (partial.stickerPackName !== undefined) {
    next.stickerPackName = partial.stickerPackName.trim().replace(/^@/, "");
  }
  if (partial.topK !== undefined) {
    next.topK = Math.round(partial.topK);
  }
  if (partial.model !== undefined) {
    invalidateModelContextCache();
  }

  const normalized = normalizeTokenBudget(next);
  const resolved = getResolvedSettings(normalized);
  validateSettingsFields(resolved);

  if (resolved.activePersonalityId > 0 && !getPersonalityById(resolved.activePersonalityId)) {
    throw new Error("activePersonalityId does not match a saved personality");
  }

  for (const key of Object.keys(resolved) as (keyof Settings)[]) {
    setSetting(key, resolved[key]);
  }

  void refreshModelContextCache(resolved.model, config.llmBaseUrl);
  void import("../dashboard/live-events.js").then(({ emitDataUpdated, emitMoodUpdated, emitSettingsUpdated }) => {
    void emitSettingsUpdated();
    emitMoodUpdated();
    emitDataUpdated(["settings"]);
  });

  const maintenanceToggled =
    partial.maintenanceModeEnabled !== undefined &&
    partial.maintenanceModeEnabled !== current.maintenanceModeEnabled;
  if (maintenanceToggled) {
    void import("../bot/maintenance/announce.js").then(
      ({ broadcastMaintenanceAnnouncement }) => {
        void broadcastMaintenanceAnnouncement(resolved.maintenanceModeEnabled);
      },
    );
  }

  return resolved;
}

function incrementStat(key: keyof Stats): void {
  if (key === "lastActivityAt") return;
  db.prepare("UPDATE stats SET value = value + 1 WHERE key = ?").run(key);
}

export function getStats(): Stats {
  const rows = db.prepare("SELECT key, value FROM stats").all() as {
    key: string;
    value: number;
  }[];
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const lastRow = db
    .prepare("SELECT value FROM stats_meta WHERE key = 'lastActivityAt'")
    .get() as { value: string } | undefined;

  return {
    messagesReceived: map.messagesReceived ?? 0,
    messagesReplied: map.messagesReplied ?? 0,
    visionRequests: map.visionRequests ?? 0,
    errors: map.errors ?? 0,
    lastActivityAt: lastRow?.value ?? null,
  };
}

function notifyStatsChanged(): void {
  void import("../dashboard/live-events.js").then(({ emitDataUpdated, emitStatsUpdated }) => {
    emitStatsUpdated();
    emitDataUpdated(["stats", "stats_meta"]);
  });
}

export function recordMessageReceived(): void {
  incrementStat("messagesReceived");
  touchActivity();
  notifyStatsChanged();
}

export function recordReply(usedVision: boolean): void {
  incrementStat("messagesReplied");
  if (usedVision) incrementStat("visionRequests");
  touchActivity();
  notifyStatsChanged();
}

export interface ErrorLogInput {
  message: string;
  stack?: string;
  chatId?: number;
  userId?: string;
}

export function recordError(detail?: ErrorLogInput): void {
  incrementStat("errors");
  touchActivity();
  if (detail) {
    appendErrorLog(detail);
  }
  void import("../dashboard/live-events.js").then(({ emitDataUpdated, emitStatsUpdated }) => {
    emitStatsUpdated();
    emitDataUpdated(["stats", "error_log"]);
  });
}

export function clearErrors(): number {
  const deleted = clearErrorLog();
  db.prepare("UPDATE stats SET value = 0 WHERE key = 'errors'").run();
  void import("../dashboard/live-events.js").then(({ emitDataUpdated, emitStatsUpdated }) => {
    emitStatsUpdated();
    emitDataUpdated(["stats", "error_log"]);
  });
  return deleted;
}

function touchActivity(): void {
  db.prepare(
    "INSERT INTO stats_meta (key, value) VALUES ('lastActivityAt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(new Date().toISOString());
}
