import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const modulesRoot = path.join(root, "..", "modules");

/** Shared Vitest resolve aliases for live LLM suites. */
export const liveVitestAliases = {
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
  "@llm-tg-bot/modules-history": path.join(
    modulesRoot,
    "history/server/src/index.ts",
  ),
  "@llm-tg-bot/modules-history-db": path.join(
    modulesRoot,
    "history/db/src/index.ts",
  ),
  "@llm-tg-bot/modules-vision": path.join(
    modulesRoot,
    "vision/server/src/index.ts",
  ),
  "@llm-tg-bot/modules-completions": path.join(
    modulesRoot,
    "completions/server/src/index.ts",
  ),
};

export const liveVitestTestDefaults = {
  environment: "node" as const,
  globals: false,
  testTimeout: 180_000,
  hookTimeout: 180_000,
  fileParallelism: false,
  setupFiles: ["test/live/setup-env.ts"],
};
