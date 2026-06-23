export interface MemoryModuleConfig {
  /** Seconds after the message queue is idle before memory maintenance runs. */
  maintenanceDebounceSec: number;
}

export const DEFAULT_MEMORY_MODULE_CONFIG: MemoryModuleConfig = {
  maintenanceDebounceSec: 60,
};

const MIN_DEBOUNCE_SEC = 5;
const MAX_DEBOUNCE_SEC = 600;

export function validateMemoryModuleConfig(
  partial: Partial<MemoryModuleConfig>,
): MemoryModuleConfig {
  const maintenanceDebounceSec =
    partial.maintenanceDebounceSec ??
    DEFAULT_MEMORY_MODULE_CONFIG.maintenanceDebounceSec;
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
