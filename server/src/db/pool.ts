import pg from "pg";
import { config } from "../config/index.js";
import type { SqlDatabase, SqlQueryResult } from "../contracts/index.js";

const { Pool, types } = pg;

// BIGINT (oid 20) is returned as a string by node-postgres by default. Every
// id / epoch / message_id we store stays well within Number.MAX_SAFE_INTEGER,
// so parse them back to numbers — this keeps the rest of the codebase working
// with plain numbers exactly as it did under SQLite.
types.setTypeParser(20, (value) => parseInt(value, 10));
// DATE (oid 1082): keep the raw `YYYY-MM-DD` string. The default parser builds a
// local-midnight Date, which shifts the calendar day under a non-UTC TZ.
types.setTypeParser(1082, (value) => value);

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error("Postgres pool is not initialized (call initPool first)");
  }
  return pool;
}

/**
 * Shared async SQL handle bound into every db module. Thin wrapper over the
 * pool that conforms to {@link SqlDatabase} so unit tests can inject a fake.
 */
export const db: SqlDatabase = {
  async query<R = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<SqlQueryResult<R>> {
    const result = await getPool().query(text, params as unknown[]);
    return { rows: result.rows as R[], rowCount: result.rowCount };
  },
};

/** Connect the pool and ensure the pgvector extension exists. Call once at boot. */
export async function initPool(): Promise<void> {
  if (pool) return;
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }
  pool = new Pool({ connectionString: config.databaseUrl });
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = undefined;
}
