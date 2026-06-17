import { describe, expect, it } from "vitest";
import {
  EXTRACTOR_SYSTEM,
  MEMORY_MERGE_SYSTEM,
  MEMORY_USAGE_PREAMBLE,
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
  it("parses all memory scopes from JSON", () => {
    expect(
      parseMemoryExtract(
        JSON.stringify({
          user_facts: ["Lives in Lisbon."],
          observed_user_facts: [
            { user_id: "42", facts: ["Hates spoilers."] },
          ],
          group_facts: ["Backend-only channel."],
          general_facts: ["MTTR means mean time to recovery."],
        }),
      ),
    ).toEqual({
      userFacts: ["Lives in Lisbon."],
      observedUserFacts: [{ userId: "42", facts: ["Hates spoilers."] }],
      groupFacts: ["Backend-only channel."],
      generalFacts: ["MTTR means mean time to recovery."],
    });
  });

  it("filters none entries from arrays", () => {
    expect(
      parseMemoryExtract(
        JSON.stringify({
          user_facts: ["none"],
          observed_user_facts: [],
          group_facts: [],
          general_facts: [],
        }),
      ),
    ).toEqual({
      userFacts: [],
      observedUserFacts: [],
      groupFacts: [],
      generalFacts: [],
    });
  });

  it("skips observed entries without user_id or facts", () => {
    expect(
      parseMemoryExtract(
        JSON.stringify({
          user_facts: [],
          observed_user_facts: [
            { user_id: "", facts: ["x"] },
            { user_id: "1", facts: [] },
          ],
          group_facts: [],
          general_facts: [],
        }),
      ),
    ).toEqual({
      userFacts: [],
      observedUserFacts: [],
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
    expect(messages[1].content).toContain("observed_user_facts");
  });

  it("lists already-stored facts and known participants", () => {
    const messages = buildMemoryExtractMessages(
      input({
        userMessage: "hi",
        existingUserFacts: ["Lives in Lisbon."],
        knownParticipants: [{ userId: "1", label: "Alice" }],
        currentSpeaker: { userId: "2", label: "Bob" },
      }),
    );
    expect(messages[1].content).toContain("Lives in Lisbon.");
    expect(messages[1].content).toContain("id 1: Alice");
    expect(messages[1].content).toContain("Current speaker: Bob");
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

  it("builds system-prompt memory sections with evolution guidance", () => {
    expect(MEMORY_USAGE_PREAMBLE).toContain("evolve");
    expect(buildGeneralMemorySection(["Fact one."])).toContain(
      "bot-wide lessons",
    );
    expect(buildGroupMemorySection(["Group norm."])).toContain(
      "culture and how to behave",
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
  it("requires JSON with four memory fields", () => {
    expect(EXTRACTOR_SYSTEM).toContain("user_facts");
    expect(EXTRACTOR_SYSTEM).toContain("observed_user_facts");
    expect(EXTRACTOR_SYSTEM).toContain("group_facts");
    expect(EXTRACTOR_SYSTEM).toContain("general_facts");
    expect(EXTRACTOR_SYSTEM).toContain("Respond with JSON only");
  });

  it("covers personality, preferences, and bot feedback", () => {
    expect(EXTRACTOR_SYSTEM).toContain("personality");
    expect(EXTRACTOR_SYSTEM).toContain("appreciate");
    expect(EXTRACTOR_SYSTEM).toContain("annoying");
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
