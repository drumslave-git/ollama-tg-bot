import { describe, expect, it } from "vitest";
import { extractLastClosedBlock } from "../src/structured-output.js";

describe("extractLastClosedBlock", () => {
  it("returns the last closed block when multiple exist", () => {
    const raw =
      "Format is [ADDRESS]\nyes\n[/ADDRESS] or no.\nDecision: [ADDRESS]\nno\n[/ADDRESS]";
    expect(extractLastClosedBlock(raw, "ADDRESS")).toBe("no");
  });

  it("returns null when no block is present", () => {
    expect(extractLastClosedBlock("maybe?", "ADDRESS")).toBeNull();
  });
});
