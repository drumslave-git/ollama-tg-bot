import { describe, expect, it } from "vitest";
import { buildLatestTurnMessage } from "../../src/pipeline/chat-messages.js";

const speaker = { userId: "381512221", label: "R.K. (@rok13)" };

const replyThread =
  "[REPLY THREAD — oldest first; the last step is from the person you answer now]\n" +
  "1. Bot: ви сьогодні граєте?\n" +
  "2. R.K. (@rok13) [CURRENT SPEAKER — reply to them] (replying to Bot): Та може буду, десь о 20";

const recentWindow =
  "[2026-06-29T14:36:39.000Z] [user:rok13:381512221]: В мене девопси срали в джиру\n" +
  "[2026-06-29T14:37:06.000Z] [user:rok13:381512221]: Так шо не тіки манагери";

describe("buildLatestTurnMessage — current-message anchoring", () => {
  it("emits an explicit [CURRENT MESSAGE] block carrying the literal body when the turn is a reply (the topic-jump bug)", () => {
    const out = buildLatestTurnMessage({
      body: "Та може буду, десь о 20",
      speakerTag: "user:rok13:381512221",
      replyContext: replyThread,
      currentSpeaker: speaker,
      isGroupChat: true,
      recentWindow,
    });

    expect(out).toContain("[CURRENT MESSAGE");
    // The literal current message must be present as its own anchor, not only
    // buried as the last step of the reply thread.
    const currentBlock = out.slice(out.indexOf("[CURRENT MESSAGE"));
    expect(currentBlock).toContain("Та може буду, десь о 20");
    expect(currentBlock).toContain("user:rok13:381512221");
    // It must come AFTER the recent window, so the window reads as background.
    expect(out.indexOf("[RECENT CHAT")).toBeLessThan(out.indexOf("[CURRENT MESSAGE"));
    // The reply hint steers the model to the reply link, not the window tail.
    expect(currentBlock).toMatch(/reply/i);
  });

  it("anchors the current message even without a reply, when a window is present", () => {
    const out = buildLatestTurnMessage({
      body: "а ти що думаєш?",
      speakerTag: "user:rok13:381512221",
      replyContext: null,
      currentSpeaker: speaker,
      isGroupChat: true,
      recentWindow,
    });

    const currentBlock = out.slice(out.indexOf("[CURRENT MESSAGE"));
    expect(currentBlock).toContain("а ти що думаєш?");
    // No reply thread → no reply pointer.
    expect(currentBlock).not.toMatch(/\[REPLY CONTEXT\] above/);
  });

  it("leaves a bare turn (no window, no reply) as just the body", () => {
    const out = buildLatestTurnMessage({
      body: "привіт",
      speakerTag: null,
      replyContext: null,
      currentSpeaker: null,
      isGroupChat: false,
      recentWindow: null,
    });

    expect(out).toBe("привіт");
    expect(out).not.toContain("[CURRENT MESSAGE");
  });

  it("describes the recent window as background that excludes the current message", () => {
    const out = buildLatestTurnMessage({
      body: "Та може буду, десь о 20",
      speakerTag: "user:rok13:381512221",
      replyContext: replyThread,
      currentSpeaker: speaker,
      isGroupChat: true,
      recentWindow,
    });

    const header = out.slice(0, out.indexOf("\n"));
    expect(header).toContain("NOT in this window");
  });
});
