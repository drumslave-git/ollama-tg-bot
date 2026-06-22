import { defineConfig } from "vitest/config";
import { liveVitestAliases, liveVitestTestDefaults } from "./vitest.live.shared.js";

/**
 * Live reasoning suite — same backend as `test:llm`, but with thinking enabled.
 *
 * Opt-in: `npm run test:llm:reasoning -w server`. Sets `LLM_THINKING_ENABLED=1` and
 * runs only `test/live/reasoning.test.ts`. Requires `LLM_BASE_URL` and `LLM_MODEL`.
 */
export default defineConfig({
  resolve: {
    alias: liveVitestAliases,
  },
  test: {
    ...liveVitestTestDefaults,
    include: [
      "test/live/reasoning.test.ts",
      "test/features/**/live/**/*.reasoning.live.test.ts",
    ],
    env: {
      LLM_THINKING_ENABLED: "1",
    },
  },
});
