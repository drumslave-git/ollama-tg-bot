import { describe, expect, it } from "vitest";
import { completionsHost } from "../../../src/features/completions/completions.js";
import { systemPromptHost } from "../../../src/features/completions/system-prompt.js";

describe("completions hosts", () => {
  it("exports the system and completion steps", () => {
    expect(systemPromptHost.stepId).toBe("system");
    expect(completionsHost.stepId).toBe("completions");
  });
});
