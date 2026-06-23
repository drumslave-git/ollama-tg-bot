import type { Context } from "grammy";
import type { PipelineDeliveryResult } from "../contracts/index.js";
import type { WebSearchSource } from "../features/web-search/index.js";
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

export interface DeliveredReply {
  chunkCount: number;
  thinkingSent: boolean;
  replyChars: number;
}

/**
 * Send the text reply (and optional thinking messages). The sticker is chosen
 * and sent separately, off the critical path — see {@link deliverReplySticker}.
 */
export async function deliverReplyText(
  ctx: Context,
  delivery: PipelineDeliveryResult,
  options: {
    turnId: number;
    chatId: number;
    inGroup: boolean;
    isForum?: boolean;
    messageThreadId?: number;
  },
): Promise<DeliveredReply> {
  const settings = getResolvedSettings();
  const report = getMessageReport(options.turnId);
  const replyBody = delivery.replyHtml ?? "";
  const hasReply = Boolean(replyBody.trim());
  const thinking = delivery.thinking;

  if (delivery.error) {
    throw new Error(delivery.error);
  }

  const { chunkCount, thinkingSent } = await sendChunkedHtmlReply(ctx, {
    chatId: options.chatId,
    html: hasReply ? replyBody : "",
    thinking,
    sendThinking: settings.thinkingEnabled && settings.sendThinkingEnabled,
    messageThreadId: options.messageThreadId,
    inGroup: options.inGroup,
    isForum: options.isForum,
  });

  if (thinkingSent && thinking) {
    report?.okPhase("thinking", "Thinking messages", `${thinking.length} chars`);
  }

  const replyChars = hasReply ? visibleTelegramText(replyBody).length : 0;
  return { chunkCount, thinkingSent, replyChars };
}

/** Send the chosen sticker as a follow-up to the already-delivered text reply. */
export async function deliverReplySticker(
  ctx: Context,
  options: {
    turnId: number;
    chatId: number;
    stickerFileId: string;
    stickerEmoji?: string | null;
    chunkCount: number;
    messageThreadId?: number;
  },
): Promise<void> {
  const replyExtra = buildReplyExtra(ctx, {
    messageThreadId: options.messageThreadId,
  });
  const stickerExtra: Parameters<Context["reply"]>[1] = {};
  if (options.messageThreadId) {
    stickerExtra.message_thread_id = options.messageThreadId;
  }
  if (options.chunkCount === 0 && replyExtra?.reply_parameters) {
    stickerExtra.reply_parameters = replyExtra.reply_parameters;
  }
  await ctx.api.sendSticker(
    options.chatId,
    options.stickerFileId,
    Object.keys(stickerExtra).length > 0 ? stickerExtra : undefined,
  );
  getMessageReport(options.turnId)?.okPhase(
    "sticker-sent",
    "Sticker",
    options.stickerEmoji ? `Sent ${options.stickerEmoji}` : "Sent",
  );
}

/** Record the reply, log it, and finalize the debug report once delivery is done. */
export function finalizeReplyDelivery(options: {
  turnId: number;
  chatId: number;
  chunkCount: number;
  replyChars: number;
  thinkingSent: boolean;
  stickerEmoji?: string | null;
  webSearchSources?: WebSearchSource[];
}): void {
  const report = getMessageReport(options.turnId);
  const sourceCount = (options.webSearchSources ?? []).length;

  recordReply(false);
  logEvent("reply_sent", {
    turnId: options.turnId,
    chatId: options.chatId,
    chunkCount: options.chunkCount,
    replyChars: options.replyChars,
    sticker: options.stickerEmoji ?? undefined,
    sourceCount,
  });

  report?.okPhase(
    "delivery",
    "Delivery",
    [
      options.chunkCount > 0 ? `${options.chunkCount} text chunk(s)` : null,
      options.replyChars > 0 ? `${options.replyChars} chars` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Sticker only",
  );

  report?.finalizeProcessed({
    replyChars: options.replyChars,
    chunks: options.chunkCount,
    sticker: options.stickerEmoji ?? undefined,
    thinkingSent: options.thinkingSent,
  });
}

/**
 * Deliver a fully-prepared reply (text, then sticker) in one call. Retained for
 * callers that already have the sticker resolved; the queue runner instead
 * interleaves post-reply work between the text and sticker sends.
 */
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
  const delivered = await deliverReplyText(ctx, delivery, options);
  const stickerFileId = delivery.stickerFileId ?? null;
  if (stickerFileId) {
    await deliverReplySticker(ctx, {
      turnId: options.turnId,
      chatId: options.chatId,
      stickerFileId,
      stickerEmoji: delivery.stickerEmoji,
      chunkCount: delivered.chunkCount,
      messageThreadId: options.messageThreadId,
    });
  }
  finalizeReplyDelivery({
    turnId: options.turnId,
    chatId: options.chatId,
    chunkCount: delivered.chunkCount,
    replyChars: delivered.replyChars,
    thinkingSent: delivered.thinkingSent,
    stickerEmoji: delivery.stickerEmoji,
    webSearchSources: (delivery.webSearchSources ?? []) as WebSearchSource[],
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
