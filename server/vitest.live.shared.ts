import { fileURLToPath } from "node:url";

const sqliteShim = fileURLToPath(
  new URL("./test/shims/node-sqlite.mjs", import.meta.url),
);

/** Shared Vitest aliases for live LLM suites. */
export const liveVitestAliases: Record<string, string> = {
  "node:sqlite": sqliteShim,
  sqlite: sqliteShim,
};

export const liveVitestTestDefaults = {
  environment: "node" as const,
  globals: false,
  testTimeout: 180_000,
  hookTimeout: 180_000,
  fileParallelism: false,
  setupFiles: ["test/live/setup-env.ts"],
};
