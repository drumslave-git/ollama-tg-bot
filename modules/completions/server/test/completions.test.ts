import { describe, expect, it } from "vitest";
import { pipelineHosts } from "../src/pipeline.js";

describe("completions pipeline hosts", () => {
  it("exports system and completion hosts in order", () => {
    expect(pipelineHosts).toHaveLength(2);
    expect(pipelineHosts[0]?.stepId).toBe("system");
    expect(pipelineHosts[1]?.stepId).toBe("completions");
  });
});
