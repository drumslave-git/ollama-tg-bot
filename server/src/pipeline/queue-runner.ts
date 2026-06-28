import { errorMessage } from "../logging/index.js";
import type {
  PipelineFeatureHost,
  PipelineTurnState,
} from "../contracts/index.js";
import {
  getIntakePipelineHosts,
  getReplyPipelineHosts,
  getPostReplyPipelineHosts,
} from "../runtime/feature-hosts.js";
import {
  isPipelineStepEnabled,
  runPipelineHost,
} from "./runner.js";
import type { PipelineHostServices } from "../contracts/index.js";
import type { WebSearchSource } from "../features/web-search/index.js";
import {
  deliverEarlyReply,
  deliverPipelineError,
  deliverReplyText,
  deliverReplySticker,
  finalizeReplyDelivery,
} from "./deliver.js";
import { prepareDelivery } from "./turn-services.js";
import { recordMessageReceived } from "../db/index.js";
import { getMessageReport } from "../debug/message-report.js";
import { logEvent } from "../logging/event-log.js";
import {
  startChatActionForMessage,
  startTypingForMessage,
} from "../bot/replies/typing.js";
import { ReplyStream } from "../bot/replies/reply-stream.js";
import type { QueuedMessage } from "../runtime/message-queue.js";

function hostDebugTitle(host: PipelineFeatureHost): string {
  return host.debugTitle ?? host.stepId;
}

function shouldRunEnabledHost(
  host: PipelineFeatureHost,
  enabledSteps: string[],
  turnId: number,
  services: PipelineHostServices,
): boolean {
  if (isPipelineStepEnabled(host, enabledSteps)) return true;
  services
    .getReport(turnId)
    ?.skipPhase(host.stepId, hostDebugTitle(host), "Disabled in workflow");
  return false;
}

export async function runIntakePipeline(
  state: PipelineTurnState,
  services: PipelineHostServices,
): Promise<{
  shouldReply: boolean;
  ignoreReason?: string;
  addressSource?: string;
  replyTrigger?: PipelineTurnState["replyTrigger"];
  earlyReply?: string;
}> {
  const enabledSteps = await services.getWorkflowSteps();
  for (const host of getIntakePipelineHosts()) {
    if (!shouldRunEnabledHost(host, enabledSteps, state.turnId, services)) {
      continue;
    }
    await runPipelineHost(host, state, services);
    if (state.earlyReply) {
      return { shouldReply: false, earlyReply: state.earlyReply };
    }
  }

  if (!state.shouldReply) {
    return {
      shouldReply: false,
      ignoreReason: state.haltReason ?? "not_addressed",
      addressSource: state.addressSource,
    };
  }

  return {
    shouldReply: true,
    replyTrigger: state.replyTrigger ?? "addressed",
    addressSource: state.addressSource,
  };
}

export async function processQueuedTurn(item: QueuedMessage): Promise<void> {
  const { ctx, state, services, turnId } = item;
  const enabledSteps = await services.getWorkflowSteps();
  let endTyping: (() => void) | undefined;

  try {
    state.shouldReply = true;
    endTyping = startTypingForMessage(ctx) ?? undefined;
    // Let post-reply hosts show their own chat action (e.g. "choosing sticker").
    state.startChatAction = (action) => startChatActionForMessage(ctx, action);

    const trigger = state.replyTrigger ?? "addressed";
    logEvent("message_accepted", {
      turnId,
      chatId: state.chatId,
      userId: state.userId,
      trigger,
    });
    getMessageReport(turnId)?.setAccepted({
      trigger,
      addressSource: state.addressSource,
    });
    if (state.convKey) {
      getMessageReport(turnId)?.setConvKey(state.convKey);
    }
    recordMessageReceived();

    const deliveryChatId = state.chatId ?? ctx.chat?.id;
    if (!deliveryChatId) {
      getMessageReport(turnId)?.finalizeError("Missing chat id");
      return;
    }

    // Stream the reply live (the completion path falls back to a single message
    // automatically when it can't stream, e.g. nothing was produced).
    const replyStream = new ReplyStream(ctx, {
      chatId: deliveryChatId,
      messageThreadId: state.messageThreadId,
      inGroup: Boolean(state.inGroup),
      isForum: state.isForum,
    });
    state.replyStream = replyStream;

    // Critical path: run only the hosts needed to produce the text reply.
    for (const host of getReplyPipelineHosts()) {
      if (!shouldRunEnabledHost(host, enabledSteps, turnId, services)) {
        continue;
      }

      const result = await runPipelineHost(host, state, services, {
        recordResult: (stepResult) =>
          !(stepResult.phaseId === "completions" && stepResult.status === "ok"),
      });
      if (state.earlyReply) {
        await deliverEarlyReply(ctx, state.earlyReply, turnId);
        return;
      }
      if (result?.status === "failed") {
        throw new Error(result.summary);
      }
    }

    logEvent("chat_turn_started", {
      turnId,
      chatId: deliveryChatId,
      userId: state.userId,
      groupId: state.groupChatId,
      convKey: state.convKey,
      inGroup: state.inGroup,
    });

    // Deliver the text reply now — before the sticker and mood passes run.
    // When the live stream already opened a message, finalize it in place;
    // otherwise (tools path, or no content streamed) send it normally.
    const delivery = prepareDelivery(state);
    let delivered: Awaited<ReturnType<typeof deliverReplyText>>;
    if (replyStream?.started) {
      if (delivery.error) throw new Error(delivery.error);
      delivered = await replyStream.finalize(delivery.replyHtml ?? "");
    } else {
      delivered = await deliverReplyText(ctx, delivery, {
        turnId,
        chatId: deliveryChatId,
        inGroup: Boolean(state.inGroup),
        isForum: state.isForum,
        messageThreadId: state.messageThreadId,
      });
    }

    // Text reply is on screen — stop "typing". Post-reply hosts (e.g. sticker)
    // show their own chat action only while they do visible work.
    endTyping?.();
    endTyping = undefined;

    // Off the critical path: sticker pick, history record, and the mood update
    // for the next turn. Failures here must not disturb the reply already sent.
    // The sticker is sent the moment it's chosen — before history/mood run — so
    // it reaches the chat promptly after the text reply.
    for (const host of getPostReplyPipelineHosts()) {
      if (!shouldRunEnabledHost(host, enabledSteps, turnId, services)) {
        continue;
      }
      try {
        await runPipelineHost(host, state, services);
      } catch (err) {
        services.logging.logEventError("post_reply_host_failed", err, {
          turnId,
          host: host.stepId,
        });
      }

      if (host.stepId === "sticker" && state.stickerFileId) {
        try {
          await deliverReplySticker(ctx, {
            turnId,
            chatId: deliveryChatId,
            stickerFileId: state.stickerFileId,
            stickerEmoji: state.stickerEmoji,
            chunkCount: delivered.chunkCount,
            messageThreadId: state.messageThreadId,
          });
        } catch (err) {
          services.logging.logEventError("sticker_send_failed", err, { turnId });
        }
      }
    }

    finalizeReplyDelivery({
      turnId,
      chatId: deliveryChatId,
      chunkCount: delivered.chunkCount,
      replyChars: delivered.replyChars,
      messageIds: delivered.messageIds,
      stickerEmoji: state.stickerEmoji,
      webSearchSources: state.webSearchSources as
        | WebSearchSource[]
        | undefined,
    });
  } catch (err) {
    getMessageReport(turnId)?.finalizeError(
      errorMessage(err),
    );
    await deliverPipelineError(ctx, err, {
      turnId,
      chatId: ctx.chat?.id,
      messageThreadId: ctx.message?.message_thread_id,
    });
  } finally {
    endTyping?.();
  }
}
