import type { Context } from "grammy";
import { wasBotAddedToChat, groupSetupMessage } from "../group-setup.js";

export async function groupSetupHandler(ctx: Context, botUsername: string) {
  const chat = ctx.chat;
  const update = ctx.myChatMember;
  if (!chat || !update) return;

  if (!wasBotAddedToChat(update.old_chat_member.status, update.new_chat_member.status)) {
    return;
  }

  const text = groupSetupMessage(botUsername);

  try {
    await ctx.api.sendMessage(chat.id, text, { parse_mode: "HTML" });
  } catch (err) {
    console.error("Failed to send group setup message:", err);
  }
}
