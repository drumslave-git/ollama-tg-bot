import pg from "pg";
import type { SqlDatabase, SqlQueryResult } from "../../src/contracts/index.js";

const { Pool, types } = pg;

// Match production parsers (see src/db/pool.ts).
types.setTypeParser(20, (value) => parseInt(value, 10));
types.setTypeParser(1082, (value) => value);

/**
 * Postgres-backed tests are gated on an explicit TEST_DATABASE_URL: they need a
 * real pgvector server for FTS + vector features that no in-memory fake
 * reproduces. They are OPT-IN (a separate var from the app's DATABASE_URL) so a
 * plain `npm test` — which loads `.env` via the app config — does not try to hit
 * a database. They share one database, so run them serially:
 *   TEST_DATABASE_URL=postgres://bot:bot@localhost:5432/bot \
 *     npx vitest run --no-file-parallelism -w server
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";

export const hasTestDb = TEST_DATABASE_URL.length > 0;

let pool: pg.Pool | undefined;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
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
