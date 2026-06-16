import type { Message } from "@grammyjs/types";
import { describe, expect, it, vi } from "vitest";
import { checkMessageAddressed } from "../src/check-addressed.js";
import { buildBotAddressIdentity } from "../src/bot-identity.js";

const BOT = buildBotAddressIdentity({ id: 100, first_name: "My" }, "mybot");

function baseConfig() {
  return {
    baseUrl: "http://localhost:8080",
    model: "test",
    botAliases: [BOT.username, ...BOT.aliases],
    log: {
      logEvent: vi.fn(),
      logEventError: vi.fn(),
    },
    chatComplete: vi.fn().mockResolvedValue('{"addressed":true}'),
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
        bot: BOT,
      },
      { ...baseConfig(), log },
    );
    expect(result).toEqual({ addressed: true, source: "private" });
    expect(log.logEvent).toHaveBeenCalledWith(
      "message_addressed",
      expect.objectContaining({ source: "private" }),
    );
  });

  it("detects @mention in groups", async () => {
    const result = await checkMessageAddressed(
      {
        chatType: "supergroup",
        message: { text: "hey @mybot" } as Message,
        bot: BOT,
      },
      baseConfig(),
    );
    expect(result).toEqual({ addressed: true, source: "mention_or_reply" });
  });

  it("returns no_text when group message has no analyzable text", async () => {
    const result = await checkMessageAddressed(
      {
        chatType: "supergroup",
        message: { sticker: {} } as Message,
        bot: BOT,
      },
      baseConfig(),
    );
    expect(result).toEqual({ addressed: false, source: "no_text" });
  });
});
