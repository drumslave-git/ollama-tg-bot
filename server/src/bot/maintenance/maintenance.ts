import type { Context } from "grammy";
import { messageHasBotUsernameMention } from "../../features/addressing/index.js";
import { getSettings } from "../../db/index.js";
import { isOwner } from "../owner/owner.js";

export { MAINTENANCE_MODE_ON_BEHAVIOR } from "./maintenance-mode.js";

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
export async function isMaintenanceBlocked(ctx: Context): Promise<boolean> {
  if (!(await getSettings()).maintenanceModeEnabled) return false;
  if (!(await isOwner(ctx))) return true;
  if (isGroupChat(ctx) && !hasDirectBotMention(ctx)) return true;
  return false;
}
