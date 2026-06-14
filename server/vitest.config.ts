import { defineConfig } from "vitest/config";

/**
 * Committable unit/integration suite.
 *
 * Pure logic only — no network, no real LLM, no Telegram. Everything that
 * touches an external service is mocked. This is the default `npm test`.
 */
export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts"],
    environment: "node",
    globals: false,
    clearMocks: true,
    restoreMocks: true,
  },
});
