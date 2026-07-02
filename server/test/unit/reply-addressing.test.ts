import { describe, expect, it } from "vitest";
import { replyOpensByAddressing } from "../../src/bot/messages/mentions.js";
import type { KnownUserRecord } from "../../src/db/users/known-users.js";

const rok: KnownUserRecord = {
  userId: "381512221",
  username: "rok13",
  firstName: "Rok",
  lastName: null,
};

describe("replyOpensByAddressing — directed-at vs merely-mentioned", () => {
  it("true when the reply opens with the participant's @mention (referral)", () => {
    expect(
      replyOpensByAddressing("@rok13 you should stop doing that", rok),
    ).toBe(true);
  });

  it("true when the reply opens with a vocative name", () => {
    expect(replyOpensByAddressing("Rok, перестань це робити", rok)).toBe(true);
    expect(replyOpensByAddressing("Rok: stop", rok)).toBe(true);
  });

  it("false when the participant is only mentioned mid-sentence (the regression)", () => {
    // The reply answers the speaker and merely references @rok13 — must NOT be
    // treated as addressed to rok13, so it stays a threaded reply.
    expect(
      replyOpensByAddressing(
        "Твій захист не робить мене менш цинічним, але принаймні це приємніше за вигуки від @rok13.",
        rok,
      ),
    ).toBe(false);
  });

  it("false when the name appears mid-sentence as a reference, not an address", () => {
    expect(replyOpensByAddressing("Rok said that earlier, not me", rok)).toBe(
      false,
    );
    expect(replyOpensByAddressing("I think Rok is right", rok)).toBe(false);
  });

  it("false for an empty or unrelated reply", () => {
    expect(replyOpensByAddressing("I'm fine, thanks", rok)).toBe(false);
    expect(replyOpensByAddressing("", rok)).toBe(false);
  });
});
