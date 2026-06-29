import { getBot, getBotUsername } from "../bot/index.js";
import { config } from "../config/index.js";
import { getStats, getSettings } from "../db/index.js";
import { getPipelineRuntimeStatus } from "../runtime/pipeline-status.js";
import { listRecentErrors } from "../db/debug/error-log.js";
import {
  getActivePersonalityMoodDefaults,
  getMoodStateView,
  getPersonalityById,
  resolveActivePersonalityId,
} from "../features/mood/db/index.js";
import { ensureModelContextCache } from "../llm/model-context-cache.js";
import { MOOD_TRAIT_HINTS } from "../features/mood/index.js";
import { buildBaseSystemPrompt } from "../pipeline/adapters/system-prompt.js";
import { processStartedAt } from "../config/process-info.js";
import {
  getContextBudgetForSettings,
  getResolvedHistoryLimits,
  getResolvedSettings,
} from "../settings/runtime.js";

export async function buildStatsPayload() {
  const stats = await getStats();
  let botRunning = false;
  try {
    getBot();
    botRunning = true;
  } catch {
    botRunning = false;
  }

  return {
    ...stats,
    ...getPipelineRuntimeStatus(),
    botUsername: getBotUsername() || null,
    botRunning,
    uptimeSeconds: Math.floor(
      (Date.now() - processStartedAt.getTime()) / 1000,
    ),
    startedAt: processStartedAt.toISOString(),
    recentErrors: await listRecentErrors(20),
  };
}

export async function buildMoodPayload() {
  const settings = await getSettings();
  const activePersonalityId = await resolveActivePersonalityId(
    settings.activePersonalityId,
  );
  const activePersonality = activePersonalityId
    ? await getPersonalityById(activePersonalityId)
    : null;

  return {
    defaults: await getActivePersonalityMoodDefaults(),
    activePersonalityId,
    activePersonalityName: activePersonality?.name ?? null,
    cooldownMinutes: settings.moodCooldownMinutes,
    traitHints: MOOD_TRAIT_HINTS,
    current: await getMoodStateView(),
  };
}

export async function buildSettingsPayload() {
  const settings = await getSettings();
  await ensureModelContextCache(settings.model, config.llmBaseUrl);
  const resolved = getResolvedSettings(settings);
  return {
    ...resolved,
    // Show the manually-set numCtx, not the model-capped runtime value.
    numCtx: settings.numCtx,
    llmBaseUrl: config.llmBaseUrl,
    llmApiKeyConfigured: config.llmApiKey.length > 0,
    baseSystemPrompt: buildBaseSystemPrompt(resolved),
    derivedHistoryLimits: getResolvedHistoryLimits(settings),
    contextBudget: getContextBudgetForSettings(settings),
  };
}
