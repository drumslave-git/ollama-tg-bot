import { defineConfig } from "vitest/config";

/**
 * Live LLM suite — hits a real OpenAI-compatible backend.
 *
 * Opt-in: run with `npm run test:llm -w server`. Requires `LLM_BASE_URL` and
 * `LLM_MODEL`; when they are absent the specs self-skip so the command never
 * fails for lack of a backend. Never part of the default `npm test`.
 */
export default defineConfig({
  test: {
    include: ["test/live/**/*.test.ts"],
    environment: "node",
    globals: false,
    // LLM round-trips can be slow; allow generous per-test budgets.
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // Avoid hammering a single backend with parallel requests.
    fileParallelism: false,
    setupFiles: ["test/live/setup-env.ts"],
  },
});
