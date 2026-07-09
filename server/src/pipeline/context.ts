import type {
  PipelineDeliveryResult,
  PipelineTurnState,
} from "../contracts/index.js";
import type { WebSearchSource } from "../features/web-search/index.js";
import type { MoodValues } from "../features/mood/index.js";
import {
  getActivePersonalityPrompt,
  getEffectiveMood,
} from "../features/mood/db/index.js";
import { getSettings } from "../db/index.js";
import { getResolvedSettings } from "../settings/runtime.js";
import { getOwnerUserId, getOwnerUsername } from "../bot/owner/owner.js";
import { getTaskTurnContext } from "../features/tasks/index.js";
import { getTaskById } from "../features/tasks/db/index.js";
import { buildSystemPrompt } from "./adapters/system-prompt.js";
import { resolveEnabledMcpToolNames } from "../runtime/mcp-tools.js";
import {
  buildChatMessages,
  type LatestTurnOptions,
} from "./chat-messages.js";
import {
  escapeHtml,
  hasVisibleTelegramReply,
  prepareTelegramHtml,
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

/** The task a turn replies to (when it replies to a task's fired message). */
async function resolveRepliedTask(): Promise<{
  id: number;
  instruction: string;
} | null> {
  const repliedTaskId = getTaskTurnContext()?.repliedTaskId ?? null;
  const record = repliedTaskId != null ? await getTaskById(repliedTaskId) : null;
  return record ? { id: record.id, instruction: record.instruction } : null;
}

export async function buildSystemPromptForTurn(
  state: PipelineTurnState,
): Promise<string> {
  const settings = getResolvedSettings(await getSettings());
  const personalityPrompt =
    state.personalityPrompt ?? (await getActivePersonalityPrompt());

  // Per-turn context (session, mood, speaker) is NOT part of the system
  // prompt — it rides in the latest user message (buildTurnContextBlocks) so
  // the system prompt stays byte-identical across turns for prompt caching.
  return buildSystemPrompt({
    settings,
    customPrompt: personalityPrompt,
    knownChatUsers: [],
    ownerUserId: await getOwnerUserId(),
    ownerUsername: await getOwnerUsername(),
    enabledToolNames: resolveEnabledMcpToolNames(settings),
  });
}

export async function buildChatContextForTurn(state: PipelineTurnState) {
  const settings = getResolvedSettings(await getSettings());
  const convKey = state.convKey;
  if (!convKey) {
    throw new Error("Missing conversation key");
  }

  const latestTurn: LatestTurnOptions = {
    body: state.latestBody,
    speakerTag: state.userRole,
    mentionedUsersContext: state.mentionedUsersContext,
    replyContext: state.replyContext,
    replyToMessageId: state.replyToMessageId ?? null,
    currentSpeaker: state.currentSpeaker as LatestTurnOptions["currentSpeaker"],
    currentSpeakerIsOwner: state.currentSpeakerIsOwner,
    isGroupChat: state.inGroup,
    images: state.images,
  };

  const userId = state.userId;

  return buildChatMessages(
    state.personalityPrompt ?? (await getActivePersonalityPrompt()),
    convKey,
    latestTurn,
    {
      settings,
      isGroupChat: state.inGroup,
      chatId: state.chatId ?? null,
      currentUserId: userId,
      ownerUserId: await getOwnerUserId(),
      ownerUsername: await getOwnerUsername(),
      mood: (state.mood ?? (await getEffectiveMood())) as MoodValues | null,
      currentUserIsOwner: state.currentSpeakerIsOwner === true,
      repliedTask: await resolveRepliedTask(),
      currentMessageId: state.chatMessageId ?? null,
      enabledToolNames: resolveEnabledMcpToolNames(settings),
    },
  );
}

export function preparePipelineDelivery(
  state: PipelineTurnState,
): PipelineDeliveryResult {
  const replyBody = state.replyBody ?? "";
  const hasReply = hasVisibleTelegramReply(replyBody);
  const webSearchSources = (state.webSearchSources ?? []) as WebSearchSource[];
  const generatedImages = (state.generatedImages ?? []) as string[];
  const stickerFileId = state.stickerFileId ?? null;
  const stickerEmoji = state.stickerEmoji ?? null;

  // A generated image is deliverable content on its own, even with no text.
  if (!hasReply && !stickerFileId && generatedImages.length === 0) {
    return { error: "Model response had no reply content" };
  }

  const replyWithSources = hasReply
    ? appendWebSearchSources(replyBody, webSearchSources)
    : replyBody;
  const replyHtml = hasReply ? prepareTelegramHtml(replyWithSources) : "";

  return {
    replyHtml,
    thinking: state.thinking,
    stickerFileId,
    stickerEmoji,
    webSearchSources,
    generatedImages,
  };
}
