import type { ChatMessage } from "../llm/client.js";
import {
  appendAssistantMessage,
  appendMessage,
  getHistory,
} from "../db/history/index.js";
import {
  formatKnownUserLabel,
  getKnownUserById,
  getKnownUsersByIds,
} from "../db/users/known-users.js";
import { logEvent } from "../logging/event-log.js";
import type { Settings } from "../db/index.js";
import { buildSystemPrompt } from "./adapters/system-prompt.js";
import type { MoodValues } from "../mood/index.js";
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
}

function buildLatestTurnMessage(options: LatestTurnOptions): string {
  const parts: string[] = [];
  const hasReplyThread = isReplyThreadContext(options.replyContext);

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

export async function loadChatParticipants(
  chatKey: string,
  currentUserId: string | null,
): Promise<{ userId: string; label: string }[]> {
  const history = await getHistory(chatKey);
  const roles = history.map((m) => m.role);
  const participantIds = extractParticipantUserIds(
    roles,
    currentUserId ? [currentUserId] : [],
  );

  return Promise.all(
    participantIds.map(async (userId) => {
      const known = await getKnownUserById(userId);
      if (known) {
        return { userId, label: formatKnownUserLabel(known) };
      }
      const fromHistory = history.find((m) => m.role.endsWith(`:${userId}`));
      if (fromHistory) {
        const tag = fromHistory.role;
        return {
          userId,
          label: tag.startsWith("user:") ? tag : `User ${userId}`,
        };
      }
      return { userId, label: `User ${userId}` };
    }),
  );
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

  // History is no longer injected — the model pulls it on demand via the
  // history MCP tools. The prompt carries only the system message and the
  // current turn (the replied-to message rides along in replyContext).
  const latest = buildLatestTurnMessage({
    ...latestTurn,
    isGroupChat,
    speakerTag: latestTurn.speakerTag ?? null,
  });

  const latestMessage: ChatMessage = {
    role: "user",
    content: latest,
    ...(latestTurn.images?.length ? { images: latestTurn.images } : {}),
  };

  return {
    systemContent: system,
    historyMessages: [],
    latestContent: latest,
    storedHistoryCount: 0,
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
