import type { Context } from "grammy";
import { describe, expect, it } from "vitest";
import {
  isMessageForBot,
  isSlashCommandMessage,
  sliceEntity,
} from "../../src/bot/addressed.js";

const BOT = { id: 100, username: "mybot" };

function ctx(over: {
  chatType?: string;
  message?: Record<string, unknown> | undefined;
}): Context {
  return {
    me: BOT,
    chat: { type: over.chatType ?? "supergroup" },
    message: over.message,
  } as unknown as Context;
}

describe("sliceEntity", () => {
  it("slices by UTF-16 offset and length", () => {
    expect(sliceEntity("hi @mybot!", 3, 6)).toBe("@mybot");
  });
});

describe("isMessageForBot", () => {
  it("is true for any private message", () => {
    expect(
      isMessageForBot(ctx({ chatType: "private", message: { text: "hi" } })),
    ).toBe(true);
  });

  it("is false for an unrelated group message", () => {
    expect(
      isMessageForBot(ctx({ message: { text: "just chatting" } })),
    ).toBe(false);
  });

  it("is true when the bot @username is mentioned (plain text)", () => {
    expect(
      isMessageForBot(ctx({ message: { text: "hey @mybot help" } })),
    ).toBe(true);
  });

  it("is true for a mention entity matching the bot", () => {
    expect(
      isMessageForBot(
        ctx({
          message: {
            text: "yo @mybot",
            entities: [{ type: "mention", offset: 3, length: 6 }],
          },
        }),
      ),
    ).toBe(true);
  });

  it("is true for a text_mention entity matching the bot id", () => {
    expect(
      isMessageForBot(
        ctx({
          message: {
            text: "yo bot",
            entities: [
              { type: "text_mention", offset: 3, length: 3, user: { id: 100 } },
            ],
          },
        }),
      ),
    ).toBe(true);
  });

  it("is true for a reply to the bot's message", () => {
    expect(
      isMessageForBot(
        ctx({ message: { text: "thanks", reply_to_message: { from: { id: 100 } } } }),
      ),
    ).toBe(true);
  });

  it("is true for a command targeted at the bot", () => {
    expect(
      isMessageForBot(
        ctx({
          message: {
            text: "/start@mybot",
            entities: [{ type: "bot_command", offset: 0, length: 12 }],
          },
        }),
      ),
    ).toBe(true);
  });

  it("is false for a command targeted at another bot", () => {
    expect(
      isMessageForBot(
        ctx({
          message: {
            text: "/start@otherbot",
            entities: [{ type: "bot_command", offset: 0, length: 15 }],
          },
        }),
      ),
    ).toBe(false);
  });
});

describe("isSlashCommandMessage", () => {
  it("detects a leading slash", () => {
    expect(isSlashCommandMessage(ctx({ message: { text: "/reset" } }))).toBe(
      true,
    );
    expect(isSlashCommandMessage(ctx({ message: { text: "hello" } }))).toBe(
      false,
    );
  });
});
