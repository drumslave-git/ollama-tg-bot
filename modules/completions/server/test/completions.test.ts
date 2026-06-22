import { describe, expect, it } from "vitest";
import { completionsHost } from "../src/completions.js";
import { systemPromptHost } from "../src/system-prompt.js";

describe("completions hosts", () => {
  it("exports the system and completion steps", () => {
    expect(systemPromptHost.stepId).toBe("system");
    expect(completionsHost.stepId).toBe("completions");
  });
});
