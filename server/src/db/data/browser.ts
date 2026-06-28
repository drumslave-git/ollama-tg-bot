import type { SqlDatabase } from "../../contracts/index.js";

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

interface ColumnInfo {
  name: string;
  dataType: string;
  udtName: string;
}

/** Columns this big (vector embeddings, full-text search vectors) are previewed
 *  as text rather than dumped in full — a single embedding is thousands of chars. */
const PREVIEW_UDTS = new Set(["vector", "tsvector"]);
const PREVIEW_CHARS = 240;

let db: SqlDatabase;

export function bindDataBrowserDatabase(database: SqlDatabase): void {
  db = database;
}

/** Every base table in the public schema, with its live row count. */
export async function listDataTables(): Promise<DataTableSummary[]> {
  const names = await listTableNames();
  return Promise.all(
    names.map(async (id) => {
      const { rows } = await db.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM ${quoteIdent(id)}`,
      );
      return { id, label: humanizeTableName(id), count: rows[0]?.n ?? 0 };
    }),
  );
}

export async function getDataTable(
  tableId: string,
): Promise<DataTablePayload | null> {
  // Validate against the real catalog before interpolating the name into SQL.
  const names = await listTableNames();
  if (!names.includes(tableId)) return null;

  const columns = await listColumns(tableId);
  const ident = quoteIdent(tableId);

  const { rows: totalRows } = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM ${ident}`,
  );
  const total = totalRows[0]?.n ?? 0;

  const selectList = columns.map(columnSelectExpr).join(", ");
  const orderBy = orderByClause(columns);
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT ${selectList} FROM ${ident}${orderBy} LIMIT $1`,
    [MAX_ROWS],
  );

  const timeCols = new Set(
    columns.filter(isEpochColumn).map((column) => column.name),
  );
  const formatted = rows.map((row) => formatRow(row, timeCols));

  return {
    id: tableId,
    label: humanizeTableName(tableId),
    columns: columns.map((column) => column.name),
    rows: formatted,
    total,
    truncated: total > MAX_ROWS,
  };
}

async function listTableNames(): Promise<string[]> {
  const { rows } = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  return rows.map((row) => row.table_name);
}

async function listColumns(tableName: string): Promise<ColumnInfo[]> {
  const { rows } = await db.query<{
    column_name: string;
    data_type: string;
    udt_name: string;
  }>(
    `SELECT column_name, data_type, udt_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName],
  );
  return rows.map((row) => ({
    name: row.column_name,
    dataType: row.data_type,
    udtName: row.udt_name,
  }));
}

/** Bigint `*_at` columns hold epoch seconds — render them as ISO timestamps. */
function isEpochColumn(column: ColumnInfo): boolean {
  return column.dataType === "bigint" && /_at$/.test(column.name);
}

function columnSelectExpr(column: ColumnInfo): string {
  const ident = quoteIdent(column.name);
  if (PREVIEW_UDTS.has(column.udtName)) {
    return `left(${ident}::text, ${PREVIEW_CHARS}) AS ${ident}`;
  }
  return ident;
}

/** Newest-first on the most meaningful column, else stable by the first column. */
function orderByClause(columns: ColumnInfo[]): string {
  const names = new Set(columns.map((column) => column.name));
  for (const candidate of ["id", "created_at", "updated_at"]) {
    if (names.has(candidate)) return ` ORDER BY ${quoteIdent(candidate)} DESC`;
  }
  return columns.length > 0 ? " ORDER BY 1" : "";
}

function formatRow(
  row: Record<string, unknown>,
  timeColumns: Set<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (timeColumns.has(key) && typeof value === "number") {
      out[key] = new Date(value * 1000).toISOString();
    } else {
      out[key] = value;
    }
  }
  return out;
}

function humanizeTableName(name: string): string {
  const spaced = name.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
