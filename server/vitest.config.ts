import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const sqliteShim = fileURLToPath(
  new URL("./test/shims/node-sqlite.mjs", import.meta.url),
);

/**
 * Committable unit/integration suite.
 *
 * Pure logic only — no network, no real LLM, no Telegram. Everything that
 * touches an external service is mocked. This is the default `npm test`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "node:sqlite": sqliteShim,
      sqlite: sqliteShim,
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/live/**"],
    environment: "node",
    globals: false,
    clearMocks: true,
    restoreMocks: true,
  },
});
