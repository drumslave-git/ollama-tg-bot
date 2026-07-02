import { describe, expect, it } from "vitest";
import { replyOpensByAddressing } from "../../src/bot/messages/mentions.js";
import type { KnownUserRecord } from "../../src/db/users/known-users.js";

const alice: KnownUserRecord = {
  userId: "424242",
  username: "alice_w",
  firstName: "Alice",
  lastName: null,
};

describe("replyOpensByAddressing — directed-at vs merely-mentioned", () => {
  it("true when the reply opens with the participant's @mention (referral)", () => {
    expect(
      replyOpensByAddressing("@alice_w you should stop doing that", alice),
    ).toBe(true);
  });

  it("true when the reply opens with a vocative name", () => {
    expect(replyOpensByAddressing("Alice, stop doing that", alice)).toBe(true);
    expect(replyOpensByAddressing("Alice: stop", alice)).toBe(true);
  });

  it("false when the participant is only mentioned mid-sentence (the regression)", () => {
    // The reply answers the speaker and merely references @alice_w — must NOT be
    // treated as addressed to alice, so it stays a threaded reply.
    expect(
      replyOpensByAddressing(
        "Your defense doesn't make me any less cynical, but at least it's nicer than the shouting from @alice_w.",
        alice,
      ),
    ).toBe(false);
  });

  it("false when the name appears mid-sentence as a reference, not an address", () => {
    expect(replyOpensByAddressing("Alice said that earlier, not me", alice)).toBe(
      false,
    );
    expect(replyOpensByAddressing("I think Alice is right", alice)).toBe(false);
  });

  it("false for an empty or unrelated reply", () => {
    expect(replyOpensByAddressing("I'm fine, thanks", alice)).toBe(false);
    expect(replyOpensByAddressing("", alice)).toBe(false);
  });
});
