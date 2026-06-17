import type { Context } from "grammy";
import { messageHasBotUsernameMention } from "@llm-tg-bot/modules-addressing-detection";
import { getSettings } from "../../db/index.js";
import { isOwner } from "../owner/owner.js";

function isGroupChat(ctx: Context): boolean {
  const type = ctx.chat?.type;
  return type === "group" || type === "supergroup";
}

function hasDirectBotMention(ctx: Context): boolean {
  const message = ctx.message;
  const botId = ctx.me?.id;
  if (!message || botId == null) return false;
  return messageHasBotUsernameMention(message, botId, ctx.me?.username);
}

/** True when maintenance mode is on and the message should not proceed. */
export function isMaintenanceBlocked(ctx: Context): boolean {
  if (!getSettings().maintenanceModeEnabled) return false;
  if (!isOwner(ctx)) return true;
  if (isGroupChat(ctx) && !hasDirectBotMention(ctx)) return true;
  return false;
}
