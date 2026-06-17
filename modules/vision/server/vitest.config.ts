import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));
const modulesRoot = path.join(root, "..", "..");

export default defineConfig({
  resolve: {
    alias: {
      "@llm-tg-bot/modules-history": path.join(
        modulesRoot,
        "history/server/src/index.ts",
      ),
      "@llm-tg-bot/modules-addressing-detection": path.join(
        modulesRoot,
        "addressing-detection/server/src/index.ts",
      ),
      "@llm-tg-bot/modules-registry": path.join(
        modulesRoot,
        "registry/src/index.ts",
      ),
      "@llm-tg-bot/modules-utils": path.join(
        modulesRoot,
        "utils/server/src/index.ts",
      ),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/live/**"],
    environment: "node",
    globals: false,
  },
});
