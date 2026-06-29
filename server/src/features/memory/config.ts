export interface MemoryConfig {
  /** Whether the daily memory-consolidation job runs. */
  enabled: boolean;
  /** Local hour (0–23, in the server TZ) the daily consolidation job fires. */
  runHour: number;
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  enabled: true,
  runHour: 4,
};

export function validateMemoryConfig(
  partial: Partial<MemoryConfig>,
): MemoryConfig {
  const enabled = partial.enabled ?? DEFAULT_MEMORY_CONFIG.enabled;
  const runHour = partial.runHour ?? DEFAULT_MEMORY_CONFIG.runHour;
  if (typeof enabled !== "boolean") {
    throw new Error("enabled must be a boolean");
  }
  if (
    typeof runHour !== "number" ||
    !Number.isInteger(runHour) ||
    runHour < 0 ||
    runHour > 23
  ) {
    throw new Error("runHour must be an integer 0–23");
  }
  return { enabled, runHour };
}
