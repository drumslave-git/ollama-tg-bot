export interface MemoryModuleConfig {
  /** Seconds after the message queue is idle before memory extraction runs. */
  extractionDebounceSec: number;
}

export const DEFAULT_MEMORY_MODULE_CONFIG: MemoryModuleConfig = {
  extractionDebounceSec: 60,
};

const MIN_DEBOUNCE_SEC = 5;
const MAX_DEBOUNCE_SEC = 600;

export function validateMemoryModuleConfig(
  partial: Partial<MemoryModuleConfig>,
): MemoryModuleConfig {
  const extractionDebounceSec =
    partial.extractionDebounceSec ?? DEFAULT_MEMORY_MODULE_CONFIG.extractionDebounceSec;
  if (
    typeof extractionDebounceSec !== "number" ||
    !Number.isFinite(extractionDebounceSec) ||
    extractionDebounceSec < MIN_DEBOUNCE_SEC ||
    extractionDebounceSec > MAX_DEBOUNCE_SEC
  ) {
    throw new Error(
      `extractionDebounceSec must be ${MIN_DEBOUNCE_SEC}–${MAX_DEBOUNCE_SEC}`,
    );
  }
  return { extractionDebounceSec };
}
