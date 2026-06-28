import type { SqlDatabase } from "../../../contracts/index.js";
import {
  DEFAULT_VISION_CONFIG,
  validateVisionConfig,
  type VisionConfig,
} from "../config.js";

let db: SqlDatabase;

export async function bindVisionConfigDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS vision_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      backfill_debounce_sec INTEGER NOT NULL DEFAULT 60
    );
  `);
  await db.query(
    `INSERT INTO vision_config (id, backfill_debounce_sec)
     VALUES (1, $1) ON CONFLICT (id) DO NOTHING`,
    [DEFAULT_VISION_CONFIG.backfillDebounceSec],
  );
}

export async function getVisionConfig(): Promise<VisionConfig> {
  const { rows } = await db.query<{ backfill_debounce_sec: number }>(
    `SELECT backfill_debounce_sec FROM vision_config WHERE id = 1`,
  );
  return {
    backfillDebounceSec:
      rows[0]?.backfill_debounce_sec ??
      DEFAULT_VISION_CONFIG.backfillDebounceSec,
  };
}

export async function updateVisionConfig(
  partial: Partial<VisionConfig>,
): Promise<VisionConfig> {
  const next = validateVisionConfig({
    ...(await getVisionConfig()),
    ...partial,
  });
  await db.query(
    `UPDATE vision_config SET backfill_debounce_sec = $1 WHERE id = 1`,
    [next.backfillDebounceSec],
  );
  return next;
}
