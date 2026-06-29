import type { SqlDatabase } from "../../../contracts/index.js";
import {
  DEFAULT_MEMORY_CONFIG,
  validateMemoryConfig,
  type MemoryConfig,
} from "../config.js";

let db: SqlDatabase;

export async function bindMemoryConfigDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS memory_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      run_hour INTEGER NOT NULL DEFAULT 4
    );
  `);
  await db.query(
    `INSERT INTO memory_config (id, enabled, run_hour)
     VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING`,
    [DEFAULT_MEMORY_CONFIG.enabled, DEFAULT_MEMORY_CONFIG.runHour],
  );
}

export async function getMemoryConfig(): Promise<MemoryConfig> {
  const { rows } = await db.query<{ enabled: boolean; run_hour: number }>(
    `SELECT enabled, run_hour FROM memory_config WHERE id = 1`,
  );
  return {
    enabled: rows[0]?.enabled ?? DEFAULT_MEMORY_CONFIG.enabled,
    runHour: rows[0]?.run_hour ?? DEFAULT_MEMORY_CONFIG.runHour,
  };
}

export async function updateMemoryConfig(
  partial: Partial<MemoryConfig>,
): Promise<MemoryConfig> {
  const next = validateMemoryConfig({
    ...(await getMemoryConfig()),
    ...partial,
  });
  await db.query(
    `UPDATE memory_config SET enabled = $1, run_hour = $2 WHERE id = 1`,
    [next.enabled, next.runHour],
  );
  return next;
}
