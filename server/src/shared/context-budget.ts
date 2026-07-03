const MIN_NUM_CTX = 2048;
const ABSOLUTE_MAX_NUM_CTX = 262144;
const NUM_CTX_STEP = 512;
const NUM_CTX_GENERATION_HEADROOM = 512;

function snapNumCtx(value: number): number {
  const snapped = Math.round(value / NUM_CTX_STEP) * NUM_CTX_STEP;
  return Math.min(ABSOLUTE_MAX_NUM_CTX, Math.max(MIN_NUM_CTX, snapped));
}

function snapNumPredict(value: number): number {
  const NUM_PREDICT_STEP = 32;
  const MIN_NUM_PREDICT = 32;
  const MAX_NUM_PREDICT = 8192;
  const snapped = Math.round(value / NUM_PREDICT_STEP) * NUM_PREDICT_STEP;
  return Math.min(MAX_NUM_PREDICT, Math.max(MIN_NUM_PREDICT, snapped));
}

export interface ModelContextInput {
  name: string;
  /** Native context length from the model definition, if known. */
  modelMaxCtx?: number;
}

export type ContextBudgetLimiter =
  | "manual"
  | "model_max"
  | "generation_floor"
  | "min_floor";

export interface ContextBudget {
  /** The context window actually used after capping the requested value. */
  effectiveNumCtx: number;
  /** What the user configured before capping. */
  requestedNumCtx: number;
  modelName: string;
  modelMaxCtx: number | null;
  limitedBy: ContextBudgetLimiter;
  notes: string[];
}

export function minRequiredCtxForPredict(numPredict: number): number {
  return snapNumCtx(snapNumPredict(numPredict) + NUM_CTX_GENERATION_HEADROOM);
}

/**
 * Resolve the effective context window from the manually-configured value. The
 * user sets numCtx directly; we only cap it to the model's native maximum (when
 * known) and raise it to the floor the generation budget needs. No VRAM or
 * model-weight estimation is involved.
 */
export function calculateContextBudget(
  requestedNumCtx: number,
  numPredict: number,
  model: ModelContextInput,
): ContextBudget {
  const notes: string[] = [];
  const modelMaxCtx = model.modelMaxCtx ?? null;
  const minFloor = minRequiredCtxForPredict(numPredict);
  const requested = snapNumCtx(requestedNumCtx);

  let target = requested;
  let limitedBy: ContextBudgetLimiter = "manual";

  if (modelMaxCtx != null && target > modelMaxCtx) {
    target = Math.min(target, modelMaxCtx);
    limitedBy = "model_max";
    notes.push(
      `Capped to the model's native maximum: ${modelMaxCtx.toLocaleString()} tokens.`,
    );
  } else if (modelMaxCtx != null) {
    notes.push(`Model native maximum: ${modelMaxCtx.toLocaleString()} tokens.`);
  }

  if (target < minFloor) {
    target = minFloor;
    limitedBy = minFloor > MIN_NUM_CTX ? "generation_floor" : "min_floor";
    notes.push(
      `Raised to ${target.toLocaleString()} to fit the generation budget ` +
        `(${snapNumPredict(numPredict)} tokens incl. ${NUM_CTX_GENERATION_HEADROOM} headroom).`,
    );
  }

  target = Math.min(ABSOLUTE_MAX_NUM_CTX, Math.max(MIN_NUM_CTX, target));

  return {
    effectiveNumCtx: target,
    requestedNumCtx: requested,
    modelName: model.name,
    modelMaxCtx,
    limitedBy,
    notes,
  };
}
