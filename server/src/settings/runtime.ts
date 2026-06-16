import type { Settings } from "../db/index.js";
import { getSettings } from "../db/index.js";
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

export function getResolvedSettings(settings: Settings = getSettings()): Settings {
  const normalized = normalizeTokenBudget(settings);
  const model = getModelContextForBudget(
    normalized.model,
    normalized.apiBaseUrl,
  );
  const numCtx = getEffectiveNumCtx(normalized, model);
  return { ...normalized, numCtx };
}

export function getResolvedHistoryLimits(
  settings: Settings = getSettings(),
): HistoryLimits {
  return getHistoryLimits(getResolvedSettings(settings));
}

export function getContextBudgetForSettings(
  settings: Settings = getSettings(),
): ContextBudget {
  const normalized = normalizeTokenBudget(settings);
  const model = getModelContextForBudget(
    normalized.model,
    normalized.apiBaseUrl,
  );
  return buildContextBudget(normalized, model);
}
