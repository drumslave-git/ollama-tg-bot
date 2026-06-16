import type { Context } from "grammy";
import { conversationKey } from "../../db/history/index.js";

export function resolveConversationKey(ctx: Context): string | null {
  const chatId = ctx.chat?.id;
  if (chatId == null) return null;
  return conversationKey(chatId);
}

export function resolveUserId(ctx: Context): string | null {
  const id = ctx.from?.id;
  return id != null ? String(id) : null;
}

export function resolveGroupChatId(ctx: Context): string | null {
  const chat = ctx.chat;
  if (!chat || (chat.type !== "group" && chat.type !== "supergroup")) {
    return null;
  }
  return String(chat.id);
}

export function isGroupChat(ctx: Context): boolean {
  return resolveGroupChatId(ctx) != null;
}
