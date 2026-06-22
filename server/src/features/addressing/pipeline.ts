import type { Message } from "@grammyjs/types";
import type {
  PipelineModuleHost,
  PipelineHostServices,
  PipelineStepResult,
} from "../../contracts/index.js";
import type { ModuleLogging } from "../../shared/index.js";
import { checkMessageAddressed } from "./check-addressed.js";
import { getAddressResponseFormat } from "./prompt.js";
import {
  isReplyInBotThreadMessage,
  isReplyToBotMessage,
} from "./telegram-reply.js";
import { getBotIdentity } from "./bot-identity.js";
import { senderLabel } from "./reply-triggers.js";
import { getSettings } from "../../pipeline/turn-services.js";

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
  alwaysOn: true,

  shouldRun(state) {
    return !state.skipAddressCheck;
  },

  async run(state, services): Promise<PipelineStepResult> {
    const bot = getBotIdentity();
    const message = state.telegram.message as Message | undefined;

    const settings = getSettings();
    const thinkingEnabled = Boolean(settings.thinkingEnabled);
    const responseFormat = getAddressResponseFormat(thinkingEnabled);

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
        thinkingEnabled,
      },
      {
        baseUrl: services.llm.baseUrl,
        model: services.llm.model,
        apiKey: services.llm.apiKey,
        botUsername: bot.username,
        botDisplayName: bot.displayName,
        numPredict: ADDRESS_CHECK_NUM_PREDICT,
        log: hostLogging(services),
        chatComplete: services.llm.createAuxiliaryChatComplete({
          numPredict: ADDRESS_CHECK_NUM_PREDICT,
          responseFormat,
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
