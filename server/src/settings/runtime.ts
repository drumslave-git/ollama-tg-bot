import type { Settings } from "../db/index.js";
import { config } from "../config/index.js";
import {
  buildContextBudget,
  getEffectiveNumCtx,
  type ContextBudget,
} from "./context-budget.js";
import { getModelContextForBudget } from "../llm/model-context-cache.js";
import {
  getHistoryLimits,
  normalizeTokenBudget,
  type HistoryLimits,
} from "./limits.js";

// These are pure transforms over a Settings object. Callers resolve `settings`
// once (await getSettings()) and pass it in, keeping these synchronous so they
// can run inside sync helpers (e.g. the LLM request body builders).
export function getResolvedSettings(settings: Settings): Settings {
  const normalized = normalizeTokenBudget(settings);
  const model = getModelContextForBudget(
    normalized.model,
    config.llmBaseUrl,
  );
  const numCtx = getEffectiveNumCtx(normalized, model);
  return { ...normalized, numCtx };
}

export function getResolvedHistoryLimits(settings: Settings): HistoryLimits {
  return getHistoryLimits(getResolvedSettings(settings));
}

export function getContextBudgetForSettings(settings: Settings): ContextBudget {
  const normalized = normalizeTokenBudget(settings);
  const model = getModelContextForBudget(
    normalized.model,
    config.llmBaseUrl,
  );
  return buildContextBudget(normalized, model);
}
