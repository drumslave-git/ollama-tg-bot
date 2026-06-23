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

/** Fallback context tiers used only when the model size is unknown. */
const VRAM_TIER_4K = 4096;
const VRAM_TIER_32K = 32768;
const VRAM_TIER_256K = ABSOLUTE_MAX_NUM_CTX;

/** Fraction of VRAM usable after reserving room for the CUDA context, activations, and fragmentation. */
const USABLE_VRAM_FRACTION = 0.9;
/**
 * KV-cache cost per 8k tokens, scaled by model weight. Deliberately on the high
 * side (a GQA 7 GB model is ~1 GB/8k; large/Gemma-style caches run higher) so we
 * under-provision tokens rather than risk OOM — see {@link KV_SAFETY_FACTOR}.
 */
const KV_GB_PER_8K_AT_7GB = 1.5;
/** Extra margin so context isn't sized to the exact VRAM edge. */
const KV_SAFETY_FACTOR = 0.8;

function kvGbPer8k(weightGb: number): number {
  return Math.max(0.25, (weightGb / 7) * KV_GB_PER_8K_AT_7GB);
}

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

/** VRAM left for KV cache after model weights, given the usable-VRAM reserve. */
function kvHeadroomGb(vramGb: number, weightGb: number): number {
  return vramGb * USABLE_VRAM_FRACTION - weightGb;
}

/** Context that fits in the KV-cache headroom, with the safety margin applied. */
function contextFromKvHeadroom(vramGb: number, weightGb: number): number {
  const headroomGb = kvHeadroomGb(vramGb, weightGb);
  if (headroomGb < 0.5) return MIN_NUM_CTX;

  const estimated = Math.floor(
    (headroomGb / kvGbPer8k(weightGb)) * 8192 * KV_SAFETY_FACTOR,
  );
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
  const weightGb = estimateModelWeightGb(model);

  // Primary driver: how much context actually fits in the KV-cache headroom
  // (free VRAM after model weights, with a safety margin). The coarse VRAM tier
  // is only a fallback when the model size is unknown.
  let target: number;
  let limitedBy: ContextBudgetLimiter;
  if (weightGb != null) {
    target = contextFromKvHeadroom(vramGb, weightGb);
    limitedBy = "kv_headroom";
    const freeGb = Math.max(0, kvHeadroomGb(vramGb, weightGb));
    notes.push(
      `Model weights ~${weightGb.toFixed(1)} GB; ~${freeGb.toFixed(1)} GB free of ` +
        `${vramGb} GB VRAM → ~${target.toLocaleString()} tokens fit ` +
        `(${Math.round((1 - KV_SAFETY_FACTOR) * 100)}% safety margin).`,
    );
  } else {
    target = vramTierCtx;
    limitedBy = "vram_tier";
    notes.push(
      `Model size unknown — using VRAM tier baseline ${vramTierCtx.toLocaleString()} tokens.`,
    );
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
