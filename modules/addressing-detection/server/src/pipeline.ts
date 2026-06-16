import type { Message } from "@grammyjs/types";
import type {
  PipelineModuleHost,
  PipelineHostServices,
  PipelineStepResult,
} from "@llm-tg-bot/modules-registry";
import type { ModuleLogging } from "@llm-tg-bot/modules-utils";
import { checkMessageAddressed } from "./check-addressed.js";
import { ADDRESS_RESPONSE_FORMAT } from "./prompt.js";
import {
  isReplyInBotThreadMessage,
  isReplyToBotMessage,
} from "./telegram-reply.js";
import { getBotIdentity } from "./bot-identity.js";
import { replyTriggersHost, senderLabel } from "./reply-triggers.js";

const ADDRESS_CHECK_NUM_PREDICT = 192;

function hostLogging(services: PipelineHostServices): ModuleLogging {
  return {
    logEvent: (event, fields) =>
      services.logging.logEvent(event, fields as Record<string, unknown>),
    logEventError: (event, err, fields) =>
      services.logging.logEventError(
        event,
        err,
        fields as Record<string, unknown>,
      ),
  };
}

export const addressingHost: PipelineModuleHost = {
  id: "addressing-detection",
  stepId: "address",
  phase: "gate",
  order: 10,
  alwaysOn: true,

  shouldRun(state) {
    return !state.skipAddressCheck;
  },

  async run(state, services): Promise<PipelineStepResult> {
    const bot = getBotIdentity();
    const message = state.telegram.message as Message | undefined;

    const started = performance.now();
    const result = await checkMessageAddressed(
      {
        chatType: state.telegram.chat?.type,
        chatId: state.telegram.chat?.id,
        userId: (state.telegram.from as { id?: number } | undefined)?.id,
        turnId: state.turnId,
        message,
        bot,
        isReplyToBot: isReplyToBotMessage(message, state.telegram.me, bot),
        isReplyInBotThread: isReplyInBotThreadMessage(
          message,
          state.telegram.me,
          bot,
        ),
        sender: senderLabel(state.telegram.from),
      },
      {
        baseUrl: services.llm.baseUrl,
        model: services.llm.model,
        apiKey: services.llm.apiKey,
        botAliases: [bot.username, ...(bot.aliases ?? [])],
        numPredict: ADDRESS_CHECK_NUM_PREDICT,
        log: hostLogging(services),
        chatComplete: services.llm.createAuxiliaryChatComplete({
          numPredict: ADDRESS_CHECK_NUM_PREDICT,
          responseFormat: ADDRESS_RESPONSE_FORMAT,
          traceTurnId: state.turnId,
          traceLabel: "address detection",
        }),
      },
    );

    state.addressed = result.addressed;
    state.addressSource = result.source;
    state.shouldReply = result.addressed;
    if (result.addressed) {
      state.replyTrigger = "addressed";
    } else {
      state.haltReason = "not_addressed";
    }

    return {
      status: "ok",
      phaseId: "address",
      phaseTitle: "Address check",
      summary: result.addressed
        ? (result.source ?? "Addressed")
        : (result.reason ?? "Not addressed to the bot"),
      durationMs: performance.now() - started,
    };
  },
};

export const pipelineHosts = [replyTriggersHost, addressingHost];
