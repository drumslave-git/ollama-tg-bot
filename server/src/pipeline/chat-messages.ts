import type { ChatMessage } from "../llm/client.js";
import {
  appendAssistantMessage,
  appendMessage,
  getHistory,
  getLatestMessages,
  getLatestMessagesBefore,
  formatStoredMessageLine,
  redactBase64MediaForDisplay,
  type StoredMessage,
} from "../features/history/db/index.js";
import { getKnownUsersByIds } from "../db/users/known-users.js";
import { logEvent } from "../logging/event-log.js";
import { getInputCharBudget } from "../settings/limits.js";
import type { Settings } from "../db/index.js";
import { buildSystemPrompt } from "./adapters/system-prompt.js";
import type { MoodValues } from "../features/mood/index.js";
import { extractParticipantUserIds } from "../features/history/index.js";
import { isReplyThreadContext } from "../bot/replies/replies.js";
import type { CurrentSpeaker } from "../bot/messages/speaker.js";

export interface LatestTurnOptions {
  body: string;
  speakerTag?: string | null;
  mentionedUsersContext?: string | null;
  replyContext?: string | null;
  currentSpeaker?: CurrentSpeaker | null;
  currentSpeakerIsOwner?: boolean;
  isGroupChat?: boolean;
  /** Base64 images attached directly to the current turn for vision models. */
  images?: string[];
  /** Recent-conversation window (tagged transcript) prepended as background. */
  recentWindow?: string | null;
}

function buildLatestTurnMessage(options: LatestTurnOptions): string {
  const parts: string[] = [];
  const hasReplyThread = isReplyThreadContext(options.replyContext);

  if (options.recentWindow?.trim()) {
    parts.push(RECENT_CHAT_HEADER + options.recentWindow.trim());
  }

  if (options.isGroupChat && options.currentSpeaker) {
    const ownerLine = options.currentSpeakerIsOwner
      ? "They are the bot owner — prioritize their intent.\n"
      : "";

    if (hasReplyThread) {
      parts.push(
        `[CURRENT SPEAKER — reply to this person]\n` +
          `Name: ${options.currentSpeaker.label}\n` +
          `Tag/ID: ${options.speakerTag ?? options.currentSpeaker.userId}\n` +
          ownerLine,
      );
    } else {
      parts.push(
        `[CURRENT SPEAKER — reply to this person only]\n` +
          `Name: ${options.currentSpeaker.label}\n` +
          `Tag/ID: ${options.speakerTag ?? options.currentSpeaker.userId}\n` +
          ownerLine,
      );
    }
  }

  if (options.mentionedUsersContext?.trim()) {
    parts.push(options.mentionedUsersContext.trim());
  }

  if (options.replyContext?.trim()) {
    parts.push(`[REPLY CONTEXT]\n${options.replyContext.trim()}`);
  }

  if (!hasReplyThread) {
    parts.push(options.body.trim());
  }

  return parts.filter(Boolean).join("\n\n");
}

const RECENT_CHAT_HEADER =
  `[RECENT CHAT — the latest messages in this chat, oldest first, each prefixed with the time it was stored. Background to resolve who and what the current message refers to (pronouns, "this", an unnamed person, a running topic). Reply only to the current message at the end; for anything older than this window, use the history tools.]\n`;

/** Hard ceiling on rows scanned for the window, regardless of character budget. */
const RECENT_WINDOW_MAX_ROWS = 200;

/**
 * Share of the leftover input budget the window may use. The rest is kept for
 * tool-call results: the main-reply tool loop appends them to this same
 * conversation under one numCtx, so packing the whole remainder with history
 * would crowd them out.
 */
const RECENT_WINDOW_BUDGET_FRACTION = 0.5;

/** One stored row as a time-stamped tagged line, base64 media redacted. */
function formatWindowLine(message: StoredMessage): string {
  const redacted = redactBase64MediaForDisplay(message.content);
  const safe = redacted == null ? message : { ...message, content: redacted };
  const line = formatStoredMessageLine(safe);
  if (!line) return "";
  if (safe.createdAt == null) return line;
  return `[${new Date(safe.createdAt * 1000).toISOString()}] ${line}`;
}

/**
 * Build the live recent-conversation window, sized by characters rather than a
 * message count: fill `charBudget` with the most recent messages (newest first,
 * then re-ordered oldest-first), excluding the current turn (`beforeId`, already
 * persisted by intake). Returns the tagged transcript and the rows it kept.
 */
async function loadRecentWindow(
  chatKey: string,
  charBudget: number,
  beforeId: number | null,
): Promise<{ block: string; messages: StoredMessage[] }> {
  if (charBudget <= 0) return { block: "", messages: [] };
  const recent =
    beforeId != null
      ? await getLatestMessagesBefore(chatKey, beforeId, RECENT_WINDOW_MAX_ROWS)
      : await getLatestMessages(chatKey, RECENT_WINDOW_MAX_ROWS);

  const kept: { line: string; message: StoredMessage }[] = [];
  let used = 0;
  // Walk from the newest message backward so the window keeps what is closest
  // to the current turn and drops the oldest lines that no longer fit.
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const message = recent[i]!;
    const line = formatWindowLine(message);
    if (!line) continue;
    const cost = line.length + 1; // trailing newline between lines
    if (used + cost > charBudget) break;
    used += cost;
    kept.push({ line, message });
  }
  if (kept.length === 0) return { block: "", messages: [] };

  kept.reverse(); // oldest first
  return {
    block: kept.map((k) => k.line).join("\n"),
    messages: kept.map((k) => k.message),
  };
}

async function loadKnownChatUsers(
  chatKey: string,
  currentUserId: string | null,
): Promise<Awaited<ReturnType<typeof getKnownUsersByIds>>> {
  const history = await getHistory(chatKey);
  const roles = history.map((m) => m.role);
  const participantIds = extractParticipantUserIds(
    roles,
    currentUserId ? [currentUserId] : [],
  );
  return getKnownUsersByIds(participantIds);
}

export interface BuiltChatPayload {
  messages: ChatMessage[];
  systemContent: string;
  historyMessages: ChatMessage[];
  latestContent: string;
  storedHistoryCount: number;
}

export async function buildChatMessages(
  customSystemPrompt: string,
  chatKey: string,
  latestTurn: LatestTurnOptions,
  options: {
    settings: Settings;
    isGroupChat?: boolean;
    groupChatId?: string | null;
    currentUserId?: string | null;
    ownerUserId?: string | null;
    ownerUsername?: string | null;
    mood?: MoodValues | null;
    currentUserIsOwner?: boolean;
    repliedTask?: { id: number; instruction: string } | null;
    /** chat_messages.id of the current turn — excluded from the recent window. */
    currentMessageId?: number | null;
  },
): Promise<BuiltChatPayload> {
  const {
    settings,
    isGroupChat = false,
    groupChatId = null,
    currentUserId = null,
    ownerUserId = null,
    ownerUsername = null,
    mood = null,
    currentUserIsOwner = false,
    repliedTask = null,
    currentMessageId = null,
  } = options;

  const knownChatUsers = await loadKnownChatUsers(chatKey, currentUserId);

  const system = buildSystemPrompt({
    settings,
    customPrompt: customSystemPrompt,
    knownChatUsers: isGroupChat ? knownChatUsers : [],
    isGroupChat,
    groupChatId,
    currentUserId,
    currentUserTag: latestTurn.speakerTag ?? null,
    currentUserLabel: latestTurn.currentSpeaker?.label ?? null,
    ownerUserId,
    ownerUsername,
    mood,
    entityId: chatKey,
    now: new Date(),
    currentUserIsOwner,
    repliedTask,
  });

  // Deeper history stays on-demand via the history MCP tools. For group chats
  // we still prepend a rolling window of the most recent messages so the model
  // keeps the live thread — without it every message looks self-contained and
  // the bot loses track of who/what is being discussed across speakers. The
  // window is sized to fit the context window: whatever character budget is
  // left after the system prompt and the current turn (a fraction of it, so
  // tool-call results still have room), never a fixed message count.
  const baseLatest = buildLatestTurnMessage({
    ...latestTurn,
    isGroupChat,
    speakerTag: latestTurn.speakerTag ?? null,
    recentWindow: null,
  });

  let windowCharBudget = 0;
  if (isGroupChat) {
    const leftover =
      getInputCharBudget(settings) -
      system.length -
      baseLatest.length -
      RECENT_CHAT_HEADER.length;
    windowCharBudget = Math.floor(
      Math.max(0, leftover) * RECENT_WINDOW_BUDGET_FRACTION,
    );
  }

  const { block: recentWindow, messages: windowMessages } =
    await loadRecentWindow(chatKey, windowCharBudget, currentMessageId);

  const latest = recentWindow
    ? buildLatestTurnMessage({
        ...latestTurn,
        isGroupChat,
        speakerTag: latestTurn.speakerTag ?? null,
        recentWindow,
      })
    : baseLatest;

  const latestMessage: ChatMessage = {
    role: "user",
    content: latest,
    ...(latestTurn.images?.length ? { images: latestTurn.images } : {}),
  };

  return {
    systemContent: system,
    historyMessages: [],
    latestContent: latest,
    storedHistoryCount: windowMessages.length,
    messages: [{ role: "system", content: system }, latestMessage],
  };
}

export async function recordExchange(
  chatKey: string,
  userRole: string | null,
  userContent: string | null,
  assistantText: string,
  options?: { skipUser?: boolean; anchorMessageId?: number },
): Promise<void> {
  if (!options?.skipUser && userRole && userContent?.trim()) {
    await appendMessage(
      chatKey,
      userRole,
      userContent,
      options?.anchorMessageId != null
        ? { messageId: options.anchorMessageId }
        : undefined,
    );
  }
  // Autoincrement id + created_at already order the reply after everything
  // stored so far, so a plain append is enough.
  await appendAssistantMessage(chatKey, assistantText);
  logEvent("history_exchange_stored", {
    convKey: chatKey,
    skipUser: Boolean(options?.skipUser),
    anchorMessageId: options?.anchorMessageId ?? null,
    hasUserRow: !options?.skipUser && Boolean(userRole && userContent?.trim()),
  });
}
