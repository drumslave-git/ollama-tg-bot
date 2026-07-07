import { describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import {
  startChatActionForMessage,
  startTypingForMessage,
} from "../../src/bot/replies/typing.js";

function fakeContext(input?: {
  chatId?: number;
  chatType?: string;
  isForum?: boolean;
  messageThreadId?: number;
}): Context {
  return {
    api: {
      sendChatAction: vi.fn().mockResolvedValue(true),
    },
    chat:
      input?.chatId != null
        ? {
            id: input.chatId,
            type: input.chatType ?? "private",
            is_forum: input.isForum,
          }
        : undefined,
    message:
      input?.messageThreadId != null
        ? { message_thread_id: input.messageThreadId }
        : undefined,
  } as unknown as Context;
}

describe("typing chat actions", () => {
  it("uses explicit accepted-turn chat and thread values", () => {
    const ctx = fakeContext({
      chatId: 100,
      chatType: "supergroup",
      isForum: true,
      messageThreadId: 10,
    });

    const stop = startTypingForMessage(ctx, {
      chatId: 200,
      chat: { type: "supergroup", is_forum: true },
      messageThreadId: 20,
    });
    stop?.();

    expect(ctx.api.sendChatAction).toHaveBeenCalledWith(200, "typing", {
      message_thread_id: 20,
    });
  });

  it("uses General topic id for forum chat actions without a message thread", () => {
    const ctx = fakeContext();

    const stop = startChatActionForMessage(ctx, "choose_sticker", {
      chatId: 200,
      chat: { type: "supergroup", is_forum: true },
    });
    stop?.();

    expect(ctx.api.sendChatAction).toHaveBeenCalledWith(
      200,
      "choose_sticker",
      { message_thread_id: 1 },
    );
  });
});
