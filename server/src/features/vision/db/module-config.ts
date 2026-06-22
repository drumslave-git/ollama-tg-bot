import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_VISION_MODULE_CONFIG,
  validateVisionModuleConfig,
  type VisionModuleConfig,
} from "../index.js";

let db: DatabaseSync;

export function bindVisionConfigDatabase(database: DatabaseSync): void {
  db = database;
  db.exec(`
    CREATE TABLE IF NOT EXISTS vision_module_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      backfill_debounce_sec INTEGER NOT NULL DEFAULT 60
    );
  `);
  const row = db
    .prepare(`SELECT id FROM vision_module_config WHERE id = 1`)
    .get() as { id: number } | undefined;
  if (!row) {
    db.prepare(
      `INSERT INTO vision_module_config (id, backfill_debounce_sec) VALUES (1, ?)`,
    ).run(DEFAULT_VISION_MODULE_CONFIG.backfillDebounceSec);
  }
}

export function getVisionModuleConfig(): VisionModuleConfig {
  const row = db
    .prepare(`SELECT backfill_debounce_sec FROM vision_module_config WHERE id = 1`)
    .get() as { backfill_debounce_sec: number } | undefined;
  return {
    backfillDebounceSec:
      row?.backfill_debounce_sec ??
      DEFAULT_VISION_MODULE_CONFIG.backfillDebounceSec,
  };
}

export function updateVisionModuleConfig(
  partial: Partial<VisionModuleConfig>,
): VisionModuleConfig {
  const next = validateVisionModuleConfig({
    ...getVisionModuleConfig(),
    ...partial,
  });
  db.prepare(
    `UPDATE vision_module_config SET backfill_debounce_sec = ? WHERE id = 1`,
  ).run(next.backfillDebounceSec);
  return next;
}
