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

/** Context tiers derived from configured VRAM. */
const VRAM_TIER_4K = 4096;
const VRAM_TIER_32K = 32768;
const VRAM_TIER_256K = ABSOLUTE_MAX_NUM_CTX;

export interface ModelContextInput {
  name: string;
  sizeBytes?: number;
  parameterSize?: string;
  /** Native context length from the model definition, if known. */
  modelMaxCtx?: number;
}

export interface ModelCatalogEntry {
  name?: string;
  size?: number;
  details?: { parameter_size?: string };
  parameterSize?: string;
  modelMaxCtx?: number;
}

export type ContextBudgetLimiter =
  | "vram_tier"
  | "kv_headroom"
  | "model_max"
  | "generation_floor"
  | "min_floor";

export interface ContextBudget {
  effectiveNumCtx: number;
  vramGb: number;
  modelName: string;
  modelWeightGb: number | null;
  modelMaxCtx: number | null;
  vramTierCtx: number;
  limitedBy: ContextBudgetLimiter;
  notes: string[];
}

export function vramTierContextTokens(vramGb: number): number {
  if (vramGb < 24) return VRAM_TIER_4K;
  if (vramGb < 48) return VRAM_TIER_32K;
  return VRAM_TIER_256K;
}

export function parseParameterSizeGb(parameterSize?: string): number | null {
  if (!parameterSize?.trim()) return null;
  const match = parameterSize.trim().match(/^([\d.]+)\s*([bmk])?b?$/i);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  const unit = (match[2] ?? "b").toLowerCase();
  const billions =
    unit === "m" ? value / 1_000 : unit === "k" ? value / 1_000_000 : value;

  /** Rough Q4 weight estimate: ~0.65 GB per billion parameters. */
  return billions * 0.65;
}

/** Infer param size from common model name patterns (e.g. `…-9b-…`, `…-e2b-…`, `:3b`). */
export function parseParameterSizeFromName(modelName: string): string | null {
  const candidates = [
    modelName,
    modelName.split(":")[0] ?? modelName,
  ];

  for (const name of candidates) {
    const effective = name.match(
      /(?:^|[-:_.])[eE](\d+(?:\.\d+)?)[bB](?:$|[-:_.])/,
    );
    if (effective) return `${effective[1]}B`;

    const standard = name.match(
      /(?:^|[-:_.])(\d+(?:\.\d+)?)\s*([bmk])?b(?:$|[-:_.])/i,
    );
    if (standard) {
      const unit = (standard[2] ?? "b").toUpperCase();
      return `${standard[1]}${unit}`;
    }
  }

  return null;
}

export function estimateModelWeightGb(model: ModelContextInput): number | null {
  if (model.sizeBytes != null && model.sizeBytes > 0) {
    return model.sizeBytes / 1024 ** 3;
  }
  const fromMetadata = parseParameterSizeGb(model.parameterSize);
  if (fromMetadata != null) return fromMetadata;
  return parseParameterSizeGb(parseParameterSizeFromName(model.name) ?? undefined);
}

function contextFromKvHeadroom(vramGb: number, weightGb: number): number {
  const headroomGb = Math.max(0, vramGb * 0.9 - weightGb);
  if (headroomGb < 0.5) return VRAM_TIER_4K;

  const kvGbPer8k = Math.max(0.12, (weightGb / 7) * 0.5);
  const estimated = Math.floor((headroomGb / kvGbPer8k) * 8192);
  return snapNumCtx(Math.min(ABSOLUTE_MAX_NUM_CTX, estimated));
}

export function modelContextInputFromTags(
  modelName: string,
  entry?: ModelCatalogEntry | null,
): ModelContextInput {
  return {
    name: modelName,
    sizeBytes: entry?.size,
    parameterSize: entry?.details?.parameter_size ?? entry?.parameterSize,
    modelMaxCtx: entry?.modelMaxCtx,
  };
}

export function extractModelMaxCtx(modelInfo: Record<string, unknown>): number | null {
  let max: number | null = null;
  for (const [key, value] of Object.entries(modelInfo)) {
    if (!/\.context_length$/i.test(key)) continue;
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(n) && n > 0) {
      max = max == null ? n : Math.max(max, n);
    }
  }
  return max;
}

export function calculateContextBudget(
  vramGb: number,
  model: ModelContextInput,
  minRequiredCtx = MIN_NUM_CTX,
): ContextBudget {
  const notes: string[] = [];
  const vramTierCtx = vramTierContextTokens(vramGb);
  let target = vramTierCtx;
  let limitedBy: ContextBudgetLimiter = "vram_tier";
  notes.push(
    `VRAM tier (${vramGb} GB): baseline ${vramTierCtx.toLocaleString()} tokens.`,
  );

  const weightGb = estimateModelWeightGb(model);
  if (weightGb != null) {
    const kvCtx = contextFromKvHeadroom(vramGb, weightGb);
    if (kvCtx < target) {
      target = kvCtx;
      limitedBy = "kv_headroom";
      notes.push(
        `Model weights ~${weightGb.toFixed(1)} GB — KV headroom caps context at ${kvCtx.toLocaleString()} tokens.`,
      );
    } else {
      notes.push(`Model weights ~${weightGb.toFixed(1)} GB — tier baseline fits in VRAM.`);
    }
  } else {
    notes.push("Model size unknown — using VRAM tier baseline only.");
  }

  const modelMaxCtx = model.modelMaxCtx ?? null;
  if (modelMaxCtx != null) {
    const capped = snapNumCtx(Math.min(target, modelMaxCtx));
    if (capped < target) {
      target = capped;
      limitedBy = "model_max";
    }
    notes.push(`Model native maximum: ${modelMaxCtx.toLocaleString()} tokens.`);
  }

  const minFloor = snapNumCtx(Math.max(MIN_NUM_CTX, minRequiredCtx));
  if (target < minFloor) {
    target = minFloor;
    limitedBy =
      minRequiredCtx > MIN_NUM_CTX ? "generation_floor" : "min_floor";
    notes.push(
      `Raised to ${target.toLocaleString()} to fit generation budget (${minRequiredCtx} tokens incl. ${NUM_CTX_GENERATION_HEADROOM} headroom).`,
    );
  }

  target = snapNumCtx(Math.min(ABSOLUTE_MAX_NUM_CTX, target));

  return {
    effectiveNumCtx: target,
    vramGb,
    modelName: model.name,
    modelWeightGb: weightGb,
    modelMaxCtx,
    vramTierCtx,
    limitedBy,
    notes,
  };
}

export function minRequiredCtxForPredict(numPredict: number): number {
  return snapNumCtx(snapNumPredict(numPredict) + NUM_CTX_GENERATION_HEADROOM);
}
