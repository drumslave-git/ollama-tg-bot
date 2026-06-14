import { describe, expect, it } from "vitest";
import {
  buildMemoryExtractMessages,
  buildMemoryMergeMessages,
  newFactsOnly,
  parseMemoryBlock,
  type MemoryExtractInput,
} from "../../src/memory-prompt.js";

function input(over: Partial<MemoryExtractInput>): MemoryExtractInput {
  return {
    userMessage: "",
    replyContext: null,
    assistantReply: "[REPLY]ok[/REPLY]",
    existingUserFacts: [],
    existingGroupFacts: [],
    existingGeneralFacts: [],
    isGroupChat: false,
    ...over,
  };
}

describe("parseMemoryBlock", () => {
  it("extracts a merged memory document", () => {
    expect(parseMemoryBlock("[MEMORY]\nLives in Lisbon.\nLikes tea.\n[/MEMORY]")).toBe(
      "Lives in Lisbon.\nLikes tea.",
    );
  });

  it("returns empty string for none", () => {
    expect(parseMemoryBlock("[MEMORY]\nnone\n[/MEMORY]")).toBe("");
  });

  it("falls back to raw text without tags", () => {
    expect(parseMemoryBlock("Lives in Lisbon.")).toBe("Lives in Lisbon.");
  });
});

describe("buildMemoryExtractMessages", () => {
  it("marks a non-group chat to force none in [GROUP_MEMORY]", () => {
    const messages = buildMemoryExtractMessages(
      input({ userMessage: "hi", isGroupChat: false }),
    );
    expect(messages[1].content).toContain("Not a group chat");
  });

  it("lists already-stored facts", () => {
    const messages = buildMemoryExtractMessages(
      input({ userMessage: "hi", existingUserFacts: ["Lives in Lisbon."] }),
    );
    expect(messages[1].content).toContain("Lives in Lisbon.");
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
});

describe("newFactsOnly", () => {
  it("drops duplicates case-insensitively and short noise", () => {
    expect(
      newFactsOnly(["Lives in Lisbon."], ["lives in lisbon.", "Likes tea", "x"]),
    ).toEqual(["Likes tea"]);
  });
});
