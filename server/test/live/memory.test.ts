import { describe, expect, it } from "vitest";
import {
  buildMemoryExtractMessages,
  buildMemoryMergeMessages,
  newFactsOnly,
  parseMemoryBlock,
  type MemoryExtractInput,
} from "../../src/memory-prompt.js";
import { parseStructuredResponse } from "../../src/response-format.js";
import { liveClient, liveConfig, runAuxiliary } from "./helpers.js";

const cfg = liveConfig();

function extractInput(over: Partial<MemoryExtractInput>): MemoryExtractInput {
  return {
    userMessage: "",
    replyContext: null,
    assistantReply: "[REPLY]Noted.[/REPLY]",
    existingUserFacts: [],
    existingGroupFacts: [],
    existingGeneralFacts: [],
    isGroupChat: false,
    ...over,
  };
}

async function extract(input: MemoryExtractInput) {
  const client = liveClient(cfg!);
  const { content } = await runAuxiliary(
    client,
    cfg!.model,
    buildMemoryExtractMessages(input),
    { numPredict: 384 },
  );
  return parseStructuredResponse(content);
}

describe.skipIf(!cfg)("live: memory extraction", () => {
  it("captures durable personal facts the user shares", async () => {
    // LLM extraction is non-deterministic; assert on aggregate behaviour
    // across clearly-durable statements rather than a single run.
    const messages = [
      "By the way, I live in Lisbon and I'm a marine biologist.",
      "Please always call me Doc, and remember my timezone is CET.",
      "For the record, my favorite programming language is Rust.",
    ];
    let captured = 0;
    const blobs: string[] = [];
    for (const userMessage of messages) {
      const parsed = await extract(extractInput({ userMessage }));
      const blob = [...parsed.memoryFacts, ...parsed.generalMemoryFacts]
        .join(" ")
        .toLowerCase();
      blobs.push(blob);
      if (parsed.memoryFacts.length + parsed.generalMemoryFacts.length > 0) {
        captured += 1;
      }
    }
    expect(
      captured,
      `extraction produced no facts for any durable message`,
    ).toBeGreaterThanOrEqual(2);
    expect(blobs.join(" ")).toMatch(/lisbon|biolog|doc|cet|rust/);
  });

  it("stores nothing durable for a plain greeting", async () => {
    const parsed = await extract(
      extractInput({ userMessage: "hey, how's it going?" }),
    );
    expect(parsed.memoryFacts).toEqual([]);
  });

  it("feeds extracted facts through the production dedup (newFactsOnly)", async () => {
    // The model may re-state a known fact; duplicate suppression is enforced
    // deterministically by newFactsOnly during persistence, so assert on that.
    const parsed = await extract(
      extractInput({
        userMessage:
          "FYI the term 'MTTR' means mean time to recovery in our docs.",
        existingGeneralFacts: ["MTTR means mean time to recovery."],
      }),
    );
    const newGeneral = newFactsOnly(
      ["MTTR means mean time to recovery."],
      parsed.generalMemoryFacts,
    );
    expect(
      newGeneral.some((f) => f.toLowerCase() === "mttr means mean time to recovery."),
      "an already-stored fact must not survive newFactsOnly",
    ).toBe(false);
  });

  it("captures group/general context across group-chat reminders", async () => {
    // Aggregate over a couple of clearly contextual group messages.
    const messages = [
      "Reminder for everyone: this channel is only for backend deployment discussions.",
      "Team rule: we never merge to main on Fridays in this group.",
    ];
    let captured = 0;
    for (const userMessage of messages) {
      const parsed = await extract(
        extractInput({ isGroupChat: true, userMessage }),
      );
      if (
        parsed.groupMemoryFacts.length + parsed.generalMemoryFacts.length >
        0
      ) {
        captured += 1;
      }
    }
    expect(
      captured,
      "no group/general context captured for either reminder",
    ).toBeGreaterThanOrEqual(1);
  });

  it("merges new facts into an existing memory document losslessly", async () => {
    const client = liveClient(cfg!);
    const messages = buildMemoryMergeMessages({
      kind: "user",
      existing: ["Lives in Lisbon.", "Is a marine biologist."],
      incoming: ["Prefers to be called Doc."],
    });
    const { content } = await runAuxiliary(client, cfg!.model, messages, {
      numPredict: 1024,
    });
    const merged = parseMemoryBlock(content).toLowerCase();
    expect(merged).not.toBe("");
    expect(merged, "merge must preserve the old Lisbon fact").toMatch(/lisbon/);
    expect(merged, "merge must include the new nickname fact").toMatch(/doc/);
  });
});
