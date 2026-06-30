import type { Message } from "@grammyjs/types";
import { describe, expect, it, vi } from "vitest";
import { checkMessageAddressed } from "../../../src/features/addressing/check-addressed.js";
import { buildBotAddressIdentity } from "../../../src/features/addressing/bot-identity.js";

const ALEX_BOT = buildBotAddressIdentity(
  { id: 100, first_name: "Alex" },
  "alex_helper_bot",
);

function baseConfig() {
  return {
    baseUrl: "http://localhost:8080",
    model: "test",
    botUsername: ALEX_BOT.username,
    botDisplayName: ALEX_BOT.displayName,
    log: {
      logEvent: vi.fn(),
      logEventError: vi.fn(),
    },
    chatComplete: vi.fn().mockResolvedValue('{"name_match":"absent"}'),
  };
}

describe("checkMessageAddressed", () => {
  it("is always addressed in private chats", async () => {
    const log = { logEvent: vi.fn(), logEventError: vi.fn() };
    const result = await checkMessageAddressed(
      {
        chatType: "private",
        chatId: 1,
        userId: 2,
        message: { text: "hi" } as Message,
        bot: ALEX_BOT,
      },
      { ...baseConfig(), log },
    );
    expect(result).toEqual({ addressed: true, source: "private" });
    expect(log.logEvent).toHaveBeenCalledWith(
      "message_addressed",
      expect.objectContaining({ source: "private" }),
    );
  });

  it("detects @username mentions in groups", async () => {
    const result = await checkMessageAddressed(
      {
        chatType: "supergroup",
        message: { text: "hey @alex_helper_bot" } as Message,
        bot: ALEX_BOT,
      },
      baseConfig(),
    );
    expect(result).toEqual({ addressed: true, source: "mention_or_reply" });
  });

  it("detects replies to the bot", async () => {
    const result = await checkMessageAddressed(
      {
        chatType: "supergroup",
        message: { text: "thanks" } as Message,
        bot: ALEX_BOT,
        isReplyToBot: true,
      },
      baseConfig(),
    );
    expect(result).toEqual({ addressed: true, source: "mention_or_reply" });
  });

  it("detects the display name without calling the LLM", async () => {
    const chatComplete = vi.fn();
    const result = await checkMessageAddressed(
      {
        chatType: "supergroup",
        message: { text: "Alex, summarize this thread" } as Message,
        bot: ALEX_BOT,
      },
      { ...baseConfig(), chatComplete },
    );
    expect(result).toEqual({ addressed: true, source: "name" });
    expect(chatComplete).not.toHaveBeenCalled();
  });

  it("does not treat username fragments as the display name", async () => {
    const result = await checkMessageAddressed(
      {
        chatType: "supergroup",
        message: { text: "helper, can you look at this?" } as Message,
        bot: ALEX_BOT,
      },
      baseConfig(),
    );
    expect(result.addressed).toBe(false);
    expect(result.source).toBe("analyzer");
  });

  it("returns no_text when group message has no analyzable text", async () => {
    const result = await checkMessageAddressed(
      {
        chatType: "supergroup",
        message: { sticker: {} } as Message,
        bot: ALEX_BOT,
      },
      baseConfig(),
    );
    expect(result).toEqual({ addressed: false, source: "no_text" });
  });
});
