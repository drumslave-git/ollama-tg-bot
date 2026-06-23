import type { Settings } from "../db/index.js";

export const MIN_NUM_PREDICT = 32;
/**
 * Minimum generation budget for auxiliary side passes (address, search, mood,
 * memory, …). Reasoning-capable backends spend tokens on hidden chain-of-thought
 * before emitting the structured block, so this floor must leave room for both;
 * too low a budget makes those passes return empty content and silently fail.
 */
export const AUXILIARY_NUM_PREDICT = 768;
/** Higher auxiliary floor when thinking is on — reasoning tokens precede structured JSON. */
export const AUXILIARY_REASONING_NUM_PREDICT = 1024;
/** Extra headroom for maintenance announcements when thinking is on. */
export const MAINTENANCE_ANNOUNCE_REASONING_NUM_PREDICT = 1536;
/** Generation budget for MCP tool-selection rounds when thinking is off (tool_calls only). */
export const TOOL_ROUND_NUM_PREDICT = 1024;
/** Generation budget for MCP tool-selection rounds when thinking is on (reasoning precedes tool_calls). */
export const TOOL_ROUND_REASONING_NUM_PREDICT = 2048;

/** Tool-selection round generation budget, derived from whether thinking is enabled. */
export function getToolRoundNumPredict(settings: Settings): number {
  return settings.thinkingEnabled
    ? TOOL_ROUND_REASONING_NUM_PREDICT
    : TOOL_ROUND_NUM_PREDICT;
}
/** Hard cap on generated tokens; also limited by context size minus prompt headroom. */
export const MAX_NUM_PREDICT = 8192;
export const NUM_CTX_GENERATION_HEADROOM = 512;
export const MIN_NUM_CTX = 2048;
/** Upper bound for derived context window (256k VRAM tier). */
export const ABSOLUTE_MAX_NUM_CTX = 262144;
export const MAX_NUM_CTX = ABSOLUTE_MAX_NUM_CTX;
export const NUM_CTX_STEP = 512;
export const NUM_PREDICT_STEP = 32;
export const APPROX_CHARS_PER_TOKEN = 3.5;

export interface HistoryLimits {
  historyMaxReplyChars: number;
  numPredict: number;
}

export function snapNumPredict(value: number): number {
  const snapped = Math.round(value / NUM_PREDICT_STEP) * NUM_PREDICT_STEP;
  return Math.min(MAX_NUM_PREDICT, Math.max(MIN_NUM_PREDICT, snapped));
}

/** Largest generated-token budget allowed for a given context window. */
export function snapNumCtx(value: number): number {
  const snapped = Math.round(value / NUM_CTX_STEP) * NUM_CTX_STEP;
  return Math.min(MAX_NUM_CTX, Math.max(MIN_NUM_CTX, snapped));
}

export function maxNumPredictForContext(numCtx: number): number {
  return Math.min(
    MAX_NUM_PREDICT,
    Math.max(
      MIN_NUM_PREDICT,
      snapNumPredict(numCtx - NUM_CTX_GENERATION_HEADROOM),
    ),
  );
}

export function minNumCtxForPredict(numPredict: number): number {
  return snapNumCtx(snapNumPredict(numPredict) + NUM_CTX_GENERATION_HEADROOM);
}

/** max_output_tokens for a request (total generation budget). */
export function getEffectiveNumPredict(
  settings: Settings,
  options?: { baseNumPredict?: number },
): number {
  return snapNumPredict(options?.baseNumPredict ?? settings.numPredict);
}

/** Generation budget for auxiliary LLM side passes (never below the thinking-aware floor). */
export function getAuxiliaryNumPredict(
  settings: Settings,
  baseNumPredict?: number,
): number {
  const floor = settings.thinkingEnabled
    ? AUXILIARY_REASONING_NUM_PREDICT
    : AUXILIARY_NUM_PREDICT;
  return Math.max(
    floor,
    getEffectiveNumPredict(settings, { baseNumPredict }),
  );
}

/** Generation budget for maintenance-mode toggle announcements. */
export function getMaintenanceAnnounceNumPredict(settings: Settings): number {
  const auxiliary = getAuxiliaryNumPredict(settings);
  if (!settings.thinkingEnabled) return auxiliary;
  return Math.max(auxiliary, MAINTENANCE_ANNOUNCE_REASONING_NUM_PREDICT);
}

/** Normalize token budget fields after settings changes. */
export function normalizeTokenBudget(settings: Settings): Settings {
  const numPredict = snapNumPredict(settings.numPredict);
  return { ...settings, numPredict };
}

export interface ReplyLengthGuidance {
  maxTokens: number;
  maxChars: number;
  systemHint: string;
  formatHint: string;
}

/** Reply brevity instructions derived from reply token budget. */
export function getReplyLengthGuidance(settings: Settings): ReplyLengthGuidance {
  const maxTokens = settings.numPredict;
  const { historyMaxReplyChars } = getHistoryLimits(settings);
  const maxChars = historyMaxReplyChars;

  const systemHint =
    `Your output budget (~${maxTokens} tokens, about ${maxChars} characters) is a maximum — ` +
    `you are NOT required to use it. Reply as short as the context warrants: a word, a line, ` +
    `or a terse reaction is fine when enough. Never pad or elaborate just to fill the budget.`;

  const formatHint =
    `Maximum ~${maxChars} characters (~${maxTokens} tokens) — use only what you need; shorter is fine. ` +
    `Plain text is the default. You may use Telegram HTML (<b> <i> <code> only) for occasional emphasis when it helps — you do not have to use tags at all.`;

  return { maxTokens, maxChars, systemHint, formatHint };
}

/** Derive reply-length guidance from the generation token budget. */
export function getHistoryLimits(settings: Settings): HistoryLimits {
  const normalized = normalizeTokenBudget(settings);

  return {
    historyMaxReplyChars: Math.min(
      4000,
      Math.max(100, Math.floor(normalized.numPredict * APPROX_CHARS_PER_TOKEN)),
    ),
    numPredict: normalized.numPredict,
  };
}

/** Low temperature for structured side passes (mood, memory, search, etc.). */
export const AUXILIARY_TEMPERATURE = 0.2;

export function getChatTimeoutMs(settings: Settings): number {
  return settings.chatTimeoutSec * 1000;
}

/** Provider-specific request extensions for OpenAI-compatible backends. */
export { providerRequestExtensions as getProviderExtensions } from "../llm/openai-compat.js";

export function validateSettingsFields(settings: Settings): void {
  const normalized = normalizeTokenBudget(settings);
  const isFiniteNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);
  const isBoolean = (value: unknown): value is boolean =>
    typeof value === "boolean";
  const isString = (value: unknown): value is string =>
    typeof value === "string";

  const checks: [string, boolean][] = [
    ["model must be a string", isString(settings.model)],
    ["stickersEnabled must be true or false", isBoolean(settings.stickersEnabled)],
    ["thinkingEnabled must be true or false", isBoolean(settings.thinkingEnabled)],
    ["maintenanceModeEnabled must be true or false", isBoolean(settings.maintenanceModeEnabled)],
    [
      "workflowSteps must be an array of step ids",
      Array.isArray(settings.workflowSteps) &&
        settings.workflowSteps.every((s) => typeof s === "string"),
    ],
    [
      "workflowNodes must be an array of node coordinates",
      Array.isArray(settings.workflowNodes) &&
        settings.workflowNodes.every(
          (n) =>
            n &&
            typeof n.id === "string" &&
            typeof n.x === "number" &&
            typeof n.y === "number"
        ),
    ],
    [
      "workflowEdges must be an array of edge connections",
      Array.isArray(settings.workflowEdges) &&
        settings.workflowEdges.every(
          (e) =>
            e &&
            typeof e.id === "string" &&
            typeof e.source === "string" &&
            typeof e.target === "string"
        ),
    ],
    ["ownerUsername must be a string", isString(settings.ownerUsername)],
    ["ownerUserId must be a string", isString(settings.ownerUserId)],
    ["stickerPackName must be a string", isString(settings.stickerPackName)],
    ["numPredict must be a number", isFiniteNumber(settings.numPredict)],
    ["numCtx must be a number", isFiniteNumber(settings.numCtx)],
    ["temperature must be a number", isFiniteNumber(settings.temperature)],
    ["topP must be a number", isFiniteNumber(settings.topP)],
    ["topK must be a number", isFiniteNumber(settings.topK)],
    ["repeatPenalty must be a number", isFiniteNumber(settings.repeatPenalty)],
    ["chatTimeoutSec must be a number", isFiniteNumber(settings.chatTimeoutSec)],
    ["visionMaxDimension must be a number", isFiniteNumber(settings.visionMaxDimension)],
    ["stickerReplyChance must be a number", isFiniteNumber(settings.stickerReplyChance)],
    ["activePersonalityId must be a number", isFiniteNumber(settings.activePersonalityId)],
    ["moodCooldownMinutes must be a number", isFiniteNumber(settings.moodCooldownMinutes)],
    [
      "reasoningEffort must be none, low, medium, or high",
      (["none", "low", "medium", "high"] as const).includes(
        settings.reasoningEffort,
      ),
    ],
    [
      `numPredict must be ${MIN_NUM_PREDICT}–${maxNumPredictForContext(settings.numCtx)} (context headroom)`,
      isFiniteNumber(normalized.numPredict) &&
        normalized.numPredict >= MIN_NUM_PREDICT &&
        normalized.numPredict <= maxNumPredictForContext(settings.numCtx),
    ],
    [
      `numCtx must be ${MIN_NUM_CTX}–${MAX_NUM_CTX} (derived from VRAM and model)`,
      isFiniteNumber(settings.numCtx) &&
        settings.numCtx >= MIN_NUM_CTX &&
        settings.numCtx <= MAX_NUM_CTX,
    ],
    [
      `numCtx must be at least ${minNumCtxForPredict(normalized.numPredict)} for the generation budget (${normalized.numPredict} tokens + ${NUM_CTX_GENERATION_HEADROOM} prompt headroom)`,
      isFiniteNumber(settings.numCtx) &&
        settings.numCtx >= minNumCtxForPredict(normalized.numPredict),
    ],
    ["temperature must be 0–2", isFiniteNumber(settings.temperature) && settings.temperature >= 0 && settings.temperature <= 2],
    ["topP must be 0.05–1", isFiniteNumber(settings.topP) && settings.topP >= 0.05 && settings.topP <= 1],
    [
      "topK must be 1–200",
      Number.isInteger(settings.topK) &&
        settings.topK >= 1 &&
        settings.topK <= 200,
    ],
    [
      "repeatPenalty must be 0.8–2",
      isFiniteNumber(settings.repeatPenalty) &&
        settings.repeatPenalty >= 0.8 &&
        settings.repeatPenalty <= 2,
    ],
    [
      "chatTimeoutSec must be 30–600",
      isFiniteNumber(settings.chatTimeoutSec) &&
        settings.chatTimeoutSec >= 30 &&
        settings.chatTimeoutSec <= 600,
    ],
    [
      "visionMaxDimension must be 256–2048",
      isFiniteNumber(settings.visionMaxDimension) &&
        settings.visionMaxDimension >= 256 &&
        settings.visionMaxDimension <= 2048,
    ],
    [
      "ownerUsername must be empty or a valid Telegram username",
      isString(settings.ownerUsername) &&
        (settings.ownerUsername.trim() === "" ||
          /^[a-z0-9_]{5,32}$/i.test(settings.ownerUsername.trim())),
    ],
    [
      "ownerUserId must be empty or a numeric Telegram user id",
      isString(settings.ownerUserId) &&
        (settings.ownerUserId.trim() === "" ||
          /^\d{1,20}$/.test(settings.ownerUserId.trim())),
    ],
    [
      "ownerUserId is required when ownerUsername is set",
      isString(settings.ownerUsername) &&
        isString(settings.ownerUserId) &&
        (settings.ownerUsername.trim() === "" ||
          settings.ownerUserId.trim() !== ""),
    ],
    [
      "stickerPackName must be empty or a valid sticker set name",
      isString(settings.stickerPackName) &&
        (settings.stickerPackName.trim() === "" ||
          /^[a-zA-Z0-9_]{1,64}$/.test(settings.stickerPackName.trim())),
    ],
    [
      "stickerPackName is required when stickers are enabled",
      isBoolean(settings.stickersEnabled) &&
        isString(settings.stickerPackName) &&
        (!settings.stickersEnabled || settings.stickerPackName.trim() !== ""),
    ],
    [
      "stickerReplyChance must be 0–100",
      isFiniteNumber(settings.stickerReplyChance) &&
        settings.stickerReplyChance >= 0 &&
        settings.stickerReplyChance <= 100,
    ],
    [
      "activePersonalityId must be a non-negative integer",
      Number.isInteger(settings.activePersonalityId) &&
        settings.activePersonalityId >= 0,
    ],
    [
      "moodCooldownMinutes must be 5–1440",
      isFiniteNumber(settings.moodCooldownMinutes) &&
        settings.moodCooldownMinutes >= 5 &&
        settings.moodCooldownMinutes <= 1440,
    ],
  ];

  const failed = checks.find(([, ok]) => !ok);
  if (failed) throw new Error(failed[0]);
}
