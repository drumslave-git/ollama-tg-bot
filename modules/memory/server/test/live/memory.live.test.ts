import { describe, expect, it } from "vitest";
import {
  buildMemoryExtractMessages,
  buildMemoryMergeMessages,
  extractMemories,
  mergeMemoryDocument,
  parseMemoryBlock,
  type MemoryExtractInput,
} from "../../src/index.js";

interface LiveConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

function liveConfig(): LiveConfig | null {
  const rawBase = process.env.LLM_BASE_URL?.trim();
  const model = process.env.LLM_MODEL?.trim();
  if (!rawBase || !model) return null;
  const baseUrl = rawBase.replace(/\/v1\/?$/, "");
  return {
    baseUrl,
    model,
    apiKey: (process.env.LLM_API_KEY ?? "").trim() || "not-needed",
  };
}

const cfg = liveConfig();

function extractInput(over: Partial<MemoryExtractInput>): MemoryExtractInput {
  return {
    userMessage: "",
    replyContext: null,
    assistantReply: '{"reply":"Noted."}',
    existingUserFacts: [],
    existingGroupFacts: [],
    existingGeneralFacts: [],
    isGroupChat: false,
    ...over,
  };
}

function llmConfig() {
  return {
    baseUrl: cfg!.baseUrl,
    model: cfg!.model,
    apiKey: cfg!.apiKey,
  };
}

describe.skipIf(!cfg)("live: memory module", () => {
  it("captures durable personal facts the user shares", async () => {
    const messages = [
      "By the way, I live in Lisbon and I'm a marine biologist.",
      "Please always call me Doc, and remember my timezone is CET.",
      "For the record, my favorite programming language is Rust.",
    ];
    let captured = 0;
    const blobs: string[] = [];
    for (const userMessage of messages) {
      const parsed = await extractMemories(
        extractInput({ userMessage }),
        llmConfig(),
      );
      const blob = [...parsed.userFacts, ...parsed.generalFacts]
        .join(" ")
        .toLowerCase();
      blobs.push(blob);
      if (parsed.userFacts.length + parsed.generalFacts.length > 0) {
        captured += 1;
      }
    }
    expect(
      captured,
      "extraction produced no facts for any durable message",
    ).toBeGreaterThanOrEqual(2);
    expect(blobs.join(" ")).toMatch(/lisbon|biolog|doc|cet|rust/);
  });

  it("stores nothing durable for a plain greeting", async () => {
    const parsed = await extractMemories(
      extractInput({ userMessage: "hey, how's it going?" }),
      llmConfig(),
    );
    expect(parsed.userFacts).toEqual([]);
  });

  it("merge drops duplicate general knowledge when incoming repeats existing", async () => {
    const merged = await mergeMemoryDocument(
      {
        kind: "general",
        existing: ["MTTR means mean time to recovery."],
        incoming: ["MTTR is mean time to recovery."],
      },
      llmConfig(),
    );
    const lower = merged.toLowerCase();
    expect(lower).not.toBe("");
    expect(lower.match(/mttr/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it("captures group/general context across group-chat reminders", async () => {
    const messages = [
      "Reminder for everyone: this channel is only for backend deployment discussions.",
      "Team rule: we never merge to main on Fridays in this group.",
    ];
    let captured = 0;
    for (const userMessage of messages) {
      const parsed = await extractMemories(
        extractInput({ isGroupChat: true, userMessage }),
        llmConfig(),
      );
      if (parsed.groupFacts.length + parsed.generalFacts.length > 0) {
        captured += 1;
      }
    }
    expect(
      captured,
      "no group/general context captured for either reminder",
    ).toBeGreaterThanOrEqual(1);
  });

  it("merges new facts into an existing memory document losslessly", async () => {
    const merged = await mergeMemoryDocument(
      {
        kind: "user",
        existing: ["Lives in Lisbon.", "Is a marine biologist."],
        incoming: ["Prefers to be called Doc."],
      },
      llmConfig(),
    );
    const lower = merged.toLowerCase();
    expect(lower).not.toBe("");
    expect(lower, "merge must preserve the old Lisbon fact").toMatch(/lisbon/);
    expect(lower, "merge must include the new nickname fact").toMatch(/doc/);
  });

  it("builds extract messages with the JSON format reminder", () => {
    const messages = buildMemoryExtractMessages(
      extractInput({ userMessage: "remember this" }),
    );
    expect(messages[1].content).toContain(
      "user_facts, observed_user_facts, group_facts, and general_facts",
    );
  });

  it("builds merge messages with the JSON format reminder", () => {
    const messages = buildMemoryMergeMessages({
      kind: "user",
      existing: ["Lives in Lisbon."],
      incoming: ["Prefers Doc."],
    });
    expect(messages[1].content).toContain("Return JSON with a memory field");
  });
});
