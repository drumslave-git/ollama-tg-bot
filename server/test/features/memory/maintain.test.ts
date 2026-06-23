import { describe, expect, it } from "vitest";
import {
  cleanMemoryDocument,
  type MemoryLlmConfig,
} from "../../../src/features/memory/index.js";

function stubConfig(response: string): MemoryLlmConfig {
  return {
    baseUrl: "",
    model: "stub",
    chatComplete: async () => response,
  };
}

describe("cleanMemoryDocument", () => {
  it("returns the deduped/compacted lines from the merge model", async () => {
    const cleaned = await cleanMemoryDocument(
      "user",
      "Lives in Lisbon.\nLives in Lisbon.\nLikes tea.",
      stubConfig('{"memory":"Lives in Lisbon.\\nLikes tea."}'),
    );
    expect(cleaned).toEqual(["Lives in Lisbon.", "Likes tea."]);
  });

  it("returns an empty array for empty content without calling the model", async () => {
    let called = false;
    const config: MemoryLlmConfig = {
      baseUrl: "",
      model: "stub",
      chatComplete: async () => {
        called = true;
        return "{}";
      },
    };
    const cleaned = await cleanMemoryDocument("general", "   \n  ", config);
    expect(cleaned).toEqual([]);
    expect(called).toBe(false);
  });
});
