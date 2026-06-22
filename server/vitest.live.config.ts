import { defineConfig } from "vitest/config";
import { liveVitestAliases, liveVitestTestDefaults } from "./vitest.live.shared.js";

/**
 * Live LLM suite — hits a real OpenAI-compatible backend.
 *
 * Opt-in: run with `npm run test:llm -w server`. Reasoning checks:
 * `npm run test:llm:reasoning -w server` (sets `LLM_THINKING_ENABLED=1`). Requires `LLM_BASE_URL` and
 * `LLM_MODEL`; when they are absent the specs self-skip so the command never
 * fails for lack of a backend. Never part of the default `npm test`.
 */
export default defineConfig({
  resolve: {
    alias: liveVitestAliases,
  },
  test: {
    ...liveVitestTestDefaults,
    include: [
      "test/live/**/*.test.ts",
      "test/features/**/live/**/*.live.test.ts",
    ],
    exclude: ["test/live/reasoning.test.ts", "**/*.reasoning.live.test.ts"],
  },
});
