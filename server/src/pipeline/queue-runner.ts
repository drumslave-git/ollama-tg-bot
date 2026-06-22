import type {
  PipelineModuleHost,
  PipelineTurnState,
} from "@llm-tg-bot/modules-registry";
import {
  getIntakePipelineHosts,
  getQueuePipelineHosts,
} from "../runtime/module-hosts.js";
import {
  isPipelineStepEnabled,
  runPipelineHost,
} from "./runner.js";
import type { PipelineHostServices } from "@llm-tg-bot/modules-registry";
import {
  deliverEarlyReply,
  deliverPipelineError,
  deliverPipelineReply,
} from "./deliver.js";
import { recordMessageReceived } from "../db/index.js";
import { getMessageReport } from "../debug/message-report.js";
import { logEvent } from "../logging/event-log.js";
import { startTypingForMessage } from "../bot/replies/typing.js";
import type { QueuedMessage } from "../runtime/message-queue.js";

function hostDebugTitle(host: PipelineModuleHost): string {
  return host.debugTitle ?? host.stepId;
}

function shouldRunEnabledHost(
  host: PipelineModuleHost,
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
  const enabledSteps = services.getWorkflowSteps();
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
  const { ctx, state, services, turnId, botToken } = item;
  const enabledSteps = services.getWorkflowSteps();
  let endTyping: (() => void) | undefined;

  try {
    state.shouldReply = true;
    endTyping = startTypingForMessage(ctx) ?? undefined;

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

    for (const host of getQueuePipelineHosts()) {
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

    const delivery =
      state.delivery ?? services.callbacks.prepareDelivery?.(state) ?? {};

    const deliveryChatId = state.chatId ?? ctx.chat?.id;
    if (!deliveryChatId) {
      getMessageReport(turnId)?.finalizeError("Missing chat id");
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

    await deliverPipelineReply(ctx, delivery, {
      turnId,
      chatId: deliveryChatId,
      inGroup: Boolean(state.inGroup),
      isForum: state.isForum,
      messageThreadId: state.messageThreadId,
    });
  } catch (err) {
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
}
