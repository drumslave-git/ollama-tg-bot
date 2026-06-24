import type { Context } from "grammy";
import { replyParameters } from "./replies.js";
import { messageThreadExtra, resolveTypingThreadParams } from "./typing.js";
import { replyHtml } from "./replies-helpers.js";
import { escapeHtml } from "../../telegram/html.js";

export function splitTelegramMessage(text: string, maxLen = 4000): string[] {
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

export function buildReplyExtra(
  ctx: Context,
  options?: { messageThreadId?: number },
): Parameters<Context["reply"]>[1] {
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

export async function sendChunkedHtmlReply(
  ctx: Context,
  options: {
    chatId: number;
    html: string;
    messageThreadId?: number;
    inGroup?: boolean;
    isForum?: boolean;
  },
): Promise<{ chunkCount: number; messageIds: number[] }> {
  if (!options.html.trim()) {
    return { chunkCount: 0, messageIds: [] };
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

  const chunks = splitTelegramMessage(options.html);
  const messageIds: number[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) {
      await ctx.api
        .sendChatAction(options.chatId, "typing", typingThreadParams)
        .catch(() => {});
    }
    const sent = await replyHtml(ctx, chunks[i], replyExtra);
    if (sent?.message_id != null) messageIds.push(sent.message_id);
  }

  return { chunkCount: chunks.length, messageIds };
}

export async function deliverHtmlErrorReply(
  ctx: Context,
  options: {
    messageThreadId?: number;
    prefix: string;
    detail: string;
    plainFallback?: string;
  },
): Promise<void> {
  const errReplyExtra = buildReplyExtra(ctx, {
    messageThreadId: options.messageThreadId,
  });
  const html = `${options.prefix}\n\n<code>${escapeHtml(options.detail)}</code>`;
  await replyHtml(ctx, html, errReplyExtra).catch(async () => {
    await replyHtml(
      ctx,
      options.plainFallback ?? options.prefix,
      errReplyExtra,
    );
  });
}
