import type { Settings } from "../db/index.js";
import {
  calculateContextBudget,
  extractModelMaxCtx,
  minRequiredCtxForPredict,
  modelContextInputFromTags,
  type ContextBudget,
  type ContextBudgetLimiter,
  type ModelContextInput,
} from "../shared/index.js";

export {
  calculateContextBudget,
  extractModelMaxCtx,
  minRequiredCtxForPredict,
  modelContextInputFromTags,
  type ContextBudget,
  type ContextBudgetLimiter,
  type ModelContextInput,
};

/** Effective context window: the manually-set numCtx, capped to the model max. */
export function getEffectiveNumCtx(
  settings: Settings,
  model: ModelContextInput,
): number {
  return calculateContextBudget(settings.numCtx, settings.numPredict, model)
    .effectiveNumCtx;
}

export function buildContextBudget(
  settings: Settings,
  model: ModelContextInput,
): ContextBudget {
  return calculateContextBudget(settings.numCtx, settings.numPredict, model);
}
