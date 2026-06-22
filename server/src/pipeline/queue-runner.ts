import type { Context } from "grammy";
import type {
  PipelineModuleHost,
  PipelineStepResult,
  PipelineTurnState,
} from "@llm-tg-bot/modules-registry";
import { getPipelineHosts } from "../runtime/module-hosts.js";
import {
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

function isStepEnabled(
  host: PipelineModuleHost,
  enabledSteps: string[],
): boolean {
  if (host.alwaysOn) return true;
  return enabledSteps.includes(host.stepId);
}

async function runHost(
  host: PipelineModuleHost,
  state: PipelineTurnState,
  services: PipelineHostServices,
): Promise<PipelineStepResult | null> {
  if (host.shouldRun) {
    const decision = host.shouldRun(state, services);
    const resolved =
      typeof decision === "boolean"
        ? decision
          ? { run: true }
          : { run: false, summary: "Not needed for this turn" }
        : decision;
    if (!resolved.run) {
      if ("omitFromReport" in resolved && resolved.omitFromReport) return null;
      services
        .getReport(state.turnId)
        ?.skipPhase(
          host.stepId,
          host.debugTitle ?? host.stepId,
          resolved.summary ?? "Not needed for this turn",
        );
      return null;
    }
  }

  const result = await host.run(state, services);
  const report = services.getReport(state.turnId);
  if (!report || !result) return result;

  if (result.phaseId === "completions" && result.status === "ok") {
    return result;
  }

  const writeOptions = result.replace ? { replace: true } : undefined;
  switch (result.status) {
    case "ok":
      report.okPhase(
        result.phaseId,
        result.phaseTitle,
        result.summary,
        result.durationMs,
        result.detail,
        writeOptions,
      );
      break;
    case "skipped":
      report.skipPhase(
        result.phaseId,
        result.phaseTitle,
        result.summary,
        writeOptions,
      );
      break;
    case "failed":
      report.failPhase(
        result.phaseId,
        result.phaseTitle,
        result.summary,
        result.durationMs,
        writeOptions,
      );
      break;
    case "halt":
      report.skipPhase(
        result.phaseId,
        result.phaseTitle,
        result.summary,
        writeOptions,
      );
      break;
  }
  return result;
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

    for (const stepId of QUEUE_STEP_ORDER) {
      const host = hostByStepId(stepId);
      if (!host || !isStepEnabled(host, enabledSteps)) {
        continue;
      }

      const result = await runHost(host, state, services);
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
