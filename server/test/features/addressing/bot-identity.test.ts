import { describe, expect, it } from "vitest";
import {
  buildBotAddressIdentity,
  displayNameMatchable,
  getBotIdentity,
  messageReferencesBotByName,
  setBotIdentity,
  stripBotAddressing,
  stripCurrentBotAddressing,
} from "../../../src/features/addressing/bot-identity.js";

const ALEX_BOT = buildBotAddressIdentity(
  { id: 1, first_name: "Alex" },
  "alex_helper_bot",
);

describe("runtime bot identity", () => {
  it("setBotIdentity and getBotIdentity share the same runtime state", () => {
    setBotIdentity({ id: 42, first_name: "Test" }, "testbot");
    expect(getBotIdentity().id).toBe(42);
    expect(getBotIdentity().username).toBe("testbot");
  });

  it("stripCurrentBotAddressing uses runtime identity", () => {
    setBotIdentity({ id: 1, first_name: "Alex" }, "alex_helper_bot");
    expect(stripCurrentBotAddressing("@alex_helper_bot hello Alex")).toBe("hello");
  });
});

describe("buildBotAddressIdentity", () => {
  it("keeps username and Telegram first name only", () => {
    expect(ALEX_BOT.username).toBe("alex_helper_bot");
    expect(ALEX_BOT.displayName).toBe("Alex");
  });

  it("does not derive spoken names from the username", () => {
    expect(ALEX_BOT.displayName).not.toContain("helper");
  });
});

describe("displayNameMatchable", () => {
  it("accepts a normal display name", () => {
    expect(displayNameMatchable("Alex")).toBe(true);
  });

  it("rejects short and generic display names", () => {
    expect(displayNameMatchable("AI")).toBe(false);
    expect(displayNameMatchable("bot")).toBe(false);
  });
});

describe("messageReferencesBotByName", () => {
  it("matches the display name in free text", () => {
    expect(messageReferencesBotByName("Alex, what do you think?", ALEX_BOT)).toBe(
      true,
    );
  });

  it("does not match the username without @", () => {
    expect(messageReferencesBotByName("hey alex_helper_bot help", ALEX_BOT)).toBe(
      false,
    );
  });

  it("does not match username-derived words", () => {
    expect(messageReferencesBotByName("hey helper can you check this", ALEX_BOT)).toBe(
      false,
    );
  });

  it("does not match unrelated text", () => {
    expect(messageReferencesBotByName("just chatting here", ALEX_BOT)).toBe(false);
  });

  it("does not match generic English words used as display names", () => {
    const cloudBot = buildBotAddressIdentity(
      { id: 2, first_name: "Cloud" },
      "IgorTCloudBot",
    );
    expect(
      messageReferencesBotByName("move everything to the cloud next week", cloudBot),
    ).toBe(false);
  });
});

describe("stripBotAddressing", () => {
  it("removes @username and display-name mentions", () => {
    expect(stripBotAddressing("@alex_helper_bot hello Alex", ALEX_BOT)).toBe("hello");
  });
});
