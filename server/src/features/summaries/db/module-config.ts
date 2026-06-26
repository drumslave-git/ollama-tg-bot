import type { SqlDatabase } from "../../../contracts/index.js";
import {
  DEFAULT_SUMMARIES_MODULE_CONFIG,
  validateSummariesModuleConfig,
  type SummariesModuleConfig,
} from "../module-config.js";

let db: SqlDatabase;

export async function bindSummariesConfigDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS summaries_module_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      run_hour INTEGER NOT NULL DEFAULT 4
    );
  `);
  await db.query(
    `INSERT INTO summaries_module_config (id, enabled, run_hour)
     VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING`,
    [
      DEFAULT_SUMMARIES_MODULE_CONFIG.enabled,
      DEFAULT_SUMMARIES_MODULE_CONFIG.runHour,
    ],
  );
}

export async function getSummariesModuleConfig(): Promise<SummariesModuleConfig> {
  const { rows } = await db.query<{ enabled: boolean; run_hour: number }>(
    `SELECT enabled, run_hour FROM summaries_module_config WHERE id = 1`,
  );
  return {
    enabled: rows[0]?.enabled ?? DEFAULT_SUMMARIES_MODULE_CONFIG.enabled,
    runHour: rows[0]?.run_hour ?? DEFAULT_SUMMARIES_MODULE_CONFIG.runHour,
  };
}

export async function updateSummariesModuleConfig(
  partial: Partial<SummariesModuleConfig>,
): Promise<SummariesModuleConfig> {
  const next = validateSummariesModuleConfig({
    ...(await getSummariesModuleConfig()),
    ...partial,
  });
  await db.query(
    `UPDATE summaries_module_config SET enabled = $1, run_hour = $2 WHERE id = 1`,
    [next.enabled, next.runHour],
  );
  return next;
}
