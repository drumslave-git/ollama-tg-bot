import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import type { SqlDatabase, SqlQueryResult } from "../../src/contracts/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

const { Pool, types } = pg;

// Match production parsers (see src/db/pool.ts).
types.setTypeParser(20, (value) => parseInt(value, 10));
types.setTypeParser(1082, (value) => value);

/**
 * Postgres-backed tests run against the local dev database (DATABASE_URL from
 * `.env`) — there is no separate test DB. They need a real pgvector server for
 * the FTS + vector features no in-memory fake reproduces, so they skip when
 * DATABASE_URL is unset (e.g. CI with no database). They share one database, so
 * the suite runs serially (see `fileParallelism: false` in vitest.config.ts).
 */
export const DATABASE_URL = (process.env.DATABASE_URL ?? "").trim();

export const hasTestDb = DATABASE_URL.length > 0;

let pool: pg.Pool | undefined;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL });
  }
  return pool;
}

/** A SqlDatabase backed by the test Postgres pool. */
export const testDb: SqlDatabase = {
  async query<R = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<SqlQueryResult<R>> {
    const result = await getPool().query(text, params as unknown[]);
    return { rows: result.rows as R[], rowCount: result.rowCount };
  },
};

/** Ensure the pgvector extension exists (idempotent). Call once per suite. */
export async function ensureVectorExtension(): Promise<void> {
  await getPool().query("CREATE EXTENSION IF NOT EXISTS vector");
}

/** Drop the given tables so a suite starts from a clean schema. */
export async function dropTables(...tables: string[]): Promise<void> {
  for (const table of tables) {
    await getPool().query(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
}

/** Remove all rows from the given tables between tests. */
export async function truncateTables(...tables: string[]): Promise<void> {
  for (const table of tables) {
    await getPool().query(`TRUNCATE ${table} RESTART IDENTITY CASCADE`);
  }
}

export async function closeTestPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
