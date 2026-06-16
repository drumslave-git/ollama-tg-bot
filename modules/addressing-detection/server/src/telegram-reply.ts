import type { Message } from "@grammyjs/types";
import type { BotAddressIdentity } from "./bot-identity.js";

function isMessageFromBot(
  msg: Message,
  botId: number,
  botUsername: string,
): boolean {
  if (msg.from?.id === botId) return true;
  const username = msg.from?.username;
  return Boolean(
    username && username.toLowerCase() === botUsername.toLowerCase(),
  );
}

export function isReplyToBotMessage(
  message: Message | undefined,
  me: { id: number; username?: string } | undefined,
  bot: BotAddressIdentity,
): boolean {
  if (!message) return false;

  const botId = me?.id ?? bot.id;
  const botUsername = bot.username ?? me?.username ?? "";
  const replied = message.reply_to_message;
  if (replied) {
    if (botId != null && replied.from?.id === botId) return true;
    const username = replied.from?.username;
    if (
      username &&
      botUsername &&
      username.toLowerCase() === botUsername.toLowerCase()
    ) {
      return true;
    }
    if (botId != null && isMessageFromBot(replied, botId, botUsername)) {
      return true;
    }
  }

  const external = message.external_reply;
  if (external && botId != null) {
    const origin = external.origin;
    if (origin.type === "user" && origin.sender_user.id === botId) {
      return true;
    }
  }

  return false;
}

/** True when the user is continuing a thread (reply chain includes the bot). */
export function isReplyInBotThreadMessage(
  message: Message | undefined,
  me: { id: number; username?: string } | undefined,
  bot: BotAddressIdentity,
): boolean {
  if (isReplyToBotMessage(message, me, bot)) return true;

  const botId = me?.id ?? bot.id;
  const botUsername = bot.username ?? me?.username ?? "";
  let current = message?.reply_to_message;
  let depth = 0;

  while (current && depth < 8) {
    if (botId != null && isMessageFromBot(current, botId, botUsername)) {
      return true;
    }
    current = current.reply_to_message;
    depth++;
  }

  return false;
}
