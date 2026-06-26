import { config } from "../config/index.js";
import { db, initPool } from "./pool.js";
import {
  appendErrorLog,
  bindErrorLogDatabase,
  clearErrorLog,
} from "./debug/error-log.js";
import { bindMessageProcessingDatabase } from "./debug/message-processing.js";
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
  /** Model used for embeddings (history summaries RAG), e.g. bge-m3. */
  embeddingModel: string;
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
  /** Telegram sticker set name (empty = stickers off). */
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
  embeddingModel: "",
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

export async function initDatabase(): Promise<void> {
  await initPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS stats (
      key TEXT PRIMARY KEY,
      value BIGINT NOT NULL DEFAULT 0
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS stats_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.query(
      "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
      [key, JSON.stringify(value)],
    );
  }

  for (const key of [
    "messagesReceived",
    "messagesReplied",
    "visionRequests",
    "errors",
  ]) {
    await db.query(
      "INSERT INTO stats (key, value) VALUES ($1, 0) ON CONFLICT (key) DO NOTHING",
      [key],
    );
  }

  await initModuleDatabases(db);
  configureModuleDatabases(buildModuleDbHost());

  await bindErrorLogDatabase(db);
  await bindKnownUsersDatabase(db);
  // After chat_messages (module dbs) and known_users — message_processings has a
  // FK to chat_messages and its labels read known_users.
  await bindMessageProcessingDatabase(db);
  bindDataBrowserDatabase(db);
}

async function setSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): Promise<void> {
  await db.query(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    [key, JSON.stringify(value)],
  );
}

export async function getSettings(): Promise<Settings> {
  const { rows } = await db.query<{ key: string; value: string }>(
    "SELECT key, value FROM settings",
  );
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const read = <T>(key: keyof Settings): T => {
    const raw = stored.get(key);
    if (raw === undefined) return DEFAULT_SETTINGS[key] as unknown as T;
    return JSON.parse(raw) as T;
  };
  return {
    model: read<string>("model"),
    embeddingModel: read<string>("embeddingModel"),
    activePersonalityId: read<number>("activePersonalityId"),
    numPredict: read<number>("numPredict"),
    numCtx: read<number>("numCtx"),
    temperature: read<number>("temperature"),
    topP: read<number>("topP"),
    topK: read<number>("topK"),
    repeatPenalty: read<number>("repeatPenalty"),
    chatTimeoutSec: read<number>("chatTimeoutSec"),
    visionMaxDimension: read<number>("visionMaxDimension"),
    ownerUsername: read<string>("ownerUsername"),
    ownerUserId: read<string>("ownerUserId"),
    stickerPackName: read<string>("stickerPackName"),
    stickerReplyChance: read<number>("stickerReplyChance"),
    moodCooldownMinutes: read<number>("moodCooldownMinutes"),
    thinkingEnabled: read<boolean>("thinkingEnabled"),
    reasoningEffort: read<Settings["reasoningEffort"]>("reasoningEffort"),
    maintenanceModeEnabled: read<boolean>("maintenanceModeEnabled"),
    workflowSteps: read<string[]>("workflowSteps"),
    workflowNodes: read<{ id: string; x: number; y: number }[]>("workflowNodes"),
    workflowEdges:
      read<{ id: string; source: string; target: string }[]>("workflowEdges"),
  };
}

export async function updateSettings(
  partial: Partial<Settings>,
): Promise<Settings> {
  const current = await getSettings();
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

  if (
    resolved.activePersonalityId > 0 &&
    !(await getPersonalityById(resolved.activePersonalityId))
  ) {
    throw new Error("activePersonalityId does not match a saved personality");
  }

  for (const key of Object.keys(resolved) as (keyof Settings)[]) {
    await setSetting(key, resolved[key]);
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

async function incrementStat(key: keyof Stats): Promise<void> {
  if (key === "lastActivityAt") return;
  await db.query("UPDATE stats SET value = value + 1 WHERE key = $1", [key]);
}

export async function getStats(): Promise<Stats> {
  const { rows } = await db.query<{ key: string; value: number }>(
    "SELECT key, value FROM stats",
  );
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const { rows: metaRows } = await db.query<{ value: string }>(
    "SELECT value FROM stats_meta WHERE key = 'lastActivityAt'",
  );

  return {
    messagesReceived: map.messagesReceived ?? 0,
    messagesReplied: map.messagesReplied ?? 0,
    visionRequests: map.visionRequests ?? 0,
    errors: map.errors ?? 0,
    lastActivityAt: metaRows[0]?.value ?? null,
  };
}

function notifyStatsChanged(): void {
  void import("../dashboard/live-events.js").then(({ emitDataUpdated, emitStatsUpdated }) => {
    emitStatsUpdated();
    emitDataUpdated(["stats", "stats_meta"]);
  });
}

export async function recordMessageReceived(): Promise<void> {
  await incrementStat("messagesReceived");
  await touchActivity();
  notifyStatsChanged();
}

export async function recordReply(usedVision: boolean): Promise<void> {
  await incrementStat("messagesReplied");
  if (usedVision) await incrementStat("visionRequests");
  await touchActivity();
  notifyStatsChanged();
}

export interface ErrorLogInput {
  message: string;
  stack?: string;
  chatId?: number;
  userId?: string;
}

export async function recordError(detail?: ErrorLogInput): Promise<void> {
  await incrementStat("errors");
  await touchActivity();
  if (detail) {
    await appendErrorLog(detail);
  }
  void import("../dashboard/live-events.js").then(({ emitDataUpdated, emitStatsUpdated }) => {
    emitStatsUpdated();
    emitDataUpdated(["stats", "error_log"]);
  });
}

export async function clearErrors(): Promise<number> {
  const deleted = await clearErrorLog();
  await db.query("UPDATE stats SET value = 0 WHERE key = 'errors'");
  void import("../dashboard/live-events.js").then(({ emitDataUpdated, emitStatsUpdated }) => {
    emitStatsUpdated();
    emitDataUpdated(["stats", "error_log"]);
  });
  return deleted;
}

async function touchActivity(): Promise<void> {
  await db.query(
    "INSERT INTO stats_meta (key, value) VALUES ('lastActivityAt', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    [new Date().toISOString()],
  );
}
