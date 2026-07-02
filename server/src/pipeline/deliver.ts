import { InputFile, type Context } from "grammy";
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
import { visibleTelegramText } from "../telegram/html.js";

export interface DeliveredReply {
  chunkCount: number;
  replyChars: number;
  /** Telegram message ids of the sent reply chunks (for /explain trace lookup). */
  messageIds: number[];
}

/**
 * Send the text reply. The sticker is chosen and sent separately, off the
 * critical path — see {@link deliverReplySticker}.
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
    /** Thread the reply to the triggering message (answering the speaker). */
    threadAsReply?: boolean;
  },
): Promise<DeliveredReply> {
  const replyBody = delivery.replyHtml ?? "";
  const hasReply = Boolean(replyBody.trim());

  if (delivery.error) {
    throw new Error(delivery.error);
  }

  const { chunkCount, messageIds } = await sendChunkedHtmlReply(ctx, {
    chatId: options.chatId,
    html: hasReply ? replyBody : "",
    messageThreadId: options.messageThreadId,
    inGroup: options.inGroup,
    isForum: options.isForum,
    threadAsReply: options.threadAsReply,
  });

  const replyChars = hasReply ? visibleTelegramText(replyBody).length : 0;
  return { chunkCount, replyChars, messageIds };
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
    /** Thread the sticker to the triggering message (answering the speaker). */
    threadAsReply?: boolean;
  },
): Promise<void> {
  const stickerExtra: Parameters<Context["reply"]>[1] = {};
  if (options.messageThreadId) {
    stickerExtra.message_thread_id = options.messageThreadId;
  }
  // Only a sticker-only reply (no text preceded it) threads to the trigger, and
  // only when the turn answers the speaker; otherwise it is a plain send.
  if (options.threadAsReply && options.chunkCount === 0) {
    const replyExtra = buildReplyExtra(ctx, { threadAsReply: true });
    if (replyExtra?.reply_parameters) {
      stickerExtra.reply_parameters = replyExtra.reply_parameters;
    }
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

/** Send generated images as photos, following the already-delivered text reply. */
export async function deliverReplyImages(
  ctx: Context,
  options: {
    turnId: number;
    chatId: number;
    images: string[];
    chunkCount: number;
    messageThreadId?: number;
    /** Thread the image to the triggering message (answering the speaker). */
    threadAsReply?: boolean;
  },
): Promise<number> {
  let sent = 0;
  for (const [index, b64] of options.images.entries()) {
    const buffer = Buffer.from(b64, "base64");
    const photoExtra: Parameters<Context["api"]["sendPhoto"]>[2] = {};
    if (options.messageThreadId) {
      photoExtra.message_thread_id = options.messageThreadId;
    }
    // Only an image-only reply (no text preceded it) threads its first photo to
    // the trigger, and only when the turn answers the speaker.
    if (
      options.threadAsReply &&
      options.chunkCount === 0 &&
      index === 0
    ) {
      const replyExtra = buildReplyExtra(ctx, { threadAsReply: true });
      if (replyExtra?.reply_parameters) {
        photoExtra.reply_parameters = replyExtra.reply_parameters;
      }
    }
    await ctx.api.sendPhoto(
      options.chatId,
      new InputFile(buffer, `image-${index + 1}.png`),
      Object.keys(photoExtra).length > 0 ? photoExtra : undefined,
    );
    sent += 1;
  }
  if (sent > 0) {
    getMessageReport(options.turnId)?.okPhase(
      "image-sent",
      "Image",
      `Sent ${sent} image${sent === 1 ? "" : "s"}`,
    );
  }
  return sent;
}

/** Record the reply, log it, and finalize the debug report once delivery is done. */
export function finalizeReplyDelivery(options: {
  turnId: number;
  chatId: number;
  chunkCount: number;
  replyChars: number;
  messageIds?: number[];
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
    replyMessageIds: options.messageIds,
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
    messageIds: delivered.messageIds,
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
