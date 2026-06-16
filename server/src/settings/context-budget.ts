import type { Settings } from "../db/database.js";
import { getVramAvailableGb } from "../config/index.js";
import {
  calculateContextBudget,
  estimateModelWeightGb,
  extractModelMaxCtx,
  minRequiredCtxForPredict,
  modelContextInputFromTags,
  parseParameterSizeFromName,
  parseParameterSizeGb,
  vramTierContextTokens,
  type ContextBudget,
  type ContextBudgetLimiter,
  type ModelContextInput,
} from "@llm-tg-bot/modules-utils";

export {
  calculateContextBudget,
  estimateModelWeightGb,
  extractModelMaxCtx,
  minRequiredCtxForPredict,
  modelContextInputFromTags,
  parseParameterSizeFromName,
  parseParameterSizeGb,
  vramTierContextTokens,
  type ContextBudget,
  type ContextBudgetLimiter,
  type ModelContextInput,
};

export function getEffectiveNumCtx(
  settings: Settings,
  model: ModelContextInput,
): number {
  const minCtx = minRequiredCtxForPredict(settings.numPredict);
  return calculateContextBudget(getVramAvailableGb(), model, minCtx)
    .effectiveNumCtx;
}

export function buildContextBudget(
  settings: Settings,
  model: ModelContextInput,
): ContextBudget {
  const minCtx = minRequiredCtxForPredict(settings.numPredict);
  return calculateContextBudget(getVramAvailableGb(), model, minCtx);
}
