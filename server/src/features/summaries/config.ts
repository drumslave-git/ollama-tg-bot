export interface SummariesConfig {
  /** Whether the daily summary job runs. */
  enabled: boolean;
  /** Local hour (0–23, in the server TZ) the daily summary job fires. */
  runHour: number;
}

export const DEFAULT_SUMMARIES_CONFIG: SummariesConfig = {
  enabled: true,
  runHour: 4,
};
