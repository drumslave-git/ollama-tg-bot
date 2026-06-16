import type { Context } from "grammy";
import { logEvent, logEventError, type EventFields } from "../../logging/event-log.js";
import { getMaxDebugTraceId } from "../../db/debug/traces.js";
import { beginMessageReport, getMessageReport } from "../../debug/message-report.js";
import { extractText } from "../messages/message-content.js";
import { summarizeMessageContent } from "../replies/replies.js";
import { isSlashCommandMessage } from "../commands/slash-command.js";
import { messageHasVisionMedia } from "../media/vision-adapter.js";
import { mediaKindForMessage } from "@llm-tg-bot/modules-history";
import { recordMessageReceived } from "../../db/index.js";
import { isMaintenanceBlocked } from "../maintenance/maintenance.js";
import { startTypingForMessage } from "../replies/typing.js";
import {
  createInitialPipelineState,
  createPipelineServices,
  runMessagePipeline,
  runPipelinePhaseBackground,
} from "../../pipeline/index.js";
import {
  deliverEarlyReply,
  deliverPipelineError,
  deliverPipelineReply,
} from "../../pipeline/deliver.js";

let nextTurnId: number | null = null;

function allocateTurnId(): number {
  if (nextTurnId == null) {
    nextTurnId = getMaxDebugTraceId() + 1;
  }
  return nextTurnId!++;
}

export async function messageHandler(ctx: Context, botToken: string) {
  if (!ctx.message) return;

  let turnId = 0;
  let report: ReturnType<typeof beginMessageReport> | null = null;
  let msgLog: EventFields = {};

  try {
    turnId = allocateTurnId();
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id != null ? String(ctx.from.id) : null;
    const chatType = ctx.chat?.type ?? "unknown";
    const messagePreview =
      extractText(ctx) ||
      summarizeMessageContent(ctx.message).slice(0, 200) ||
      "(non-text message)";

    report =
      chatId != null
        ? beginMessageReport({
            turnId,
            chatId,
            userId,
            chatType,
            messageId: ctx.message.message_id ?? null,
            messagePreview,
          })
        : null;

    msgLog = {
      turnId,
      chatId,
      userId: ctx.from?.id,
      chatType: ctx.chat?.type,
    };

    logEvent("message_received", msgLog);

    if (ctx.from?.is_bot) {
      logEvent("message_ignored", { ...msgLog, reason: "from_bot" });
      report?.finishIgnored("from_bot");
      return;
    }

    if (isSlashCommandMessage(ctx)) {
      logEvent("message_ignored", { ...msgLog, reason: "slash_command" });
      report?.finishIgnored("slash_command");
      return;
    }

    const text = extractText(ctx);
    const hasMedia =
      !!ctx.message.photo ||
      !!ctx.message.sticker ||
      !!ctx.message.document;

    report?.setIntake({
      hasMedia,
      mediaKind: hasMedia
        ? mediaKindForMessage(ctx.message, !!ctx.message.sticker)
        : undefined,
    });

    if (!text && !hasMedia) {
      logEvent("message_ignored", { ...msgLog, reason: "no_content" });
      report?.finishIgnored("no_content");
      return;
    }

    if (messageHasVisionMedia(ctx.message)) {
      logEvent("media_detected", {
        ...msgLog,
        mediaKind: mediaKindForMessage(ctx.message, !!ctx.message.sticker),
        onMessage: true,
      });
    }

    if (isMaintenanceBlocked(ctx)) {
      logEvent("message_ignored", { ...msgLog, reason: "maintenance_mode" });
      report?.finishIgnored("maintenance_mode");
      return;
    }

    const services = createPipelineServices();
    const state = createInitialPipelineState({
      turnId,
      rawText: text ?? "",
      telegram: {
        message: ctx.message,
        chat: ctx.chat
          ? {
              id: ctx.chat.id,
              type: ctx.chat.type,
              is_forum: ctx.chat.is_forum,
            }
          : undefined,
        from: ctx.from,
        me: ctx.me ? { id: ctx.me.id, username: ctx.me.username } : undefined,
        botToken,
      },
    });

    let endTyping: (() => void) | undefined;
    try {
      const result = await runMessagePipeline(state, services);

      if (result.earlyReply) {
        await deliverEarlyReply(ctx, result.earlyReply, turnId);
        return;
      }

      if (result.ignored) {
        logEvent("message_ignored", {
          ...msgLog,
          reason: result.ignoreReason ?? "not_addressed",
        });
        report?.finishIgnored(
          result.ignoreReason ?? "not_addressed",
          result.addressSource,
        );
        return;
      }

      const trigger = result.replyTrigger ?? "addressed";
      logEvent("message_accepted", { ...msgLog, trigger });
      report?.setAccepted({
        trigger,
        addressSource: result.addressSource,
      });
      if (state.convKey) {
        report?.setConvKey(state.convKey);
      }

      recordMessageReceived();
      endTyping = startTypingForMessage(ctx) ?? undefined;

      const deliveryChatId = state.chatId ?? chatId;
      if (!deliveryChatId) {
        report?.finalizeError("Missing chat id");
        return;
      }

      logEvent("chat_turn_started", {
        turnId,
        chatId: deliveryChatId,
        userId: state.userId,
        groupId: state.groupChatId,
        convKey: state.convKey,
        inGroup: state.inGroup,
      });

      await deliverPipelineReply(ctx, result.delivery ?? {}, {
        turnId,
        chatId: deliveryChatId,
        inGroup: Boolean(state.inGroup),
        isForum: state.isForum,
        messageThreadId: state.messageThreadId,
      });

      runPipelinePhaseBackground(state, services);
    } catch (err) {
      logEventError("handler_error", err, msgLog);
      getMessageReport(turnId)?.finalizeError(
        err instanceof Error ? err.message : String(err),
      );
      await deliverPipelineError(ctx, err, {
        turnId,
        chatId: ctx.chat?.id,
        messageThreadId: ctx.message?.message_thread_id,
      });
    } finally {
      endTyping?.();
    }
  } catch (err) {
    logEventError("handler_error", err, msgLog);
    report?.finalizeError(err instanceof Error ? err.message : String(err));
  }
}
