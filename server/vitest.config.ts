import { defineConfig } from "vitest/config";

/**
 * Committable unit/integration suite.
 *
 * No network, no real LLM, no Telegram — those are mocked. This is the default
 * `npm test`.
 *
 * Postgres-backed db tests run against the local dev database (DATABASE_URL from
 * `.env`); they skip when it is unset. Because they share that one database,
 * files run serially (`fileParallelism: false`) so suites don't race on tables.
 * See test/helpers/pg.ts.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/live/**"],
    environment: "node",
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    fileParallelism: false,
  },
});
