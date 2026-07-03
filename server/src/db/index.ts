import { db, initPool } from "./pool.js";
import {
  appendErrorLog,
  bindErrorLogDatabase,
  clearErrorLog,
} from "./debug/error-log.js";
import { bindMessageProcessingDatabase } from "./debug/message-processing.js";
import { bindJobProcessingDatabase } from "./debug/job-processing.js";
import { bindPhaseTimingsDatabase } from "./debug/phase-timings.js";
import { bindLlmUsageDatabase } from "./debug/llm-usage.js";
import { bindKnownUsersDatabase } from "./users/known-users.js";
import { bindDataBrowserDatabase } from "./data/browser.js";
import { getPersonalityById } from "../features/mood/db/index.js";
import {
  normalizeTokenBudget,
  validateSettingsFields,
} from "../settings/limits.js";
import {
  configureFeatureDatabases,
  initFeatureDatabases,
} from "../runtime/features.js";
import { buildFeatureDbHost } from "../runtime/feature-db-host.js";

export interface Settings {
  model: string;
  /** Model used for embeddings (history summaries RAG), e.g. bge-m3. */
  embeddingModel: string;
  /** Model used for image generation (empty = image generation off), e.g. gpt-image-1. */
  imageModel: string;
  /** Id of the personality whose prompt is layered on the base system prompt (0 = none). */
  activePersonalityId: number;
  /** Max tokens LLM may generate per reply (lower = faster). */
  numPredict: number;
  /** Context window size sent to LLM. */
  numCtx: number;
  temperature: number;
  /** Nucleus sampling — lower = more focused (LLM top_p). */
  topP: number;
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
  /** OpenAI-standard reasoning effort for models that support it (only sent when thinking is on). */
  reasoningEffort: "low" | "medium" | "high";
  /** When on, only the owner can trigger LLM-backed bot behavior. */
  maintenanceModeEnabled: boolean;
  /** Enabled workflow steps. */
  workflowSteps: string[];
}

export interface Stats {
  messagesReceived: number;
  messagesReplied: number;
  visionRequests: number;
  errors: number;
  /** Lifetime count of LLM chat calls that reported token usage. */
  llmCalls: number;
  /** Lifetime prompt (input) tokens across all LLM calls. */
  llmPromptTokens: number;
  /** Lifetime completion (output) tokens across all LLM calls. */
  llmCompletionTokens: number;
  /** Lifetime total tokens across all LLM calls. */
  llmTotalTokens: number;
  lastActivityAt: string | null;
}

const DEFAULT_SETTINGS: Settings = {
  model: "gpt-4o-mini",
  embeddingModel: "",
  imageModel: "",
  activePersonalityId: 0,
  numPredict: 512,
  numCtx: 4096,
  temperature: 0.7,
  topP: 0.9,
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
    "llmCalls",
    "llmPromptTokens",
    "llmCompletionTokens",
    "llmTotalTokens",
  ]) {
    await db.query(
      "INSERT INTO stats (key, value) VALUES ($1, 0) ON CONFLICT (key) DO NOTHING",
      [key],
    );
  }

  await initFeatureDatabases(db);
  configureFeatureDatabases(buildFeatureDbHost());

  await bindErrorLogDatabase(db);
  await bindKnownUsersDatabase(db);
  // After chat_messages (feature dbs) and known_users — message_processings has a
  // FK to chat_messages and its labels read known_users.
  await bindMessageProcessingDatabase(db);
  // Background-job run history (memory/vision backfill); no owner FK, capped per feature.
  await bindJobProcessingDatabase(db);
  // Per-phase latency samples for the dashboard's latency panel.
  await bindPhaseTimingsDatabase(db);
  // Per-call LLM token usage + lifetime token counters.
  await bindLlmUsageDatabase(db);
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

/**
 * Map any stored reasoning-effort value to the OpenAI-standard set. Legacy DBs
 * may hold the dropped Ollama values `"none"`/`"max"`; map them to the nearest
 * valid level so old settings load without failing validation.
 */
function normalizeReasoningEffort(value: string): Settings["reasoningEffort"] {
  switch (value) {
    case "none":
      return "low";
    case "max":
      return "high";
    case "low":
    case "medium":
    case "high":
      return value;
    default:
      return DEFAULT_SETTINGS.reasoningEffort;
  }
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
    imageModel: read<string>("imageModel"),
    activePersonalityId: read<number>("activePersonalityId"),
    numPredict: read<number>("numPredict"),
    numCtx: read<number>("numCtx"),
    temperature: read<number>("temperature"),
    topP: read<number>("topP"),
    chatTimeoutSec: read<number>("chatTimeoutSec"),
    visionMaxDimension: read<number>("visionMaxDimension"),
    ownerUsername: read<string>("ownerUsername"),
    ownerUserId: read<string>("ownerUserId"),
    stickerPackName: read<string>("stickerPackName"),
    stickerReplyChance: read<number>("stickerReplyChance"),
    moodCooldownMinutes: read<number>("moodCooldownMinutes"),
    thinkingEnabled: read<boolean>("thinkingEnabled"),
    reasoningEffort: normalizeReasoningEffort(
      read<string>("reasoningEffort"),
    ),
    maintenanceModeEnabled: read<boolean>("maintenanceModeEnabled"),
    workflowSteps: read<string[]>("workflowSteps"),
  };
}

export async function updateSettings(
  partial: Partial<Settings>,
): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...partial };
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

  // Store the manually-configured numCtx as-is (clamped to absolute bounds).
  const normalized = normalizeTokenBudget(next);
  validateSettingsFields(normalized);

  if (
    normalized.activePersonalityId > 0 &&
    !(await getPersonalityById(normalized.activePersonalityId))
  ) {
    throw new Error("activePersonalityId does not match a saved personality");
  }

  for (const key of Object.keys(normalized) as (keyof Settings)[]) {
    await setSetting(key, normalized[key]);
  }

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
        void broadcastMaintenanceAnnouncement(normalized.maintenanceModeEnabled);
      },
    );
  }

  return normalized;
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
    llmCalls: Number(map.llmCalls ?? 0),
    llmPromptTokens: Number(map.llmPromptTokens ?? 0),
    llmCompletionTokens: Number(map.llmCompletionTokens ?? 0),
    llmTotalTokens: Number(map.llmTotalTokens ?? 0),
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
