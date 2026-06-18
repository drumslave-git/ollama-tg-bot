export const DEFAULT_VISION_MODULE_CONFIG = {
    backfillDebounceSec: 60,
};
const MIN_DEBOUNCE_SEC = 5;
const MAX_DEBOUNCE_SEC = 600;
export function validateVisionModuleConfig(partial) {
    const backfillDebounceSec = partial.backfillDebounceSec ?? DEFAULT_VISION_MODULE_CONFIG.backfillDebounceSec;
    if (typeof backfillDebounceSec !== "number" ||
        !Number.isFinite(backfillDebounceSec) ||
        backfillDebounceSec < MIN_DEBOUNCE_SEC ||
        backfillDebounceSec > MAX_DEBOUNCE_SEC) {
        throw new Error(`backfillDebounceSec must be ${MIN_DEBOUNCE_SEC}–${MAX_DEBOUNCE_SEC}`);
    }
    return { backfillDebounceSec };
}
