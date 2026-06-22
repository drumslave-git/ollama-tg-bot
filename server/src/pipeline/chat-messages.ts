import type { ChatMessage } from "../llm/client.js";
import {
  appendAssistantMessage,
  appendMessage,
  getHistory,
  historyToChatMessages,
  insertAssistantAfterMessage,
} from "../db/history/index.js";
import {
  formatKnownUserLabel,
  getKnownUserById,
  getKnownUsersByIds,
} from "../db/users/known-users.js";
import { getUserFacts } from "../db/memory/user.js";
import { logEvent } from "../logging/event-log.js";
import type { Settings } from "../db/index.js";
import {
  buildSystemPrompt,
  type ParticipantFacts,
} from "./adapters/system-prompt.js";
import { resolveEnabledMcpToolNames } from "../runtime/mcp-tools.js";
import type { MoodValues } from "../mood/index.js";
import { extractParticipantUserIds, filterInjectableHistory, historyBeforeMessageId } from "../features/history/index.js";
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

function loadKnownChatUsers(
  chatKey: string,
  currentUserId: string | null,
): ReturnType<typeof getKnownUsersByIds> {
  const history = getHistory(chatKey);
  const roles = history.map((m) => m.role);
  const participantIds = extractParticipantUserIds(
    roles,
    currentUserId ? [currentUserId] : [],
  );
  return getKnownUsersByIds(participantIds);
}

function loadParticipantFacts(
  chatKey: string,
  currentUserId: string | null,
): ParticipantFacts[] {
  return loadChatParticipants(chatKey, currentUserId).map((participant) => ({
    userId: participant.userId,
    label: participant.label,
    facts: getUserFacts(participant.userId),
  }));
}

export function loadChatParticipants(
  chatKey: string,
  currentUserId: string | null,
): { userId: string; label: string }[] {
  const history = getHistory(chatKey);
  const roles = history.map((m) => m.role);
  const participantIds = extractParticipantUserIds(
    roles,
    currentUserId ? [currentUserId] : [],
  );

  return participantIds.map((userId) => {
    const known = getKnownUserById(userId);
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
  });
}

export interface BuiltChatPayload {
  messages: ChatMessage[];
  systemContent: string;
  historyMessages: ChatMessage[];
  latestContent: string;
  storedHistoryCount: number;
}

export function buildChatMessages(
  customSystemPrompt: string,
  chatKey: string,
  latestTurn: LatestTurnOptions,
  options: {
    settings: Settings;
    isGroupChat?: boolean;
    groupMemoryFacts?: string[];
    generalMemoryFacts?: string[];
    currentUserId?: string | null;
    ownerUserId?: string | null;
    ownerUsername?: string | null;
    mood?: MoodValues | null;
    historyBeforeMessageId?: number;
  },
): BuiltChatPayload {
  const {
    settings,
    isGroupChat = false,
    groupMemoryFacts = [],
    generalMemoryFacts = [],
    currentUserId = null,
    ownerUserId = null,
    ownerUsername = null,
    mood = null,
  } = options;

  const participantFacts = loadParticipantFacts(chatKey, currentUserId);
  const knownChatUsers = loadKnownChatUsers(chatKey, currentUserId);
  for (const p of participantFacts) {
    const known = getKnownUserById(p.userId);
    if (known) {
      p.label = formatKnownUserLabel(known);
      continue;
    }
    const fromHistory = getHistory(chatKey).find(
      (m) => m.role.endsWith(`:${p.userId}`),
    );
    if (fromHistory) {
      const tag = fromHistory.role;
      p.label = tag.startsWith("user:") ? tag : p.label;
    }
    if (
      latestTurn.currentSpeaker &&
      latestTurn.currentSpeaker.userId === p.userId
    ) {
      p.label = latestTurn.currentSpeaker.label;
    }
  }

  const system = buildSystemPrompt({
    settings,
    customPrompt: customSystemPrompt,
    generalMemoryFacts,
    groupMemoryFacts,
    participantFacts,
    knownChatUsers: isGroupChat ? knownChatUsers : [],
    isGroupChat,
    ownerUserId,
    ownerUsername,
    mood,
    enabledMcpToolNames: resolveEnabledMcpToolNames(settings.workflowSteps ?? []),
  });

  const storedHistory = getHistory(chatKey);
  const injectableHistory =
    options.historyBeforeMessageId != null
      ? historyBeforeMessageId(storedHistory, options.historyBeforeMessageId)
      : filterInjectableHistory(storedHistory);
  const historySource =
    options.historyBeforeMessageId == null &&
    isGroupChat &&
    latestTurn.speakerTag &&
    storedHistory.at(-1)?.role === latestTurn.speakerTag
      ? injectableHistory.slice(0, -1)
      : injectableHistory;
  const history = historyToChatMessages(historySource);
  const latest = buildLatestTurnMessage({
    ...latestTurn,
    isGroupChat,
    speakerTag: latestTurn.speakerTag ?? null,
  });

  const latestMessage: ChatMessage = { role: "user", content: latest };

  return {
    systemContent: system,
    historyMessages: history,
    latestContent: latest,
    storedHistoryCount: injectableHistory.length,
    messages: [{ role: "system", content: system }, ...history, latestMessage],
  };
}

export function recordExchange(
  chatKey: string,
  userRole: string | null,
  userContent: string | null,
  assistantText: string,
  options?: { skipUser?: boolean; anchorMessageId?: number },
): void {
  if (!options?.skipUser && userRole && userContent?.trim()) {
    appendMessage(
      chatKey,
      userRole,
      userContent,
      options?.anchorMessageId != null
        ? { messageId: options.anchorMessageId }
        : undefined,
    );
  }
  if (options?.anchorMessageId != null) {
    insertAssistantAfterMessage(chatKey, options.anchorMessageId, assistantText);
  } else {
    appendAssistantMessage(chatKey, assistantText);
  }
  logEvent("history_exchange_stored", {
    convKey: chatKey,
    skipUser: Boolean(options?.skipUser),
    anchorMessageId: options?.anchorMessageId ?? null,
    hasUserRow: !options?.skipUser && Boolean(userRole && userContent?.trim()),
  });
}
