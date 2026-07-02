import type { PipelineTelegramContext } from "../contracts/index.js";
import type { Context } from "grammy";
import { formatReplyContext } from "../bot/replies/replies.js";
import {
  formatMentionedUsersContext,
  resolveMentionedKnownUsers,
} from "../bot/messages/mentions.js";
import { conversationKey } from "../features/history/db/index.js";

export function buildTelegramContext(
  ctx: Context,
  botToken: string,
): PipelineTelegramContext {
  return {
    message: ctx.message,
    chat: ctx.chat
      ? {
          id: ctx.chat.id,
          type: ctx.chat.type,
          is_forum: ctx.chat.is_forum,
        }
      : undefined,
    from: ctx.from,
    me: ctx.me ? { id: ctx.me.id, username: ctx.me.username } : undefined,
    botToken,
  };
}

export function resolveConversationKeyFromTelegram(
  telegram: PipelineTelegramContext,
): string | null {
  const chatId = telegram.chat?.id;
  if (chatId == null) return null;
  return conversationKey(chatId);
}

export function resolveUserIdFromTelegram(
  telegram: PipelineTelegramContext,
): string | null {
  const id = (telegram.from as { id?: number } | undefined)?.id;
  return id != null ? String(id) : null;
}

export function resolveGroupChatIdFromTelegram(
  telegram: PipelineTelegramContext,
): string | null {
  const chat = telegram.chat;
  if (!chat || (chat.type !== "group" && chat.type !== "supergroup")) {
    return null;
  }
  return String(chat.id);
}

export function isGroupChatFromTelegram(
  telegram: PipelineTelegramContext,
): boolean {
  return resolveGroupChatIdFromTelegram(telegram) != null;
}

function asGrammyContext(telegram: PipelineTelegramContext): Context {
  return {
    message: telegram.message,
    chat: telegram.chat,
    me: telegram.me,
  } as Context;
}

export function formatReplyContextFromTelegram(
  telegram: PipelineTelegramContext,
): string | null {
  return formatReplyContext(asGrammyContext(telegram));
}

export async function resolveMentionedUsersContextFromTelegram(
  text: string,
  telegram: PipelineTelegramContext,
): Promise<string | null> {
  const mentionedUsers = await resolveMentionedKnownUsers(
    text.trim(),
    telegram.message as never,
    {
      botId: telegram.me?.id,
      botUsername: telegram.me?.username,
      senderId: (telegram.from as { id?: number } | undefined)?.id,
      senderUsername: (telegram.from as { username?: string } | undefined)
        ?.username,
    },
  );
  return formatMentionedUsersContext(mentionedUsers);
}
