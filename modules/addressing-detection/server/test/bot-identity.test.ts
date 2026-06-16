import { describe, expect, it } from "vitest";
import {
  buildBotAddressIdentity,
  getBotIdentity,
  messageReferencesBotByName,
  setBotIdentity,
  stripBotAddressing,
  stripCurrentBotAddressing,
} from "../src/bot-identity.js";

describe("runtime bot identity", () => {
  it("setBotIdentity and getBotIdentity share the same runtime state", () => {
    setBotIdentity({ id: 42, first_name: "Test" }, "testbot");
    expect(getBotIdentity().id).toBe(42);
    expect(getBotIdentity().username).toBe("testbot");
  });

  it("stripCurrentBotAddressing uses runtime identity", () => {
    setBotIdentity({ id: 1 }, "mybot");
    expect(stripCurrentBotAddressing("@mybot hello")).toBe("hello");
  });
});

describe("buildBotAddressIdentity", () => {
  it("includes username and derived aliases", () => {
    const bot = buildBotAddressIdentity(
      { id: 1, first_name: "Helper", last_name: "Bot" },
      "helper_bot",
    );
    expect(bot.id).toBe(1);
    expect(bot.username).toBe("helper_bot");
    expect(bot.aliases).toContain("helper_bot");
    expect(bot.aliases).toContain("helper");
    expect(bot.aliases).toContain("helper bot");
  });
});

describe("messageReferencesBotByName", () => {
  const bot = buildBotAddressIdentity(
    { id: 1, first_name: "MyBot" },
    "mybot",
  );

  it("matches a spoken alias in free text", () => {
    expect(messageReferencesBotByName("hey mybot what is up", bot)).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(messageReferencesBotByName("just chatting here", bot)).toBe(false);
  });
});

describe("stripBotAddressing", () => {
  const bot = buildBotAddressIdentity({ id: 1 }, "mybot");

  it("removes @username and spoken aliases", () => {
    expect(stripBotAddressing("@mybot hello mybot", bot)).toBe("hello");
  });
});
