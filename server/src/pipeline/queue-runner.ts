import type {
  PipelineModuleHost,
  PipelineTurnState,
} from "@llm-tg-bot/modules-registry";
import { getPipelineHosts } from "../runtime/module-hosts.js";
import {
  isPipelineStepEnabled,
  runPipelineHost,
  runPipelinePhase,
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
import {
  INTAKE_PHASES,
  QUEUE_STEP_ORDER,
} from "./workflow-definition.js";

function hostByStepId(stepId: string): PipelineModuleHost | undefined {
  return getPipelineHosts().find((host) => host.stepId === stepId);
}

function queueHostsInOrder(): PipelineModuleHost[] {
  return QUEUE_STEP_ORDER.map((stepId) => hostByStepId(stepId)).filter(
    (host): host is PipelineModuleHost => Boolean(host),
  );
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
  for (const phase of INTAKE_PHASES) {
    await runPipelinePhase(phase, state, services);
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

    for (const host of queueHostsInOrder()) {
      if (!isPipelineStepEnabled(host, enabledSteps)) {
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
      if (result?.status === "failed" || result?.status === "halt") {
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
