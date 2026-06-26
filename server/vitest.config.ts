import { defineConfig } from "vitest/config";

/**
 * Committable unit/integration suite.
 *
 * Pure logic only — no network, no real LLM, no Telegram. Everything that
 * touches an external service is mocked. This is the default `npm test`.
 *
 * Postgres-backed db tests are opt-in: set TEST_DATABASE_URL to a pgvector
 * server to run them (they skip otherwise). See test/helpers/pg.ts.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/live/**"],
    environment: "node",
    globals: false,
    clearMocks: true,
    restoreMocks: true,
  },
});
