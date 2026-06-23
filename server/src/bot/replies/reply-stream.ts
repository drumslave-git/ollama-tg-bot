import type { Context } from "grammy";
import type { ReplyStreamSink } from "../../contracts/index.js";
import type { DeliveredReply } from "../../pipeline/deliver.js";
import { buildReplyExtra, splitTelegramMessage } from "./delivery.js";
import { replyHtml } from "./replies-helpers.js";
import { resolveTypingThreadParams } from "./typing.js";
import { visibleTelegramText } from "../../telegram/html.js";

/** Minimum gap between live edits — Telegram rate-limits message edits to ~1/s. */
const EDIT_INTERVAL_MS = 1000;
/** Live preview is plain text in a single message; keep it under the Telegram cap. */
const LIVE_MAX_CHARS = 3900;

function clipForLive(text: string): string {
  return text.length > LIVE_MAX_CHARS ? text.slice(0, LIVE_MAX_CHARS) : text;
}

/**
 * Progressive delivery of the main reply: opens one Telegram message on the
 * first content and edits it (throttled) as tokens arrive. {@link finalize}
 * replaces the live preview with the properly formatted HTML reply and sends
 * any overflow chunks.
 *
 * The live preview is plain text (no parse_mode) so partial/unclosed HTML can
 * never break a send; formatting is applied once at finalize.
 */
export class ReplyStream implements ReplyStreamSink {
  started = false;
  private messageId: number | null = null;
  private pending = "";
  private sentText = "";
  private editing = false;
  private lastEditAt = 0;

  constructor(
    private readonly ctx: Context,
    private readonly options: {
      chatId: number;
      messageThreadId?: number;
      inGroup?: boolean;
      isForum?: boolean;
    },
  ) {}

  push(replyText: string): void {
    this.pending = replyText;
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.editing) return;
    if (!this.pending.trim() || this.pending === this.sentText) return;
    if (this.messageId != null && Date.now() - this.lastEditAt < EDIT_INTERVAL_MS) {
      return;
    }

    this.editing = true;
    const text = clipForLive(this.pending);
    try {
      if (this.messageId == null) {
        const extra = buildReplyExtra(this.ctx, {
          messageThreadId: this.options.messageThreadId,
        });
        const sent = await this.ctx.api.sendMessage(this.options.chatId, text, extra);
        this.messageId = sent.message_id;
        this.started = true;
      } else {
        await this.ctx.api.editMessageText(this.options.chatId, this.messageId, text);
      }
      this.sentText = this.pending;
      this.lastEditAt = Date.now();
    } catch {
      // Ignore transient edit failures (rate limit, "message is not modified");
      // the next push or finalize will reconcile to the latest text.
    } finally {
      this.editing = false;
      if (this.pending !== this.sentText) void this.flush();
    }
  }

  /** Replace the live preview with the final HTML reply; send overflow as new messages. */
  async finalize(html: string): Promise<DeliveredReply> {
    const replyChars = visibleTelegramText(html).length;
    const chunks = splitTelegramMessage(html);
    const first = chunks[0] ?? "";

    if (this.messageId != null) {
      try {
        await this.ctx.api.editMessageText(this.options.chatId, this.messageId, first, {
          parse_mode: "HTML",
        });
      } catch {
        await this.ctx.api
          .editMessageText(this.options.chatId, this.messageId, visibleTelegramText(first))
          .catch(() => {});
      }
    } else {
      await replyHtml(
        this.ctx,
        first,
        buildReplyExtra(this.ctx, { messageThreadId: this.options.messageThreadId }),
      );
    }

    const replyExtra = buildReplyExtra(this.ctx, {
      messageThreadId: this.options.messageThreadId,
    });
    const typingThreadParams = resolveTypingThreadParams(
      this.options.inGroup
        ? { type: "supergroup", is_forum: this.options.isForum }
        : undefined,
      this.options.messageThreadId,
    );
    for (let i = 1; i < chunks.length; i++) {
      await this.ctx.api
        .sendChatAction(this.options.chatId, "typing", typingThreadParams)
        .catch(() => {});
      await replyHtml(this.ctx, chunks[i], replyExtra);
    }

    return {
      chunkCount: chunks.length,
      thinkingSent: false,
      replyChars,
    };
  }
}
