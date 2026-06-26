import type { SqlDatabase } from "../../../contracts/index.js";
import {
  DEFAULT_MEMORY_MODULE_CONFIG,
  validateMemoryModuleConfig,
  type MemoryModuleConfig,
} from "../index.js";

let db: SqlDatabase;

export async function bindMemoryConfigDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS memory_module_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      maintenance_debounce_sec INTEGER NOT NULL DEFAULT 60
    );
  `);
  await db.query(
    `INSERT INTO memory_module_config (id, maintenance_debounce_sec)
     VALUES (1, $1) ON CONFLICT (id) DO NOTHING`,
    [DEFAULT_MEMORY_MODULE_CONFIG.maintenanceDebounceSec],
  );
}

export async function getMemoryModuleConfig(): Promise<MemoryModuleConfig> {
  const { rows } = await db.query<{ maintenance_debounce_sec: number }>(
    `SELECT maintenance_debounce_sec FROM memory_module_config WHERE id = 1`,
  );
  return {
    maintenanceDebounceSec:
      rows[0]?.maintenance_debounce_sec ??
      DEFAULT_MEMORY_MODULE_CONFIG.maintenanceDebounceSec,
  };
}

export async function updateMemoryModuleConfig(
  partial: Partial<MemoryModuleConfig>,
): Promise<MemoryModuleConfig> {
  const next = validateMemoryModuleConfig({
    ...(await getMemoryModuleConfig()),
    ...partial,
  });
  await db.query(
    `UPDATE memory_module_config SET maintenance_debounce_sec = $1 WHERE id = 1`,
    [next.maintenanceDebounceSec],
  );
  return next;
}
