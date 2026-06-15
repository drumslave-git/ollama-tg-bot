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
    assistantReply: '{"reply":"ok"}',
    existingUserFacts: [],
    existingGroupFacts: [],
    existingGeneralFacts: [],
    isGroupChat: false,
    ...over,
  };
}

describe("parseMemoryExtract", () => {
  it("parses all three memory scopes from JSON", () => {
    expect(
      parseMemoryExtract(
        JSON.stringify({
          user_facts: ["Lives in Lisbon."],
          group_facts: [],
          general_facts: ["MTTR means mean time to recovery."],
        }),
      ),
    ).toEqual({
      userFacts: ["Lives in Lisbon."],
      groupFacts: [],
      generalFacts: ["MTTR means mean time to recovery."],
    });
  });

  it("filters none entries from arrays", () => {
    expect(
      parseMemoryExtract(
        JSON.stringify({
          user_facts: ["none"],
          group_facts: [],
          general_facts: [],
        }),
      ),
    ).toEqual({
      userFacts: [],
      groupFacts: [],
      generalFacts: [],
    });
  });
});

describe("parseMemoryBlock", () => {
  it("extracts a merged memory document", () => {
    expect(
      parseMemoryBlock(
        '{"memory":"Lives in Lisbon.\\nLikes tea."}',
      ),
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

describe("buildMemoryExtractMessages", () => {
  it("marks a non-group chat to force empty group_facts", () => {
    const messages = buildMemoryExtractMessages(
      input({ userMessage: "hi", isGroupChat: false }),
    );
    expect(messages[1].content).toContain("Not a group chat");
    expect(messages[1].content).toContain("user_facts, group_facts");
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
  it("requires JSON with three fact arrays", () => {
    expect(EXTRACTOR_SYSTEM).toContain("user_facts");
    expect(EXTRACTOR_SYSTEM).toContain("group_facts");
    expect(EXTRACTOR_SYSTEM).toContain("general_facts");
    expect(EXTRACTOR_SYSTEM).toContain("Respond with JSON only");
  });
});

describe("MEMORY_MERGE_SYSTEM", () => {
  it("requires a memory string and forbids scope labels", () => {
    expect(MEMORY_MERGE_SYSTEM).toContain("memory (string)");
    expect(MEMORY_MERGE_SYSTEM).toContain('no "Entity"');
    expect(MEMORY_MERGE_SYSTEM).toContain("Drop duplicates");
  });
});
