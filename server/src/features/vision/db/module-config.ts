import type { SqlDatabase } from "../../../contracts/index.js";
import {
  DEFAULT_VISION_MODULE_CONFIG,
  validateVisionModuleConfig,
  type VisionModuleConfig,
} from "../module-config.js";

let db: SqlDatabase;

export async function bindVisionConfigDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS vision_module_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      backfill_debounce_sec INTEGER NOT NULL DEFAULT 60
    );
  `);
  await db.query(
    `INSERT INTO vision_module_config (id, backfill_debounce_sec)
     VALUES (1, $1) ON CONFLICT (id) DO NOTHING`,
    [DEFAULT_VISION_MODULE_CONFIG.backfillDebounceSec],
  );
}

export async function getVisionModuleConfig(): Promise<VisionModuleConfig> {
  const { rows } = await db.query<{ backfill_debounce_sec: number }>(
    `SELECT backfill_debounce_sec FROM vision_module_config WHERE id = 1`,
  );
  return {
    backfillDebounceSec:
      rows[0]?.backfill_debounce_sec ??
      DEFAULT_VISION_MODULE_CONFIG.backfillDebounceSec,
  };
}

export async function updateVisionModuleConfig(
  partial: Partial<VisionModuleConfig>,
): Promise<VisionModuleConfig> {
  const next = validateVisionModuleConfig({
    ...(await getVisionModuleConfig()),
    ...partial,
  });
  await db.query(
    `UPDATE vision_module_config SET backfill_debounce_sec = $1 WHERE id = 1`,
    [next.backfillDebounceSec],
  );
  return next;
}
