import { describe, expect, it } from "vitest";
import {
  MEMORY_MERGE_SYSTEM,
  buildMemoryMergeMessages,
  parseMemoryBlock,
  splitMergedMemoryFacts,
} from "../../../src/features/memory/index.js";

describe("parseMemoryBlock", () => {
  it("extracts a merged memory document", () => {
    expect(
      parseMemoryBlock('{"memory":"Lives in Lisbon.\\nLikes tea."}'),
    ).toBe("Lives in Lisbon.\nLikes tea.");
  });

  it("returns empty string for none", () => {
    expect(parseMemoryBlock('{"memory":"none"}')).toBe("");
  });

  it("falls back to raw text without JSON", () => {
    expect(parseMemoryBlock("Lives in Lisbon.")).toBe("Lives in Lisbon.");
  });

  it("strips echoed Entity metadata from merged memory", () => {
    expect(
      parseMemoryBlock(
        '{"memory":"Entity: user Profession: frontend developer."}',
      ),
    ).toBe("Profession: frontend developer.");
  });
});

describe("buildMemoryMergeMessages", () => {
  it("includes existing and incoming facts", () => {
    const messages = buildMemoryMergeMessages({
      kind: "user",
      existing: ["Lives in Lisbon."],
      incoming: ["Prefers Doc."],
    });
    expect(messages[1].content).toContain("Lives in Lisbon.");
    expect(messages[1].content).toContain("- Prefers Doc.");
  });

  it("does not use Entity kind in the user payload", () => {
    const messages = buildMemoryMergeMessages({
      kind: "user",
      existing: [],
      incoming: ["Frontend developer."],
    });
    expect(messages[1].content).not.toMatch(/Entity kind/i);
    expect(messages[1].content).toContain("Document subject:");
  });
});

describe("splitMergedMemoryFacts", () => {
  it("splits merged document lines into individual facts", () => {
    expect(
      splitMergedMemoryFacts("Lives in Lisbon.\n- Prefers tea.\n"),
    ).toEqual(["Lives in Lisbon.", "Prefers tea."]);
  });
});

describe("MEMORY_MERGE_SYSTEM", () => {
  it("requires a memory string and forbids scope labels", () => {
    expect(MEMORY_MERGE_SYSTEM).toContain("memory (string)");
    expect(MEMORY_MERGE_SYSTEM).toContain('no "Entity"');
    expect(MEMORY_MERGE_SYSTEM).toContain("Drop duplicates");
  });

  it("organizes personality and bot-interaction lessons", () => {
    expect(MEMORY_MERGE_SYSTEM).toContain("personality");
    expect(MEMORY_MERGE_SYSTEM).toContain("appreciate");
  });
});
