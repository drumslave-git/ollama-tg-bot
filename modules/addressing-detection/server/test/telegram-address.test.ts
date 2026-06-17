import type { Message } from "@grammyjs/types";
import { describe, expect, it } from "vitest";
import {
  isMessageForBot,
  messageHasBotUsernameMention,
  sliceEntity,
} from "../src/telegram-address.js";

const BOT = { id: 100, username: "mybot" };

function input(over: {
  chatType?: string;
  message?: Record<string, unknown> | undefined;
}) {
  return {
    chatType: over.chatType ?? "supergroup",
    message: over.message as Message | undefined,
    bot: BOT,
  };
}

describe("sliceEntity", () => {
  it("slices by UTF-16 offset and length", () => {
    expect(sliceEntity("hi @mybot!", 3, 6)).toBe("@mybot");
  });
});

describe("isMessageForBot", () => {
  it("is true for any private message", () => {
    expect(
      isMessageForBot(input({ chatType: "private", message: { text: "hi" } })),
    ).toBe(true);
  });

  it("is false for an unrelated group message", () => {
    expect(isMessageForBot(input({ message: { text: "just chatting" } }))).toBe(
      false,
    );
  });

  it("is true when the bot @username is mentioned (plain text)", () => {
    expect(
      isMessageForBot(input({ message: { text: "hey @mybot help" } })),
    ).toBe(true);
  });

  it("is true for a mention entity matching the bot", () => {
    expect(
      isMessageForBot(
        input({
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
        input({
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

  it("is true when isReplyToBot is set", () => {
    expect(
      isMessageForBot({
        ...input({ message: { text: "thanks" } }),
        isReplyToBot: true,
      }),
    ).toBe(true);
  });

  it("is true for a command targeted at the bot", () => {
    expect(
      isMessageForBot(
        input({
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
        input({
          message: {
            text: "/start@otherbot",
            entities: [{ type: "bot_command", offset: 0, length: 15 }],
          },
        }),
      ),
    ).toBe(false);
  });
});

describe("messageHasBotUsernameMention", () => {
  it("is true for a plain @username mention", () => {
    expect(
      messageHasBotUsernameMention(
        { text: "hey @mybot help" } as never,
        BOT.id,
        BOT.username,
      ),
    ).toBe(true);
  });

  it("is false for a reply without an @mention", () => {
    expect(
      messageHasBotUsernameMention({ text: "thanks" } as never, BOT.id, BOT.username),
    ).toBe(false);
  });

  it("is false for display-name-only text", () => {
    expect(
      messageHasBotUsernameMention({ text: "hey mybot" } as never, BOT.id, BOT.username),
    ).toBe(false);
  });
});
