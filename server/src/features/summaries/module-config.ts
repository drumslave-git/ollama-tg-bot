export interface SummariesModuleConfig {
  /** Whether the daily summary job runs. */
  enabled: boolean;
  /** Local hour (0–23, in the server TZ) the daily summary job fires. */
  runHour: number;
}

export const DEFAULT_SUMMARIES_MODULE_CONFIG: SummariesModuleConfig = {
  enabled: true,
  runHour: 4,
};

export function validateSummariesModuleConfig(
  partial: Partial<SummariesModuleConfig>,
): SummariesModuleConfig {
  const enabled =
    partial.enabled ?? DEFAULT_SUMMARIES_MODULE_CONFIG.enabled;
  const runHour = partial.runHour ?? DEFAULT_SUMMARIES_MODULE_CONFIG.runHour;
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
