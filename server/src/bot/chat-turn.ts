import type { Context } from "grammy";
import type { ChatMessage } from "../llm/client.js";
import { chatCompleteDetailed } from "../llm/client.js";
import {
  recordError,
  recordReply,
  type ErrorLogInput,
} from "../db/database.js";
import { getActivePersonalityPrompt } from "../db/personalities.js";
import { getResolvedHistoryLimits, getResolvedSettings } from "../settings-runtime.js";
import { extractTelegramReply } from "../response-format.js";
import {
  escapeHtml,
  hasVisibleTelegramReply,
  prepareTelegramHtml,
  visibleTelegramText,
} from "../telegram/html.js";
import { type TavilySource } from "../tavily/client.js";
import type { CurrentSpeaker } from "./speaker.js";
import {
  buildChatMessages,
  recordExchange,
} from "./conversation.js";
import { scheduleMemoryPersistence } from "../memory-extract.js";
import type { MemoryExtractInput } from "../memory-extract.js";
import { getOwnerUserId, getOwnerUsername } from "./owner.js";
import { replyParameters } from "./replies.js";
import { logEvent, logEventError } from "../event-log.js";
import { getMessageReport } from "../message-report.js";
import {
  analyzeStickerForReply,
  rollStickerReplyChance,
} from "./sticker-analyze.js";
import { resolveStickerFileId } from "./sticker-catalog.js";
import {
  getHistory,
  historyToChatMessages,
  historyTotalTokens,
} from "../db/history.js";
import { ensureHistoryFits } from "../context-compress.js";
import { getEffectiveMood, saveMoodState } from "../db/mood.js";
import { evaluateMood } from "../mood-evaluate.js";
import { sendThinkingMessages } from "./send-thinking.js";
import { messageThreadExtra, resolveTypingThreadParams } from "./typing.js";

import {
  evaluateMoodForTurn,
  fetchLinksForTurn,
  searchWebForTurn,
  analyzeStickerForTurn,
  buildReplyExtra,
  splitMessage,
} from "./chat-turn-steps.js";

export type ChatTurnMemoryInput = Omit<MemoryExtractInput, "assistantReply">;

export interface ChatTurnInput {
  turnId: number;
  convKey: string;
  chatId: number;
  userId: string | null;
  groupChatId: string | null;
  inGroup: boolean;
  latestBody: string;
  userRole: string | null;
  userHistoryContent: string | null;
  skipUserHistory?: boolean;
  userMemoryFacts: string[];
  groupMemoryFacts: string[];
  generalMemoryFacts: string[];
  memoryInput: ChatTurnMemoryInput;
  currentSpeaker?: CurrentSpeaker | null;
  currentSpeakerIsOwner?: boolean;
  replyContext?: string | null;
  mentionedUsersContext?: string | null;
  messageThreadId?: number;
  isForum?: boolean;
}

async function replyHtml(
  ctx: Context,
  text: string,
  extra?: Parameters<Context["reply"]>[1],
) {
  try {
    return await ctx.reply(text, { parse_mode: "HTML", ...extra });
  } catch {
    return await ctx.reply(text, extra);
  }
}

function formatSourceTitle(title: string): string {
  const trimmed = title.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 100) return trimmed;
  return `${trimmed.slice(0, 97).trimEnd()}...`;
}

function appendWebSearchSources(
  reply: string,
  sources: TavilySource[],
): string {
  if (sources.length === 0) return reply;

  const lines = sources.map((source, i) => {
    const title = escapeHtml(formatSourceTitle(source.title));
    const url = escapeHtml(source.url);
    return `${i + 1}. ${title}\n${url}`;
  });

  return `${reply.trim()}\n\nSources:\n${lines.join("\n")}`;
}

export async function runChatTurn(
  ctx: Context,
  input: ChatTurnInput,
): Promise<void> {
  const settings = getResolvedSettings();
  const report = getMessageReport(input.turnId);

  const turnLog = {
    turnId: input.turnId,
    chatId: input.chatId,
    userId: input.userId,
    groupId: input.groupChatId,
    convKey: input.convKey,
    inGroup: input.inGroup,
  };

  try {
    logEvent("chat_turn_started", turnLog);

    await ensureHistoryFits(input.convKey);

    const storedHistory = getHistory(input.convKey);
    const historyMessages = historyToChatMessages(storedHistory);
    const moodContextText = historyMessages
      .map((m) => {
        const namePart = m.name ? ` [name: ${m.name}]` : "";
        return `[${m.role}${namePart}]: ${m.content}`;
      })
      .join("\n\n");
    const moodLatestTurnPreview = [
      input.mentionedUsersContext,
      input.replyContext,
      input.latestBody,
    ]
      .filter((part) => part?.trim())
      .join("\n\n");

    const moodPromise = evaluateMoodForTurn(input, moodContextText, moodLatestTurnPreview);
    const linkFetch = await fetchLinksForTurn(input);
    const { webSearchContext, webSearchSources } = await searchWebForTurn(input, linkFetch.resolved, turnLog);

    const evaluatedMood = await moodPromise;

    logEvent("llm_reply_started", turnLog);
    const built = buildChatMessages(
      getActivePersonalityPrompt(),
      input.convKey,
      {
        body: input.latestBody,
        speakerTag: input.userRole,
        mentionedUsersContext: input.mentionedUsersContext,
        replyContext: input.replyContext,
        linkFetchContext: linkFetch.context,
        webSearchContext,
        currentSpeaker: input.currentSpeaker,
        currentSpeakerIsOwner: input.currentSpeakerIsOwner,
        isGroupChat: input.inGroup,
      },
      {
        settings,
        isGroupChat: input.inGroup,
        groupMemoryFacts: input.groupMemoryFacts,
        generalMemoryFacts: input.generalMemoryFacts,
        currentUserId: input.userId,
        ownerUserId: getOwnerUserId(),
        ownerUsername: getOwnerUsername(),
        mood: evaluatedMood,
      },
    );

    const historyLimits = getResolvedHistoryLimits(settings);
    const injectedChars = built.historyMessages.reduce(
      (n, m) => n + m.content.length,
      0,
    );
    const injectedTokens = historyTotalTokens(storedHistory);

    report?.okPhase(
      "context",
      "Chat context",
      `${built.historyMessages.length} history messages · ${injectedTokens} tokens injected`,
      undefined,
      {
        type: "fields",
        fields: [
          {
            label: "Stored messages",
            value: String(built.storedHistoryCount),
          },
          {
            label: "Injected messages",
            value: String(built.historyMessages.length),
          },
          { label: "Max tokens", value: String(historyLimits.historyMaxTokens) },
          { label: "Injected tokens", value: String(injectedTokens) },
          { label: "Injected chars", value: String(injectedChars) },
          { label: "Latest turn chars", value: String(built.latestContent.length) },
        ],
      },
    );

    const { raw: modelOutput, thinking } = await chatCompleteDetailed(
      built.messages,
      {
        think: true,
        traceTurnId: input.turnId,
        traceLabel: "main reply",
        traceLayout: {
          system: built.systemContent,
          history: built.historyMessages,
          latest: built.latestContent,
        },
      },
    );

    const replyBody = extractTelegramReply(modelOutput);
    const hasReply = hasVisibleTelegramReply(replyBody);

    const { stickerEmoji, stickerFileId } = await analyzeStickerForTurn(input, replyBody, turnLog);

    if (!hasReply && !stickerFileId) {
      throw new Error("Model response had no [REPLY] content");
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

    const reply = hasReply ? prepareTelegramHtml(replyWithSources) : "";
    recordExchange(
      input.convKey,
      input.userRole,
      input.userHistoryContent,
      historyText,
      { skipUser: input.skipUserHistory },
    );
    const chunks = reply ? splitMessage(reply) : [];

    const replyExtra = buildReplyExtra(ctx, {
      messageThreadId: input.messageThreadId,
    });
    const typingThreadParams = resolveTypingThreadParams(
      input.inGroup
        ? { type: "supergroup", is_forum: input.isForum }
        : undefined,
      input.messageThreadId,
    );

    let thinkingSent = false;
    if (settings.thinkingEnabled && settings.sendThinkingEnabled && thinking) {
      const thinkingChunks = await sendThinkingMessages(
        ctx,
        input.chatId,
        thinking,
        typingThreadParams,
      );
      if (thinkingChunks > 0) {
        thinkingSent = true;
        report?.okPhase(
          "thinking",
          "Thinking messages",
          `${thinkingChunks} chunk(s) · ${thinking.length} chars`,
        );
      }
    }

    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) {
        await ctx.api
          .sendChatAction(input.chatId, "typing", typingThreadParams)
          .catch(() => {});
      }
      await replyHtml(ctx, chunks[i], replyExtra);
    }

    if (stickerFileId) {
      const stickerExtra: Parameters<Context["reply"]>[1] = {};
      if (input.messageThreadId) {
        stickerExtra.message_thread_id = input.messageThreadId;
      }
      if (chunks.length === 0 && replyExtra?.reply_parameters) {
        stickerExtra.reply_parameters = replyExtra.reply_parameters;
      }
      await ctx.api.sendSticker(
        input.chatId,
        stickerFileId,
        Object.keys(stickerExtra).length > 0 ? stickerExtra : undefined,
      );
    }

    recordReply(false);
    const replyChars = hasReply ? visibleTelegramText(replyWithSources).length : 0;
    logEvent("reply_sent", {
      ...turnLog,
      chunkCount: chunks.length,
      replyChars,
      sticker: stickerEmoji ?? undefined,
      skipUserHistory: Boolean(input.skipUserHistory),
    });

    report?.okPhase(
      "delivery",
      "Delivery",
      [
        chunks.length > 0 ? `${chunks.length} text chunk(s)` : null,
        replyChars > 0 ? `${replyChars} chars` : null,
        stickerEmoji ? `sticker ${stickerEmoji}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Sticker only",
    );

    report?.finalizeProcessed({
      replyChars,
      chunks: chunks.length,
      sticker: stickerEmoji ?? undefined,
      thinkingSent,
      awaitMemory: true,
    });

    scheduleMemoryPersistence({
      userId: input.userId,
      groupChatId: input.groupChatId,
      turnId: input.turnId,
      input: { ...input.memoryInput, assistantReply: historyText },
    });
  } catch (err) {
    logEventError("reply_failed", err, turnLog);
    report?.finalizeError(err instanceof Error ? err.message : String(err));
    const detail: ErrorLogInput = {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      chatId: input.chatId,
      userId: input.userId ?? undefined,
    };
    recordError(detail);
    const msg =
      err instanceof Error ? err.message : "Something went wrong";
    const errReplyExtra = buildReplyExtra(ctx, {
      messageThreadId: input.messageThreadId,
    });
    await replyHtml(
      ctx,
      `Sorry, I could not get a response from the LLM.\n\n<code>${escapeHtml(msg)}</code>`,
      errReplyExtra,
    ).catch(async () => {
      await replyHtml(
        ctx,
        `Sorry, I could not get a response from the LLM.\n\n${escapeHtml(msg)}`,
        errReplyExtra,
      ).catch((e) => logEventError("error_reply_failed", e, turnLog));
    });
  }
}
