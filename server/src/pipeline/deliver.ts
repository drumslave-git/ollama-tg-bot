import type { Context } from "grammy";
import type { PipelineDeliveryResult } from "@llm-tg-bot/modules-registry";
import type { WebSearchSource } from "@llm-tg-bot/modules-web-search";
import { recordReply } from "../db/index.js";
import { getMessageReport } from "../debug/message-report.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import {
  buildReplyExtra,
  deliverHtmlErrorReply,
  sendChunkedHtmlReply,
} from "../bot/replies/delivery.js";
import { replyHtml } from "../bot/replies/replies-helpers.js";
import { getResolvedSettings } from "../settings/runtime.js";
import { visibleTelegramText } from "../telegram/html.js";

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

  const { chunkCount, thinkingSent } = await sendChunkedHtmlReply(ctx, {
    chatId: options.chatId,
    html: hasReply ? replyBody : "",
    thinking,
    sendThinking:
      settings.thinkingEnabled && settings.sendThinkingEnabled,
    messageThreadId: options.messageThreadId,
    inGroup: options.inGroup,
    isForum: options.isForum,
  });

  if (thinkingSent && thinking) {
    report?.okPhase(
      "thinking",
      "Thinking messages",
      `${thinking.length} chars`,
    );
  }

  if (stickerFileId) {
    const stickerExtra: Parameters<Context["reply"]>[1] = {};
    if (options.messageThreadId) {
      stickerExtra.message_thread_id = options.messageThreadId;
    }
    if (chunkCount === 0 && replyExtra?.reply_parameters) {
      stickerExtra.reply_parameters = replyExtra.reply_parameters;
    }
    await ctx.api.sendSticker(
      options.chatId,
      stickerFileId,
      Object.keys(stickerExtra).length > 0 ? stickerExtra : undefined,
    );
    report?.okPhase(
      "sticker-sent",
      "Sticker",
      stickerEmoji ? `Sent ${stickerEmoji}` : "Sent",
    );
  }

  recordReply(false);
  const replyChars = hasReply
    ? visibleTelegramText(replyBody).length
    : 0;
  logEvent("reply_sent", {
    turnId: options.turnId,
    chatId: options.chatId,
    chunkCount,
    replyChars,
    sticker: stickerEmoji ?? undefined,
    skipUserHistory: Boolean(delivery.skipUserHistory),
    sourceCount: webSearchSources.length,
  });

  report?.okPhase(
    "delivery",
    "Delivery",
    [
      chunkCount > 0 ? `${chunkCount} text chunk(s)` : null,
      replyChars > 0 ? `${replyChars} chars` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Sticker only",
  );

  report?.finalizeProcessed({
    replyChars,
    chunks: chunkCount,
    sticker: stickerEmoji ?? undefined,
    thinkingSent,
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

  await deliverHtmlErrorReply(ctx, {
    messageThreadId: options.messageThreadId,
    prefix: "Sorry, I could not get a response from the LLM.",
    detail: msg,
    plainFallback: `Sorry, I could not get a response from the LLM.\n\n${msg}`,
  });
}
