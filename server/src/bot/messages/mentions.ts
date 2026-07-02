import type { Message, MessageEntity } from "@grammyjs/types";
import {
  findKnownUserByUsername,
  findKnownUsersMentionedInText,
  formatKnownUserLabel,
  getKnownUserById,
  type KnownUserRecord,
} from "../../db/users/known-users.js";
import { getUserFacts } from "../../features/memory/db/index.js";
import { userRoleTagFromKnown } from "../../features/history/index.js";
import { formatSpeakerLabel } from "./speaker.js";
import { sliceEntity } from "../../features/addressing/index.js";

export interface MentionedKnownUser {
  userId: string;
  visible: string;
  description: string;
  isKnown: boolean;
}

export interface MentionContext {
  botId?: number;
  botUsername?: string;
  senderId?: number;
  senderUsername?: string;
}

/** Resolve @mentions and name references against known_users. */
export async function resolveMentionedKnownUsers(
  text: string,
  message: Message | undefined,
  context: MentionContext = {},
): Promise<MentionedKnownUser[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return collectMentionedKnownUsers(trimmed, message, context);
}

function escapeRegExpPart(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether the reply OPENS by addressing this participant — a leading @mention
 * (`@rok13 …`) or a vocative name immediately followed by address punctuation
 * (`Rok, …` / `Rok: …`). A name that merely appears later ("…nicer than @rok13",
 * "Rok said that") is a reference, not an address, so it does not count.
 */
export function replyOpensByAddressing(
  reply: string,
  user: KnownUserRecord,
): boolean {
  const head = reply.trimStart();
  if (user.username) {
    const at = new RegExp(`^@${escapeRegExpPart(user.username)}\\b`, "i");
    if (at.test(head)) return true;
  }
  const first = user.firstName?.trim();
  if (first && first.length >= 2) {
    const vocative = new RegExp(`^${escapeRegExpPart(first)}\\s*[,:!]`, "i");
    if (vocative.test(head)) return true;
  }
  return false;
}

/**
 * Whether the bot's OWN reply is DIRECTED AT a known participant other than the
 * current speaker — i.e. it opens by addressing them (leading @mention or
 * vocative name). Merely referencing someone mid-sentence still answers the
 * speaker and does NOT count. `senderId` in `context` is the current speaker,
 * who is excluded. Drives delivery: a reply directed at a third party is sent as
 * a plain message; a reply to the speaker is threaded to their message.
 */
export async function replyAddressesOtherParticipant(
  replyText: string,
  context: MentionContext = {},
): Promise<boolean> {
  const trimmed = replyText.trim();
  if (!trimmed) return false;
  const { senderId, botId, botUsername } = context;
  const excludeUserIds = [
    senderId != null ? String(senderId) : null,
    botId != null ? String(botId) : null,
  ].filter((id): id is string => Boolean(id));
  const candidates = await findKnownUsersMentionedInText(trimmed, {
    excludeUserIds,
    botUsername,
  });
  return candidates.some((user) => replyOpensByAddressing(trimmed, user));
}

/** Passive history / transcript: append a compact mention footer. */
export async function enrichTextWithUserMentions(
  text: string,
  message: Message | undefined,
  context: MentionContext = {},
): Promise<string> {
  const mentions = await resolveMentionedKnownUsers(text, message, context);
  if (mentions.length === 0) return text;

  const lines = mentions.map((m) => `• ${m.visible} → ${m.description}`);
  return (
    `${text.trim()}\n\n` +
    `[Mentioned Telegram users in this message:\n${lines.join("\n")}]`
  );
}

/**
 * Prominent latest-turn block — model must use this when asked who someone is.
 */
export async function formatMentionedUsersContext(
  mentions: MentionedKnownUser[],
): Promise<string | null> {
  const known = mentions.filter((m) => m.isKnown);
  if (known.length === 0) return null;

  const lines = [
    "[MENTIONED USERS — people referenced in this message]",
    "If the speaker asks who they are, identify them from here. Do not claim you lack this information.",
  ];

  for (const m of known) {
    lines.push(`• ${m.visible} → ${m.description}`);
    const facts = await getUserFacts(m.userId);
    if (facts.length > 0) {
      for (const fact of facts) {
        lines.push(`  - ${fact}`);
      }
    } else {
      lines.push(
        "  - (no extra stored facts — use their Telegram name/username above)",
      );
    }
  }

  return lines.join("\n");
}

async function collectMentionedKnownUsers(
  text: string,
  message: Message | undefined,
  context: MentionContext,
): Promise<MentionedKnownUser[]> {
  const { botId, botUsername, senderId } = context;
  const excludeUserIds = [
    senderId != null ? String(senderId) : null,
    botId != null ? String(botId) : null,
  ].filter((id): id is string => Boolean(id));

  const seen = new Set<string>();
  const mentions: MentionedKnownUser[] = [];

  const addRecord = (record: KnownUserRecord, visible: string) => {
    if (seen.has(record.userId)) return;
    seen.add(record.userId);
    mentions.push({
      userId: record.userId,
      visible,
      description: formatKnownMentionDescription(record),
      isKnown: true,
    });
  };

  if (message) {
    for (const entityMention of await collectEntityMentions(message, context)) {
      if (seen.has(entityMention.userId)) continue;
      seen.add(entityMention.userId);
      mentions.push(entityMention);
    }
  }

  const plainTextMatches = await findKnownUsersMentionedInText(text, {
    excludeUserIds: [...excludeUserIds, ...seen],
    botUsername,
  });
  for (const record of plainTextMatches) {
    const visible = pickVisibleReference(text, record);
    addRecord(record, visible);
  }

  return mentions;
}

function formatKnownMentionDescription(record: KnownUserRecord): string {
  return (
    `${formatKnownUserLabel(record)}, Telegram id ${record.userId}, ` +
    `history tag ${userRoleTagFromKnown(record)}`
  );
}

function pickVisibleReference(text: string, record: KnownUserRecord): string {
  if (record.username) {
    const atPattern = new RegExp(
      `@${record.username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i",
    );
    const atMatch = text.match(atPattern);
    if (atMatch) return atMatch[0];
  }
  const first = record.firstName?.trim();
  if (first) {
    const namePattern = new RegExp(
      `\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i",
    );
    const nameMatch = text.match(namePattern);
    if (nameMatch) return `"${nameMatch[0]}"`;
  }
  return `"${formatKnownUserLabel(record)}"`;
}

async function collectEntityMentions(
  message: Message,
  context: MentionContext,
): Promise<MentionedKnownUser[]> {
  const { text, entities } = messageTextAndEntities(message);
  if (!text) return [];

  const { botId, botUsername, senderId, senderUsername } = context;
  const botUser = botUsername?.toLowerCase();
  const senderUser = senderUsername?.toLowerCase();
  const mentions: MentionedKnownUser[] = [];

  for (const entity of entities) {
    if (entity.type === "text_mention") {
      const user = entity.user;
      if (botId != null && user.id === botId) continue;
      if (senderId != null && user.id === senderId) continue;

      const visible = `"${sliceEntity(text, entity.offset, entity.length)}"`;
      const known = await getKnownUserById(String(user.id));
      if (known) {
        mentions.push({
          userId: known.userId,
          visible,
          description: formatKnownMentionDescription(known),
          isKnown: true,
        });
      } else {
        mentions.push({
          userId: String(user.id),
          visible,
          description: formatSpeakerLabel(user),
          isKnown: false,
        });
      }
      continue;
    }

    if (entity.type === "mention") {
      const raw = sliceEntity(text, entity.offset, entity.length);
      const username = raw.replace(/^@/, "").toLowerCase();
      if (!username) continue;
      if (botUser && username === botUser) continue;
      if (senderUser && username === senderUser) continue;

      const known = await findKnownUserByUsername(username);
      if (known) {
        mentions.push({
          userId: known.userId,
          visible: raw,
          description: formatKnownMentionDescription(known),
          isKnown: true,
        });
      } else {
        mentions.push({
          userId: `@${username}`,
          visible: raw,
          description:
            "Telegram username (person not in known_users yet — they may not have messaged the bot)",
          isKnown: false,
        });
      }
    }
  }

  return mentions;
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
