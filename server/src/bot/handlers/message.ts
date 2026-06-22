import type { Context } from "grammy";
import { logEvent, logEventError, type EventFields } from "../../logging/event-log.js";
import { getMaxDebugTraceId } from "../../db/debug/traces.js";
import { beginMessageReport } from "../../debug/message-report.js";
import { extractText } from "../messages/message-content.js";
import { summarizeMessageContent } from "../replies/replies.js";
import { isSlashCommandMessage } from "../commands/slash-command.js";
import { messageHasVisionMedia } from "../../features/vision/index.js";
import { mediaKindForMessage, formatHistoryPointer } from "../../features/history/index.js";
import { isMaintenanceBlocked } from "../maintenance/maintenance.js";
import {
  createInitialPipelineState,
  createPipelineServices,
} from "../../pipeline/index.js";
import { buildTelegramContext } from "../../pipeline/telegram.js";
import { runIntakePipeline } from "../../pipeline/queue-runner.js";
import { deliverEarlyReply } from "../../pipeline/deliver.js";
import { enqueueMessage } from "../../runtime/message-queue.js";

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
      telegram: buildTelegramContext(ctx, botToken),
    });

    const intake = await runIntakePipeline(state, services);

    if (intake.earlyReply) {
      await deliverEarlyReply(ctx, intake.earlyReply, turnId);
      return;
    }

    if (!intake.shouldReply) {
      logEvent("message_ignored", {
        ...msgLog,
        reason: intake.ignoreReason ?? "not_addressed",
      });
      report?.finishIgnored(
        intake.ignoreReason ?? "not_addressed",
        intake.addressSource,
      );
      return;
    }

    const tgMessageId = ctx.message.message_id;
    if (state.convKey && tgMessageId != null) {
      state.telegramMessageId = tgMessageId;
      state.historyPointer = formatHistoryPointer(state.convKey, tgMessageId);
    }

    enqueueMessage({
      turnId,
      ctx,
      botToken,
      state,
      services,
      historyPointer: state.historyPointer,
    });
  } catch (err) {
    logEventError("handler_error", err, msgLog);
    report?.finalizeError(err instanceof Error ? err.message : String(err));
  }
}
