import type { Context } from "grammy";
import {
  isMessageForBot as detectMessageForBot,
  isSlashCommandText,
  sliceEntity,
} from "@llm-tg-bot/modules-addressing-detection";
import { isReplyInBotThread, isReplyToBot } from "./replies.js";

export { sliceEntity };

export function isMessageForBot(ctx: Context): boolean {
  if (!ctx.message) return false;
  if (ctx.chat?.type === "private") return true;

  const me = ctx.me;
  if (!me?.id) return false;

  const username = me.username ?? "";
  return detectMessageForBot({
    chatType: ctx.chat?.type,
    message: ctx.message,
    bot: { id: me.id, username: me.username },
    isReplyToBot: isReplyToBot(ctx, username),
    isReplyInBotThread: isReplyInBotThread(ctx, username),
  });
}

export function isSlashCommandMessage(ctx: Context): boolean {
  return isSlashCommandText(ctx.message?.text);
}
