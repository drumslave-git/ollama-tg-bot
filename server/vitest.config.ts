import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));
const modulesRoot = path.join(root, "..", "modules");

/**
 * Committable unit/integration suite.
 *
 * Pure logic only — no network, no real LLM, no Telegram. Everything that
 * touches an external service is mocked. This is the default `npm test`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@llm-tg-bot/modules-registry": path.join(
        modulesRoot,
        "registry/src/index.ts",
      ),
      "@llm-tg-bot/modules-utils": path.join(
        modulesRoot,
        "utils/server/src/index.ts",
      ),
      "@llm-tg-bot/modules-addressing-detection": path.join(
        modulesRoot,
        "addressing-detection/server/src/index.ts",
      ),
      "@llm-tg-bot/modules-search-decision": path.join(
        modulesRoot,
        "search-decision/server/src/index.ts",
      ),
      "@llm-tg-bot/modules-web-search": path.join(
        modulesRoot,
        "web-search/server/src/index.ts",
      ),
      "@llm-tg-bot/modules-memory": path.join(
        modulesRoot,
        "memory/server/src/index.ts",
      ),
      "@llm-tg-bot/modules-memory-db": path.join(
        modulesRoot,
        "memory/db/src/index.ts",
      ),
      "@llm-tg-bot/modules-link-fetch": path.join(
        modulesRoot,
        "link-fetch/server/src/index.ts",
      ),
      "@llm-tg-bot/modules-sticker-selection": path.join(
        modulesRoot,
        "sticker-selection/server/src/index.ts",
      ),
      "@llm-tg-bot/modules-mood-evaluation": path.join(
        modulesRoot,
        "mood-evaluation/server/src/index.ts",
      ),
      "@llm-tg-bot/modules-mood-evaluation-db": path.join(
        modulesRoot,
        "mood-evaluation/db/src/index.ts",
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
