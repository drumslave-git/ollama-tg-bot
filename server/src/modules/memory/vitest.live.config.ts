import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/live/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 180_000,
    fileParallelism: false,
  },
});
