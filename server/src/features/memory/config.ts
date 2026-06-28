export interface MemoryConfig {
  /** Seconds after the message queue is idle before memory maintenance runs. */
  maintenanceDebounceSec: number;
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  maintenanceDebounceSec: 60,
};

const MIN_DEBOUNCE_SEC = 5;
const MAX_DEBOUNCE_SEC = 600;

export function validateMemoryConfig(
  partial: Partial<MemoryConfig>,
): MemoryConfig {
  const maintenanceDebounceSec =
    partial.maintenanceDebounceSec ??
    DEFAULT_MEMORY_CONFIG.maintenanceDebounceSec;
  if (
    typeof maintenanceDebounceSec !== "number" ||
    !Number.isFinite(maintenanceDebounceSec) ||
    maintenanceDebounceSec < MIN_DEBOUNCE_SEC ||
    maintenanceDebounceSec > MAX_DEBOUNCE_SEC
  ) {
    throw new Error(
      `maintenanceDebounceSec must be ${MIN_DEBOUNCE_SEC}–${MAX_DEBOUNCE_SEC}`,
    );
  }
  return { maintenanceDebounceSec };
}
