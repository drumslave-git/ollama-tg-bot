import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * Committable unit/integration suite.
 *
 * Pure logic only — no network, no real LLM, no Telegram. Everything that
 * touches an external service is mocked. This is the default `npm test`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@llm-tg-bot/modules-utils": path.join(
        root,
        "src/modules/utils/src/index.ts",
      ),
      "@llm-tg-bot/modules-addressing-detection": path.join(
        root,
        "src/modules/addressing-detection/src/index.ts",
      ),
      "@llm-tg-bot/modules-search-decision": path.join(
        root,
        "src/modules/search-decision/src/index.ts",
      ),
      "@llm-tg-bot/modules-web-search": path.join(
        root,
        "src/modules/web-search/src/index.ts",
      ),
      "@llm-tg-bot/modules-memory": path.join(
        root,
        "src/modules/memory/src/index.ts",
      ),
    },
  },
  test: {
    include: ["test/unit/**/*.test.ts"],
    environment: "node",
    globals: false,
    clearMocks: true,
    restoreMocks: true,
  },
});
