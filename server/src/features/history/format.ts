import type { Message, User } from "@grammyjs/types";
import type { KnownUserRecord, StoredMessage } from "./types.js";
import { ASSISTANT_ROLE } from "./types.js";

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

const ASSISTANT_SAID_PREFIX = /^\[assistant said\]\s*:?\s*/i;
const STICKER_HISTORY_LINE = /^\[sticker:\s*[^\]]+\]\s*$/i;
const ECHOED_USER_HISTORY_PREFIX =
  /^\[user:[^\]]+(?:\s+(?:said|replied to[^\]]*|sent \w+))?\]\s*:\s*/i;

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

export function buildTextHistoryContent(
  user: User | undefined,
  _message: Message,
  text: string,
  _botId?: number,
): string | null {
  const userTag = userRoleTag(user);
  const trimmed = text.trim();
  if (!userTag || !trimmed) return null;
  // Stored content stays clean: the speaker tag and reply pointer are added at
  // format time (see formatStoredMessageLine) from the row's role + columns.
  return trimmed;
}

export type MediaKind = "sticker" | "image";

export function mediaKindForMessage(
  message: Message,
  sticker = false,
): MediaKind {
  if (sticker || message.sticker) return "sticker";
  return "image";
}

/** History line after vision: `[sent image]: …`. The reply link (if any) is a
 * row column, rendered by formatStoredMessageLine — not embedded in content. */
export function buildMediaHistoryContent(
  user: User | undefined,
  _message: Message,
  mediaKind: MediaKind,
  visionDescription: string,
  _botId?: number,
  packEmoji?: string | null,
): string | null {
  const userTag = userRoleTag(user);
  if (!userTag || !visionDescription.trim()) return null;

  let body = visionDescription.trim();
  if (mediaKind === "sticker" && packEmoji) {
    body = `${body}. it represents emoji ${packEmoji}`;
  }
  return `[sent ${mediaKind}]: ${body}`;
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

/** A stored pending-media line: `[sent image]: data:…;base64,…`. */
const BASE64_MEDIA_LINE =
  /^(\[(?:sent|replied)[^\]]*\]):\s*data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)\s*$/i;

const STICKER_EMOJI_LINE = /^\(sticker emoji:\s*(.+?)\)\s*$/i;

/** History line with pending vision — base64 data URI after the media prefix. */
export function buildBase64MediaHistoryContent(
  user: User | undefined,
  _message: Message,
  mediaKind: MediaKind,
  base64: string,
  mimeHint: string,
  _botId?: number,
  packEmoji?: string | null,
): string | null {
  const userTag = userRoleTag(user);
  const raw = base64.trim();
  if (!userTag || !raw) return null;

  const prefix = `[sent ${mediaKind}]`;
  const mime = mimeHint.trim() || "image/jpeg";
  let body = `data:${mime};base64,${raw}`;
  if (mediaKind === "sticker" && packEmoji) {
    body = `${body}\n(sticker emoji: ${packEmoji})`;
  }
  return `${prefix}: ${body}`;
}

/** A single message is one stored row: join its text and pending-media parts. */
export function combineHistoryContent(
  textContent: string | null,
  mediaContent: string | null,
): string | null {
  const parts = [textContent, mediaContent]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("\n") : null;
}

export interface ParsedBase64MediaHistory {
  prefix: string;
  mediaKind: MediaKind;
  mimeHint: string;
  base64: string;
  packEmoji?: string;
  /** Content lines around the media block (e.g. the user's text), media removed. */
  surroundingLines: string[];
  /** Index in the original line array where the media block sits. */
  mediaLineIndex: number;
}

/** True when history content still holds a base64 data URI awaiting vision backfill. */
export function isBase64MediaHistoryContent(content: string): boolean {
  return parseBase64MediaHistoryContent(content) != null;
}

/**
 * Locate the pending base64 media block inside a stored row. One message is one
 * row, so the media line may be preceded by the user's text; `surroundingLines`
 * keeps that text so callers can rewrite only the media block.
 */
export function parseBase64MediaHistoryContent(
  content: string,
): ParsedBase64MediaHistory | null {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = BASE64_MEDIA_LINE.exec(lines[i]!.trim());
    if (!match) continue;

    const prefix = match[1]!;
    const mediaKind: MediaKind = prefix.toLowerCase().includes("sticker")
      ? "sticker"
      : "image";
    const emojiMatch = STICKER_EMOJI_LINE.exec(lines[i + 1]?.trim() ?? "");
    const blockEnd = emojiMatch ? i + 1 : i;

    return {
      prefix,
      mediaKind,
      mimeHint: match[2]!,
      base64: match[3]!,
      packEmoji: emojiMatch ? emojiMatch[1]!.trim() || undefined : undefined,
      surroundingLines: [...lines.slice(0, i), ...lines.slice(blockEnd + 1)],
      mediaLineIndex: i,
    };
  }
  return null;
}

/** Rebuild a row's content, swapping the media block body but keeping the text. */
function rebuildMediaContent(
  parsed: ParsedBase64MediaHistory,
  body: string,
): string {
  const lines = [...parsed.surroundingLines];
  lines.splice(parsed.mediaLineIndex, 0, `${parsed.prefix}: ${body}`);
  return lines.join("\n");
}

/** Replace a base64 media block with a vision description, keeping prefix and text. */
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
  return rebuildMediaContent(parsed, body);
}

/** Redact a not-yet-described base64 media block to a short placeholder, keeping text. */
export function redactBase64MediaForDisplay(content: string): string | null {
  const parsed = parseBase64MediaHistoryContent(content);
  if (!parsed) return null;
  return rebuildMediaContent(parsed, `[${parsed.mediaKind} not yet described]`);
}

/**
 * The bracketed tag for one stored row: speaker · own message id · reply
 * pointer. The reply pointer (`replied to msg:X`) is only shown when `X` is in
 * `resolvableReplyIds` — the set of message ids visible in the same rendered
 * block — so a shown pointer can always be followed inline, never dangling.
 */
function buildLineTag(
  message: StoredMessage,
  resolvableReplyIds?: ReadonlySet<number>,
): string {
  const parts: string[] = [];

  if (message.role === ASSISTANT_ROLE) {
    parts.push("assistant said");
  } else {
    const parsed = parseUserRole(message.role);
    parts.push(parsed ? `user:${parsed.username}:${parsed.userId}` : message.role);
  }

  if (message.messageId != null) {
    parts.push(`msg:${message.messageId}`);
  }

  if (
    message.replyToMessageId != null &&
    resolvableReplyIds?.has(message.replyToMessageId)
  ) {
    parts.push(`replied to msg:${message.replyToMessageId}`);
  }

  return parts.join(" · ");
}

/**
 * One stored row as a tagged line for tool output, the recent-chat window, or
 * debug display. Pass `resolvableReplyIds` (the message ids present in the same
 * block) to have reply pointers rendered; omit it to suppress them.
 */
export function formatStoredMessageLine(
  message: StoredMessage,
  resolvableReplyIds?: ReadonlySet<number>,
): string {
  let content = message.content.trim();
  if (message.role === ASSISTANT_ROLE) {
    content = content.replace(ASSISTANT_SAID_PREFIX, "").trim();
  }
  if (!content) return "";

  return `[${buildLineTag(message, resolvableReplyIds)}]: ${content}`;
}

/** The set of message ids present in a batch — the resolvable-reply set. */
export function collectMessageIds(
  messages: readonly StoredMessage[],
): Set<number> {
  const ids = new Set<number>();
  for (const message of messages) {
    if (message.messageId != null) ids.add(message.messageId);
  }
  return ids;
}

function sanitizeTagPart(value: string): string {
  return value.replace(/[:[\]]/g, "_").trim() || "unknown";
}
