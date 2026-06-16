import type { Context } from "grammy";
import type { PipelineDeliveryResult } from "@llm-tg-bot/modules-registry";
import type { WebSearchSource } from "@llm-tg-bot/modules-web-search";
import { recordReply } from "../db/index.js";
import { getMessageReport } from "../debug/message-report.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import { replyParameters } from "../bot/replies/replies.js";
import {
  messageThreadExtra,
  resolveTypingThreadParams,
} from "../bot/replies/typing.js";
import { replyHtml } from "../bot/replies/replies-helpers.js";
import { sendThinkingMessages } from "../bot/replies/send-thinking.js";
import { getResolvedSettings } from "../settings/runtime.js";
import {
  escapeHtml,
  visibleTelegramText,
} from "../telegram/html.js";

function splitMessage(text: string, maxLen = 4000): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let curr = text;
  while (curr.length > maxLen) {
    let splitAt = curr.lastIndexOf("\n", maxLen);
    if (splitAt === -1) splitAt = curr.lastIndexOf(" ", maxLen);
    if (splitAt === -1) splitAt = maxLen;
    chunks.push(curr.slice(0, splitAt));
    curr = curr.slice(splitAt).trimStart();
  }
  if (curr) chunks.push(curr);
  return chunks;
}

function buildReplyExtra(
  ctx: Context,
  options?: { messageThreadId?: number },
) {
  const extra: Parameters<Context["reply"]>[1] = {};
  if (options?.messageThreadId) {
    const threadParams = messageThreadExtra({
      message_thread_id: options.messageThreadId,
    });
    if (threadParams) extra.message_thread_id = threadParams.message_thread_id;
  }
  const replyParams = replyParameters(ctx);
  if (replyParams) extra.reply_parameters = replyParams;
  return Object.keys(extra).length > 0 ? extra : undefined;
}

export async function deliverPipelineReply(
  ctx: Context,
  delivery: PipelineDeliveryResult,
  options: {
    turnId: number;
    chatId: number;
    inGroup: boolean;
    isForum?: boolean;
    messageThreadId?: number;
  },
): Promise<void> {
  const settings = getResolvedSettings();
  const report = getMessageReport(options.turnId);
  const replyBody = delivery.replyHtml ?? "";
  const hasReply = Boolean(replyBody.trim());
  const stickerFileId = delivery.stickerFileId ?? null;
  const stickerEmoji = delivery.stickerEmoji ?? null;
  const thinking = delivery.thinking;
  const webSearchSources = (delivery.webSearchSources ?? []) as WebSearchSource[];

  if (delivery.error) {
    throw new Error(delivery.error);
  }

  const replyExtra = buildReplyExtra(ctx, {
    messageThreadId: options.messageThreadId,
  });
  const typingThreadParams = resolveTypingThreadParams(
    options.inGroup
      ? { type: "supergroup", is_forum: options.isForum }
      : undefined,
    options.messageThreadId,
  );

  const chunks = hasReply ? splitMessage(replyBody) : [];

  let thinkingSent = false;
  if (settings.thinkingEnabled && settings.sendThinkingEnabled && thinking) {
    const thinkingChunks = await sendThinkingMessages(
      ctx,
      options.chatId,
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
        .sendChatAction(options.chatId, "typing", typingThreadParams)
        .catch(() => {});
    }
    await replyHtml(ctx, chunks[i], replyExtra);
  }

  if (stickerFileId) {
    const stickerExtra: Parameters<Context["reply"]>[1] = {};
    if (options.messageThreadId) {
      stickerExtra.message_thread_id = options.messageThreadId;
    }
    if (chunks.length === 0 && replyExtra?.reply_parameters) {
      stickerExtra.reply_parameters = replyExtra.reply_parameters;
    }
    await ctx.api.sendSticker(
      options.chatId,
      stickerFileId,
      Object.keys(stickerExtra).length > 0 ? stickerExtra : undefined,
    );
  }

  recordReply(false);
  const replyChars = hasReply
    ? visibleTelegramText(replyBody).length
    : 0;
  logEvent("reply_sent", {
    turnId: options.turnId,
    chatId: options.chatId,
    chunkCount: chunks.length,
    replyChars,
    sticker: stickerEmoji ?? undefined,
    skipUserHistory: Boolean(delivery.skipUserHistory),
    sourceCount: webSearchSources.length,
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
}

export async function deliverEarlyReply(
  ctx: Context,
  text: string,
  turnId: number,
): Promise<void> {
  const report = getMessageReport(turnId);
  report?.finalizeEarlyReply({ reason: text });
  await replyHtml(ctx, text);
  recordReply(false);
}

export async function deliverPipelineError(
  ctx: Context,
  err: unknown,
  options: { turnId: number; chatId?: number; messageThreadId?: number },
): Promise<void> {
  const msg = err instanceof Error ? err.message : "Something went wrong";
  logEventError("reply_failed", err, { turnId: options.turnId });
  getMessageReport(options.turnId)?.finalizeError(msg);

  const errReplyExtra = buildReplyExtra(ctx, {
    messageThreadId: options.messageThreadId,
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
    );
  });
}
