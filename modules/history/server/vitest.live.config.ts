import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@llm-tg-bot/modules-utils": path.join(
        root,
        "../../utils/server/src/index.ts",
      ),
    },
  },
  test: {
    include: ["test/live/**/*.live.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    setupFiles: ["../../../server/test/live/setup-env.ts"],
  },
});
