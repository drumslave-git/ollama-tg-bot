import { describe, expect, it } from "vitest";
import { computeMemoryExtractionFingerprint } from "../../../src/features/memory/fingerprint.js";

describe("computeMemoryExtractionFingerprint", () => {
  it("returns null for empty history", () => {
    expect(computeMemoryExtractionFingerprint([])).toBeNull();
  });

  it("returns null when no user or assistant content exists", () => {
    expect(
      computeMemoryExtractionFingerprint([{ role: "system", content: "x" }]),
    ).toBeNull();
  });

  it("is stable for the same extraction slice", () => {
    const messages = [
      { role: "user:alice:1", content: "Hello" },
      { role: "assistant", content: "[assistant said]: Hi" },
    ];
    const a = computeMemoryExtractionFingerprint(messages);
    const b = computeMemoryExtractionFingerprint(messages);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when the latest user or assistant text changes", () => {
    const base = [
      { role: "user:alice:1", content: "Hello" },
      { role: "assistant", content: "[assistant said]: Hi" },
    ];
    const changedUser = [
      { role: "user:alice:1", content: "Hello again" },
      { role: "assistant", content: "[assistant said]: Hi" },
    ];
    expect(computeMemoryExtractionFingerprint(base)).not.toBe(
      computeMemoryExtractionFingerprint(changedUser),
    );
  });
});
