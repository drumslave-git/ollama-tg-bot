import type { Message } from "@grammyjs/types";
import type { BotAddressIdentity } from "./bot-identity.js";

export type { BotAddressIdentity };

export interface MessageForBotInput {
  chatType?: string;
  message?: Message;
  bot: Pick<BotAddressIdentity, "id" | "username">;
  isReplyToBot?: boolean;
  isReplyInBotThread?: boolean;
}

/** Telegram entity offsets are UTF-16 code units (same as JS strings). */
export function sliceEntity(
  text: string,
  offset: number,
  length: number,
): string {
  return text.slice(offset, offset + length);
}

export function isMessageForBot(input: MessageForBotInput): boolean {
  if (!input.message) return false;
  if (input.chatType === "private") return true;

  const { bot, message } = input;
  if (!bot.id) return false;

  const username = bot.username ?? "";

  if (input.isReplyToBot) return true;
  if (input.isReplyInBotThread) return true;
  if (messageHasBotUsernameMention(message, bot.id, bot.username)) return true;
  if (messageHasBotCommand(message, bot.username)) return true;

  return false;
}

/** True when the message contains an @username mention of the bot (not reply or display name). */
export function messageHasBotUsernameMention(
  msg: Message,
  botId: number,
  botUsername?: string,
): boolean {
  const text = msg.text ?? msg.caption ?? "";
  if (!text) return false;

  const user = botUsername?.toLowerCase();
  const textLower = text.toLowerCase();

  if (user && textLower.includes(`@${user}`)) return true;

  const entities = [...(msg.entities ?? []), ...(msg.caption_entities ?? [])];
  for (const entity of entities) {
    if (entity.type === "text_mention" && entity.user.id === botId) {
      return true;
    }
    if (entity.type === "mention" && user) {
      const mention = sliceEntity(text, entity.offset, entity.length)
        .replace(/^@/, "")
        .toLowerCase();
      if (mention === user) return true;
    }
  }

  return false;
}

function messageHasBotCommand(msg: Message, botUsername?: string): boolean {
  const text = msg.text ?? msg.caption ?? "";
  if (!text.trimStart().startsWith("/")) return false;

  const user = botUsername?.toLowerCase();
  const entities = [...(msg.entities ?? []), ...(msg.caption_entities ?? [])];

  for (const entity of entities) {
    if (entity.type !== "bot_command") continue;

    const cmd = sliceEntity(text, entity.offset, entity.length);
    const at = cmd.indexOf("@");
    if (at === -1) continue;

    const target = cmd.slice(at + 1).toLowerCase();
    if (user && target === user) return true;
  }

  return false;
}
