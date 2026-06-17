import { describe, expect, it } from "vitest";
import { isSlashCommandMessage } from "../../src/bot/commands/slash-command.js";

function ctxWithText(text: string | undefined) {
  return { message: text != null ? { text } : undefined };
}

describe("isSlashCommandMessage", () => {
  it("detects a leading slash on text messages", () => {
    expect(isSlashCommandMessage(ctxWithText("/reset") as never)).toBe(true);
    expect(isSlashCommandMessage(ctxWithText("hello") as never)).toBe(false);
  });

  it("detects slash commands in captions", () => {
    expect(
      isSlashCommandMessage({ message: { caption: "/start" } } as never),
    ).toBe(true);
  });

  it("detects bot_command entities at offset zero", () => {
    expect(
      isSlashCommandMessage({
        message: {
          text: "/explain@MyBot",
          entities: [{ type: "bot_command", offset: 0, length: 14 }],
        },
      } as never),
    ).toBe(true);
  });
});
