import { describe, expect, it } from "vitest";
import { buildLatestTurnMessage } from "../../src/pipeline/chat-messages.js";

const speaker = { userId: "1000001", label: "Alice (@alice)" };

const recentWindow =
  "[2026-06-29T14:36:39.000Z] [user:alice:1000001 · msg:12350]: first background line\n" +
  "[2026-06-29T14:37:06.000Z] [user:alice:1000001 · msg:12355]: second background line";

describe("buildLatestTurnMessage — current-message anchoring", () => {
  it("emits an explicit [CURRENT MESSAGE] block with a reply pointer when the turn is a reply (the topic-jump bug)", () => {
    const out = buildLatestTurnMessage({
      body: "maybe i will be there, around 8pm",
      speakerTag: "user:alice:1000001",
      replyToMessageId: 12355,
      currentSpeaker: speaker,
      isGroupChat: true,
      recentWindow,
    });

    expect(out).toContain("[CURRENT MESSAGE");
    // The literal current message must be present as its own anchor, not only
    // buried in the recent window.
    const currentBlock = out.slice(out.indexOf("[CURRENT MESSAGE —"));
    expect(currentBlock).toContain("maybe i will be there, around 8pm");
    expect(currentBlock).toContain("user:alice:1000001");
    // It must come AFTER the recent window, so the window reads as background.
    expect(out.indexOf("[RECENT CHAT")).toBeLessThan(out.indexOf("[CURRENT MESSAGE"));
    // The reply pointer steers the model to the replied-to message by id.
    expect(currentBlock).toContain("reply to msg:12355");
  });

  it("anchors the current message even without a reply, when a window is present", () => {
    const out = buildLatestTurnMessage({
      body: "and what do you think?",
      speakerTag: "user:alice:1000001",
      replyToMessageId: null,
      currentSpeaker: speaker,
      isGroupChat: true,
      recentWindow,
    });

    const currentBlock = out.slice(out.indexOf("[CURRENT MESSAGE —"));
    expect(currentBlock).toContain("and what do you think?");
    // No reply → no reply pointer.
    expect(currentBlock).not.toContain("replied to msg:");
  });

  it("leaves a bare turn (no window, no reply) as just the body", () => {
    const out = buildLatestTurnMessage({
      body: "hi",
      speakerTag: null,
      replyToMessageId: null,
      currentSpeaker: null,
      isGroupChat: false,
      recentWindow: null,
    });

    expect(out).toBe("hi");
    expect(out).not.toContain("[CURRENT MESSAGE");
  });

  it("describes the recent window as background that excludes the current message", () => {
    const out = buildLatestTurnMessage({
      body: "maybe i will be there, around 8pm",
      speakerTag: "user:alice:1000001",
      replyToMessageId: 12355,
      currentSpeaker: speaker,
      isGroupChat: true,
      recentWindow,
    });

    const header = out.slice(0, out.indexOf("\n"));
    expect(header).toContain("NOT in this window");
  });
});
