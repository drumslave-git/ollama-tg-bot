/** Keep in sync with server/src/settings-limits.ts */

export const MIN_NUM_PREDICT = 32;
export const MAX_NUM_PREDICT = 8192;
export const NUM_CTX_GENERATION_HEADROOM = 512;
export const MIN_NUM_CTX = 2048;
export const ABSOLUTE_MAX_NUM_CTX = 262144;
export const MAX_NUM_CTX = ABSOLUTE_MAX_NUM_CTX;
export const NUM_CTX_STEP = 512;
export const NUM_PREDICT_STEP = 32;
const APPROX_CHARS_PER_TOKEN = 3.5;

export function snapNumPredict(value: number): number {
  const snapped = Math.round(value / NUM_PREDICT_STEP) * NUM_PREDICT_STEP;
  return Math.min(MAX_NUM_PREDICT, Math.max(MIN_NUM_PREDICT, snapped));
}

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

/** Smallest context window that fits the current generation budget plus prompt headroom. */
export function minNumCtxForPredict(numPredict: number): number {
  return snapNumCtx(snapNumPredict(numPredict) + NUM_CTX_GENERATION_HEADROOM);
}

export interface DerivedHistoryLimits {
  historyMaxTokens: number;
  historyMaxReplyChars: number;
  numPredict: number;
}

export function deriveHistoryLimits(
  numCtx: number,
  numPredict: number,
): DerivedHistoryLimits {
  const snappedNumPredict = snapNumPredict(numPredict);

  const historyMaxTokens = Math.max(
    256,
    Math.floor((numCtx - snappedNumPredict) * 0.45),
  );

  return {
    historyMaxTokens,
    historyMaxReplyChars: Math.min(
      4000,
      Math.max(100, Math.floor(snappedNumPredict * APPROX_CHARS_PER_TOKEN)),
    ),
    numPredict: snappedNumPredict,
  };
}
