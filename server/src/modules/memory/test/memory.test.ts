import { describe, expect, it } from "vitest";
import {
  EXTRACTOR_SYSTEM,
  MEMORY_MERGE_SYSTEM,
  buildExplainGeneralMemorySection,
  buildGeneralMemorySection,
  buildGroupMemorySection,
  buildMemoryExtractMessages,
  buildMemoryMergeMessages,
  buildParticipantMemoriesSection,
  formatGeneralMemoryForPrompt,
  parseMemoryBlock,
  parseMemoryExtract,
  splitMergedMemoryFacts,
  type MemoryExtractInput,
} from "../src/index.js";

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

describe("parseMemoryExtract", () => {
  it("parses all three memory scopes from closed blocks", () => {
    expect(
      parseMemoryExtract(
        "[MEMORY]\nLives in Lisbon.\n[/MEMORY]\n" +
          "[GROUP_MEMORY]\nnone\n[/GROUP_MEMORY]\n" +
          "[GENERAL_MEMORY]\nMTTR means mean time to recovery.\n[/GENERAL_MEMORY]",
      ),
    ).toEqual({
      userFacts: ["Lives in Lisbon."],
      groupFacts: [],
      generalFacts: ["MTTR means mean time to recovery."],
    });
  });

  it("uses the last closed block when reasoning quotes the format", () => {
    expect(
      parseMemoryExtract(
        "Example: [MEMORY]\nold\n[/MEMORY]\n" +
          "[MEMORY]\nLikes tea.\n[/MEMORY]\n" +
          "[GROUP_MEMORY]\nnone\n[/GROUP_MEMORY]\n" +
          "[GENERAL_MEMORY]\nnone\n[/GENERAL_MEMORY]",
      ),
    ).toEqual({
      userFacts: ["Likes tea."],
      groupFacts: [],
      generalFacts: [],
    });
  });
});

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

  it("strips echoed Entity metadata from merged memory", () => {
    expect(
      parseMemoryBlock(
        "[MEMORY]\nEntity: user Profession: frontend developer.\n[/MEMORY]",
      ),
    ).toBe("Profession: frontend developer.");
  });
});

describe("buildMemoryExtractMessages", () => {
  it("marks a non-group chat to force none in [GROUP_MEMORY]", () => {
    const messages = buildMemoryExtractMessages(
      input({ userMessage: "hi", isGroupChat: false }),
    );
    expect(messages[1].content).toContain("Not a group chat");
    expect(messages[1].content).toContain("three required");
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

describe("memory injection", () => {
  it("formats general facts as a bullet list", () => {
    expect(formatGeneralMemoryForPrompt(["Fact one."])).toBe("- Fact one.");
    expect(formatGeneralMemoryForPrompt([])).toContain("No general facts");
  });

  it("builds system-prompt memory sections", () => {
    expect(buildGeneralMemorySection(["Fact one."])).toContain(
      "## General knowledge (all chats)",
    );
    expect(buildGroupMemorySection(["Group norm."])).toContain(
      "## Known facts about this group",
    );
    expect(
      buildParticipantMemoriesSection([
        { userId: "1", label: "Alice", facts: ["Lives in Lisbon."] },
      ]),
    ).toContain("### Alice (id: 1)");
    expect(buildExplainGeneralMemorySection(["Fact one."])).toContain(
      "### General memories",
    );
  });
});

describe("EXTRACTOR_SYSTEM", () => {
  it("requires all three memory blocks", () => {
    expect(EXTRACTOR_SYSTEM).toContain("[MEMORY]");
    expect(EXTRACTOR_SYSTEM).toContain("[GROUP_MEMORY]");
    expect(EXTRACTOR_SYSTEM).toContain("[GENERAL_MEMORY]");
    expect(EXTRACTOR_SYSTEM).toContain("three blocks");
  });
});

describe("MEMORY_MERGE_SYSTEM", () => {
  it("requires a single [MEMORY] block and forbids scope labels", () => {
    expect(MEMORY_MERGE_SYSTEM).toContain("[MEMORY]");
    expect(MEMORY_MERGE_SYSTEM).toContain("exactly one block");
    expect(MEMORY_MERGE_SYSTEM).toContain('no "Entity"');
    expect(MEMORY_MERGE_SYSTEM).toContain("Drop duplicates");
  });
});

