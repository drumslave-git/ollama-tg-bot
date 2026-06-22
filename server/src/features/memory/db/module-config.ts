import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_MEMORY_MODULE_CONFIG,
  validateMemoryModuleConfig,
  type MemoryModuleConfig,
} from "../index.js";

let db: DatabaseSync;

export function bindMemoryConfigDatabase(database: DatabaseSync): void {
  db = database;
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_module_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      extraction_debounce_sec INTEGER NOT NULL DEFAULT 60
    );
  `);
  const row = db
    .prepare(`SELECT id FROM memory_module_config WHERE id = 1`)
    .get() as { id: number } | undefined;
  if (!row) {
    db.prepare(
      `INSERT INTO memory_module_config (id, extraction_debounce_sec) VALUES (1, ?)`,
    ).run(DEFAULT_MEMORY_MODULE_CONFIG.extractionDebounceSec);
  }
}

export function getMemoryModuleConfig(): MemoryModuleConfig {
  const row = db
    .prepare(`SELECT extraction_debounce_sec FROM memory_module_config WHERE id = 1`)
    .get() as { extraction_debounce_sec: number } | undefined;
  return {
    extractionDebounceSec:
      row?.extraction_debounce_sec ??
      DEFAULT_MEMORY_MODULE_CONFIG.extractionDebounceSec,
  };
}

export function updateMemoryModuleConfig(
  partial: Partial<MemoryModuleConfig>,
): MemoryModuleConfig {
  const next = validateMemoryModuleConfig({
    ...getMemoryModuleConfig(),
    ...partial,
  });
  db.prepare(
    `UPDATE memory_module_config SET extraction_debounce_sec = ? WHERE id = 1`,
  ).run(next.extractionDebounceSec);
  return next;
}
