import type {
  PipelineDeliveryResult,
  PipelineTurnState,
} from "@llm-tg-bot/modules-registry";
import type { WebSearchSource } from "@llm-tg-bot/modules-web-search";
import type { MoodValues } from "../mood/index.js";
import { getActivePersonalityPrompt } from "../db/personalities/index.js";
import { getResolvedSettings } from "../settings/runtime.js";
import { getOwnerUserId, getOwnerUsername } from "../bot/owner/owner.js";
import { getUserFacts } from "../db/memory/user.js";
import { getGroupFacts } from "../db/memory/group.js";
import { getGeneralFacts } from "../db/memory/general.js";
import { buildSystemPrompt } from "./adapters/system-prompt.js";
import {
  buildChatMessages,
  type LatestTurnOptions,
} from "./chat-messages.js";
import { ensureHistoryFits } from "../debug/context-compress.js";
import {
  escapeHtml,
  hasVisibleTelegramReply,
  prepareTelegramHtml,
  visibleTelegramText,
} from "../telegram/html.js";

function formatSourceTitle(title: string): string {
  const trimmed = title.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 100) return trimmed;
  return `${trimmed.slice(0, 97).trimEnd()}...`;
}

function appendWebSearchSources(
  reply: string,
  sources: WebSearchSource[],
): string {
  if (sources.length === 0) return reply;

  const lines = sources.map((source, i) => {
    const title = escapeHtml(formatSourceTitle(source.title));
    const url = escapeHtml(source.url);
    return `${i + 1}. ${title}\n${url}`;
  });

  return `${reply.trim()}\n\nSources:\n${lines.join("\n")}`;
}

export function buildSystemPromptForTurn(state: PipelineTurnState): string {
  const settings = getResolvedSettings();
  const userId = state.userId;
  const groupChatId = state.groupChatId;
  const personalityPrompt =
    state.personalityPrompt ?? getActivePersonalityPrompt();

  return buildSystemPrompt({
    settings,
    customPrompt: personalityPrompt,
    generalMemoryFacts: getGeneralFacts(),
    groupMemoryFacts: groupChatId ? getGroupFacts(groupChatId) : [],
    participantFacts: [],
    knownChatUsers: [],
    isGroupChat: state.inGroup,
    ownerUserId: getOwnerUserId(),
    ownerUsername: getOwnerUsername(),
    mood: (state.mood ?? null) as MoodValues | null,
  });
}

export function buildChatContextForTurn(state: PipelineTurnState) {
  const settings = getResolvedSettings();
  const convKey = state.convKey;
  if (!convKey) {
    throw new Error("Missing conversation key");
  }

  const latestTurn: LatestTurnOptions = {
    body: state.latestBody,
    speakerTag: state.userRole,
    mentionedUsersContext: state.mentionedUsersContext,
    replyContext: state.replyContext,
    currentSpeaker: state.currentSpeaker as LatestTurnOptions["currentSpeaker"],
    currentSpeakerIsOwner: state.currentSpeakerIsOwner,
    isGroupChat: state.inGroup,
  };

  const userId = state.userId;
  const groupChatId = state.groupChatId;

  return buildChatMessages(
    state.personalityPrompt ?? getActivePersonalityPrompt(),
    convKey,
    latestTurn,
    {
      settings,
      isGroupChat: state.inGroup,
      groupMemoryFacts: groupChatId ? getGroupFacts(groupChatId) : [],
      generalMemoryFacts: getGeneralFacts(),
      currentUserId: userId,
      ownerUserId: getOwnerUserId(),
      ownerUsername: getOwnerUsername(),
      mood: (state.mood ?? null) as MoodValues | null,
      historyBeforeMessageId: state.telegramMessageId,
    },
  );
}

export function preparePipelineDelivery(
  state: PipelineTurnState,
): PipelineDeliveryResult {
  const replyBody = state.replyBody ?? "";
  const hasReply = hasVisibleTelegramReply(replyBody);
  const webSearchSources = (state.webSearchSources ?? []) as WebSearchSource[];
  const stickerFileId = state.stickerFileId ?? null;
  const stickerEmoji = state.stickerEmoji ?? null;

  if (!hasReply && !stickerFileId) {
    return { error: "Model response had no reply content" };
  }

  const replyWithSources = hasReply
    ? appendWebSearchSources(replyBody, webSearchSources)
    : replyBody;
  const historyText =
    hasReply && stickerEmoji
      ? `${replyWithSources}\n[sticker: ${stickerEmoji}]`
      : stickerEmoji
        ? `[sticker: ${stickerEmoji}]`
        : replyWithSources;

  const replyHtml = hasReply ? prepareTelegramHtml(replyWithSources) : "";

  return {
    replyHtml,
    thinking: state.thinking,
    stickerFileId,
    stickerEmoji,
    webSearchSources,
    historyText,
    skipUserHistory: state.skipUserHistory,
    userHistoryContent: state.userHistoryContent,
    userRole: state.userRole,
  };
}

export async function ensureHistoryFitsForTurn(convKey: string): Promise<void> {
  await ensureHistoryFits(convKey);
}

export function loadMemoryFactsForUser(userId: string): string[] {
  return getUserFacts(userId);
}

export function loadMemoryFactsForGroup(groupId: string): string[] {
  return getGroupFacts(groupId);
}

export function loadGeneralMemoryFacts(): string[] {
  return getGeneralFacts();
}
