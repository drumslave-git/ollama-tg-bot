import { describe, expect, it } from "vitest";
import { buildCommit, buildCommitShort } from "../../src/build-info.js";

describe("build-info", () => {
  it("exports commit identifiers", () => {
    expect(typeof buildCommit).toBe("string");
    expect(typeof buildCommitShort).toBe("string");
    expect(buildCommit.length).toBeGreaterThan(0);
    expect(buildCommitShort.length).toBeGreaterThan(0);
    if (buildCommit !== "unknown") {
      expect(buildCommitShort).toBe(buildCommit.slice(0, 7));
    }
  });
});
