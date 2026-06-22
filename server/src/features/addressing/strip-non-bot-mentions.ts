import type { Message, MessageEntity } from "@grammyjs/types";
import { sliceEntity } from "./telegram-address.js";

/** Remove @mentions of people other than the bot (for name-based address detection). */
export function stripNonBotMentions(
  message: Message | undefined,
  context: { botId?: number; botUsername?: string } = {},
): string {
  if (!message) return "";

  const { text, entities } = messageTextAndEntities(message);
  if (!text) return "";

  const { botId, botUsername } = context;
  let out = text;

  for (const entity of [...entities].sort((a, b) => b.offset - a.offset)) {
    if (entity.type !== "mention" && entity.type !== "text_mention") continue;
    if (isBotMentionEntity(entity, text, botId, botUsername)) continue;
    out =
      out.slice(0, entity.offset) +
      " " +
      out.slice(entity.offset + entity.length);
  }

  return out.replace(/\s{2,}/g, " ").trim();
}

function messageTextAndEntities(message: Message): {
  text: string;
  entities: MessageEntity[];
} {
  if (message.text != null) {
    return { text: message.text, entities: message.entities ?? [] };
  }
  if (message.caption != null) {
    return { text: message.caption, entities: message.caption_entities ?? [] };
  }
  return { text: "", entities: [] };
}

function isBotMentionEntity(
  entity: MessageEntity,
  text: string,
  botId?: number,
  botUsername?: string,
): boolean {
  if (entity.type === "text_mention") {
    return botId != null && entity.user.id === botId;
  }
  if (entity.type === "mention") {
    const raw = sliceEntity(text, entity.offset, entity.length);
    const username = raw.replace(/^@/, "").toLowerCase();
    const botUser = botUsername?.toLowerCase();
    return !!botUser && username === botUser;
  }
  return false;
}
