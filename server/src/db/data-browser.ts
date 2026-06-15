import type { DatabaseSync } from "node:sqlite";
import { getModuleDataTableConfigs } from "../module-runtime.js";

const MAX_ROWS = 2000;

export interface DataTableSummary {
  id: string;
  label: string;
  count: number;
}

export interface DataTablePayload {
  id: string;
  label: string;
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  truncated: boolean;
}

interface TableConfig {
  label: string;
  columns: string[];
  query: string;
  countQuery: string;
  timeColumns?: string[];
}

const TABLE_CONFIGS: Record<string, TableConfig> = {
  settings: {
    label: "Settings",
    columns: ["key", "value"],
    query: "SELECT key, value FROM settings ORDER BY key",
    countQuery: "SELECT COUNT(*) AS n FROM settings",
  },
  stats: {
    label: "Stats",
    columns: ["key", "value"],
    query: "SELECT key, value FROM stats ORDER BY key",
    countQuery: "SELECT COUNT(*) AS n FROM stats",
  },
  stats_meta: {
    label: "Stats meta",
    columns: ["key", "value"],
    query: "SELECT key, value FROM stats_meta ORDER BY key",
    countQuery: "SELECT COUNT(*) AS n FROM stats_meta",
  },
  known_users: {
    label: "Known users",
    columns: ["user_id", "username", "first_name", "last_name", "updated_at"],
    query: `SELECT user_id, username, first_name, last_name, updated_at
            FROM known_users ORDER BY updated_at DESC LIMIT ?`,
    countQuery: "SELECT COUNT(*) AS n FROM known_users",
    timeColumns: ["updated_at"],
  },
  error_log: {
    label: "Error log",
    columns: ["id", "message", "stack", "chat_id", "user_id", "created_at"],
    query: `SELECT id, message, stack, chat_id, user_id, created_at
            FROM error_log ORDER BY id DESC LIMIT ?`,
    countQuery: "SELECT COUNT(*) AS n FROM error_log",
    timeColumns: ["created_at"],
  },
};

function allTableConfigs(): Record<string, TableConfig> {
  return {
    ...TABLE_CONFIGS,
    ...Object.fromEntries(getModuleDataTableConfigs()),
  };
}

/** Core SQLite tables only — module-owned tables are browsed on module pages. */
const TABLE_ORDER = [
  "settings",
  "stats",
  "stats_meta",
  "known_users",
  "error_log",
] as const;

let db: DatabaseSync;

export function bindDataBrowserDatabase(database: DatabaseSync): void {
  db = database;
}

export function listDataTables(): DataTableSummary[] {
  return TABLE_ORDER.filter((id) => TABLE_CONFIGS[id]).map((id) => {
    const config = TABLE_CONFIGS[id];
    const row = db.prepare(config.countQuery).get() as { n: number };
    return { id, label: config.label, count: row.n };
  });
}

export function getDataTable(tableId: string): DataTablePayload | null {
  const config = allTableConfigs()[tableId];
  if (!config) return null;

  const totalRow = db.prepare(config.countQuery).get() as { n: number };
  const total = totalRow.n;
  const limited = total > MAX_ROWS;
  const usesLimit = config.query.includes("LIMIT ?");
  const rows = usesLimit
    ? (db.prepare(config.query).all(MAX_ROWS) as Record<string, unknown>[])
    : (db.prepare(config.query).all() as Record<string, unknown>[]);

  const timeCols = new Set(config.timeColumns ?? []);
  const formatted = rows.map((row) => formatRow(row, timeCols));

  return {
    id: tableId,
    label: config.label,
    columns: config.columns.map(snakeToCamel),
    rows: formatted,
    total,
    truncated: limited,
  };
}

function formatRow(
  row: Record<string, unknown>,
  timeColumns: Set<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camel = snakeToCamel(key);
    if (timeColumns.has(key) && typeof value === "number") {
      out[camel] = new Date(value * 1000).toISOString();
    } else {
      out[camel] = value;
    }
  }
  return out;
}

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}
