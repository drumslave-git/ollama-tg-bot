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
      maintenance_debounce_sec INTEGER NOT NULL DEFAULT 60
    );
  `);
  // Migrate the legacy column name from the extraction-based memory job.
  const columns = db
    .prepare(`PRAGMA table_info(memory_module_config)`)
    .all() as unknown as { name: string }[];
  const names = new Set(columns.map((c) => c.name));
  if (names.has("extraction_debounce_sec") && !names.has("maintenance_debounce_sec")) {
    db.exec(
      `ALTER TABLE memory_module_config
       RENAME COLUMN extraction_debounce_sec TO maintenance_debounce_sec`,
    );
  }
  const row = db
    .prepare(`SELECT id FROM memory_module_config WHERE id = 1`)
    .get() as { id: number } | undefined;
  if (!row) {
    db.prepare(
      `INSERT INTO memory_module_config (id, maintenance_debounce_sec) VALUES (1, ?)`,
    ).run(DEFAULT_MEMORY_MODULE_CONFIG.maintenanceDebounceSec);
  }
}

export function getMemoryModuleConfig(): MemoryModuleConfig {
  const row = db
    .prepare(`SELECT maintenance_debounce_sec FROM memory_module_config WHERE id = 1`)
    .get() as { maintenance_debounce_sec: number } | undefined;
  return {
    maintenanceDebounceSec:
      row?.maintenance_debounce_sec ??
      DEFAULT_MEMORY_MODULE_CONFIG.maintenanceDebounceSec,
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
    `UPDATE memory_module_config SET maintenance_debounce_sec = ? WHERE id = 1`,
  ).run(next.maintenanceDebounceSec);
  return next;
}
