import type { Message, User } from "@grammyjs/types";
import type { KnownUserRecord, StoredMessage } from "./types.js";
import { ASSISTANT_ROLE, COMPRESSED_ROLE } from "./types.js";

/** Role key stored in DB: user:username:userId */
export function userRoleTag(user: User | undefined): string | null {
  if (!user?.id) return null;
  return userRoleTagFromParts(
    String(user.id),
    user.username,
    user.first_name,
  );
}

export function userRoleTagFromKnown(record: KnownUserRecord): string {
  return userRoleTagFromParts(
    record.userId,
    record.username,
    record.firstName,
  );
}

export function userRoleTagFromParts(
  userId: string,
  username?: string | null,
  firstName?: string | null,
): string {
  const tagName = sanitizeTagPart(
    username?.toLowerCase() ?? firstName?.toLowerCase() ?? "unknown",
  );
  return `user:${tagName}:${userId}`;
}

export function parseUserRole(role: string): { username: string; userId: string } | null {
  if (!role.startsWith("user:")) return null;
  const parts = role.split(":");
  if (parts.length < 3) return null;
  const userId = parts[parts.length - 1];
  const username = parts.slice(1, -1).join(":");
  if (!userId) return null;
  return { username, userId };
}

export function extractParticipantUserIds(
  roles: string[],
  extraUserIds: string[] = [],
): string[] {
  const ids = new Set<string>();
  for (const role of roles) {
    const parsed = parseUserRole(role);
    if (parsed) ids.add(parsed.userId);
  }
  for (const id of extraUserIds) {
    if (id) ids.add(id);
  }
  return [...ids];
}

export function formatSaidContent(_userTag: string, text: string): string {
  return text.trim();
}

export function formatRepliedContent(
  _userTag: string,
  _replyToTag: string,
  text: string,
): string {
  return text.trim();
}

const ASSISTANT_SAID_PREFIX = /^\[assistant said\]\s*:?\s*/i;
const STICKER_HISTORY_LINE = /^\[sticker:\s*[^\]]+\]\s*$/i;
const ECHOED_USER_HISTORY_PREFIX =
  /^\[(?:user:[^\]]+(?:\s+(?:said|replied to[^\]]*|sent \w+))?|compressed)\]\s*:\s*/i;

/** Stored assistant rows use an envelope; strip before sending to the model. */
export function stripAssistantHistoryEnvelope(text: string): string {
  return stripStickerHistoryLines(text.replace(ASSISTANT_SAID_PREFIX, "")).trim();
}

/** Remove internal history metadata if the model echoes it in a user-facing reply. */
export function stripEchoedHistoryMarkup(text: string): string {
  let result = text.trim().replace(ASSISTANT_SAID_PREFIX, "");
  result = result.replace(ECHOED_USER_HISTORY_PREFIX, "");
  return stripStickerHistoryLines(result).trim();
}

function stripStickerHistoryLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !STICKER_HISTORY_LINE.test(line.trim()))
    .join("\n");
}

export function resolveReplyTargetTag(
  message: Message,
  botId?: number,
): string | null {
  const replied = message.reply_to_message;
  if (!replied) return null;
  if (botId != null && replied.from?.id === botId) return ASSISTANT_ROLE;
  return userRoleTag(replied.from);
}

export function buildTextHistoryContent(
  user: User | undefined,
  message: Message,
  text: string,
  botId?: number,
): string | null {
  const userTag = userRoleTag(user);
  if (!userTag || !text.trim()) return null;

  const replyTo = resolveReplyTargetTag(message, botId);
  if (replyTo) {
    return formatRepliedContent(userTag, replyTo, text);
  }
  return formatSaidContent(userTag, text);
}

export type MediaKind = "sticker" | "image";

export function mediaKindForMessage(
  message: Message,
  sticker = false,
): MediaKind {
  if (sticker || message.sticker) return "sticker";
  return "image";
}

/** History line after vision: [user:… sent sticker]: … or [user:… replied to … with image]: … */
export function buildMediaHistoryContent(
  user: User | undefined,
  message: Message,
  mediaKind: MediaKind,
  visionDescription: string,
  botId?: number,
  packEmoji?: string | null,
): string | null {
  const userTag = userRoleTag(user);
  if (!userTag || !visionDescription.trim()) return null;

  const replyTo = resolveReplyTargetTag(message, botId);
  const prefix = replyTo
    ? `[replied to ${replyTo}]`
    : `[sent ${mediaKind}]`;
  let body = visionDescription.trim();
  if (mediaKind === "sticker" && packEmoji) {
    body = `${body}. it represents emoji ${packEmoji}`;
  }
  return `${prefix}: ${body}`;
}

/** Passive intake — text only. */
export function buildPassiveHistoryContent(
  message: Message,
  user: User | undefined,
  text: string,
  botId?: number,
): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return buildTextHistoryContent(user, message, trimmed, botId);
}

const BASE64_DATA_URI =
  /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i;

/** History line with pending vision — base64 data URI after the media prefix. */
export function buildBase64MediaHistoryContent(
  user: User | undefined,
  message: Message,
  mediaKind: MediaKind,
  base64: string,
  mimeHint: string,
  botId?: number,
  packEmoji?: string | null,
): string | null {
  const userTag = userRoleTag(user);
  const raw = base64.trim();
  if (!userTag || !raw) return null;

  const replyTo = resolveReplyTargetTag(message, botId);
  const prefix = replyTo
    ? `[replied to ${replyTo} with ${mediaKind}]`
    : `[sent ${mediaKind}]`;
  const mime = mimeHint.trim() || "image/jpeg";
  let body = `data:${mime};base64,${raw}`;
  if (mediaKind === "sticker" && packEmoji) {
    body = `${body}\n(sticker emoji: ${packEmoji})`;
  }
  return `${prefix}: ${body}`;
}

export interface ParsedBase64MediaHistory {
  prefix: string;
  mediaKind: MediaKind;
  mimeHint: string;
  base64: string;
  packEmoji?: string;
}

/** True when history content still holds a base64 data URI awaiting vision backfill. */
export function isBase64MediaHistoryContent(content: string): boolean {
  return parseBase64MediaHistoryContent(content) != null;
}

/** Rows with pending base64 vision data are stored but not injected or compressed. */
export function isInjectableHistoryMessage(message: StoredMessage): boolean {
  return !isBase64MediaHistoryContent(message.content);
}

export function filterInjectableHistory(
  history: StoredMessage[],
): StoredMessage[] {
  return history.filter(isInjectableHistoryMessage);
}

export function parseBase64MediaHistoryContent(
  content: string,
): ParsedBase64MediaHistory | null {
  const trimmed = content.trim();
  const colon = trimmed.indexOf(": ");
  if (colon < 0) return null;

  const prefix = trimmed.slice(0, colon).trim();
  if (!prefix.startsWith("[sent ") && !prefix.startsWith("[replied")) {
    return null;
  }

  const rest = trimmed.slice(colon + 2).trim();
  const lines = rest.split("\n");
  const uriMatch = BASE64_DATA_URI.exec(lines[0]?.trim() ?? "");
  if (!uriMatch) return null;

  const mediaKind: MediaKind = prefix.includes("sticker")
    ? "sticker"
    : "image";
  const emojiLine = lines.find((line) =>
    line.trim().startsWith("(sticker emoji:"),
  );
  const packEmoji = emojiLine
    ? emojiLine.replace(/^\(sticker emoji:\s*/i, "").replace(/\)\s*$/, "")
    : undefined;

  return {
    prefix,
    mediaKind,
    mimeHint: uriMatch[1]!,
    base64: uriMatch[2]!,
    packEmoji: packEmoji || undefined,
  };
}

/** Replace a base64 media line with a vision description, keeping the prefix. */
export function replaceBase64WithVisionDescription(
  content: string,
  visionDescription: string,
): string | null {
  const parsed = parseBase64MediaHistoryContent(content);
  if (!parsed || !visionDescription.trim()) return null;

  let body = visionDescription.trim();
  if (parsed.mediaKind === "sticker" && parsed.packEmoji) {
    body = `${body}. it represents emoji ${parsed.packEmoji}`;
  }
  return `${parsed.prefix}: ${body}`;
}

/** One stored row as a tagged line for compression or debug display. */
export function formatStoredMessageLine(message: StoredMessage): string {
  const content = message.content.trim();
  if (!content) return "";

  if (message.role === COMPRESSED_ROLE) {
    return content;
  }

  if (message.role === ASSISTANT_ROLE) {
    return ASSISTANT_SAID_PREFIX.test(content)
      ? content
      : `[assistant said]: ${content}`;
  }

  const parsed = parseUserRole(message.role);
  if (parsed) {
    return `[user:${parsed.username}:${parsed.userId}]: ${content}`;
  }

  return `[${message.role}]: ${content}`;
}

export function buildHistoryCompressionTranscript(
  history: StoredMessage[],
): string {
  return history
    .filter((message) => !isBase64MediaHistoryContent(message.content))
    .map(formatStoredMessageLine)
    .filter(Boolean)
    .join("\n");
}

function sanitizeTagPart(value: string): string {
  return value.replace(/[:[\]]/g, "_").trim() || "unknown";
}
