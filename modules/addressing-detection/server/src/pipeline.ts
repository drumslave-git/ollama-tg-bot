import type { Message } from "@grammyjs/types";
import type {
  PipelineModuleHost,
  PipelineHostServices,
  PipelineStepResult,
  PipelineTurnState,
} from "@llm-tg-bot/modules-registry";
import type { ModuleLogging } from "@llm-tg-bot/modules-utils";
import {
  checkMessageAddressed,
  type AddressCheckInput,
} from "./check-addressed.js";
import type { BotAddressIdentity } from "./bot-identity.js";
import { ADDRESS_RESPONSE_FORMAT } from "./prompt.js";

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

function readAddressInput(
  state: PipelineTurnState,
): AddressCheckInput | null {
  const raw = state.moduleInput?.address;
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Partial<AddressCheckInput>;
  if (!input.bot) return null;
  return {
    chatType: input.chatType,
    chatId: input.chatId,
    userId: input.userId,
    turnId: state.turnId,
    message: input.message as Message | undefined,
    bot: input.bot as BotAddressIdentity,
    isReplyToBot: input.isReplyToBot,
    isReplyInBotThread: input.isReplyInBotThread,
    sender: input.sender,
  };
}

export const pipelineHost: PipelineModuleHost = {
  id: "addressing-detection",
  stepId: "address",
  phase: "gate",
  order: 0,
  alwaysOn: true,

  shouldRun(state) {
    return !state.skipAddressCheck;
  },

  async run(state, services): Promise<PipelineStepResult> {
    const input = readAddressInput(state);
    if (!input) {
      return {
        status: "failed",
        phaseId: "address",
        phaseTitle: "Address check",
        summary: "Missing address input",
      };
    }

    const started = performance.now();
    const result = await checkMessageAddressed(input, {
      baseUrl: services.llm.baseUrl,
      model: services.llm.model,
      apiKey: services.llm.apiKey,
      botAliases: [
        input.bot.username,
        ...(input.bot.aliases ?? []),
      ],
      numPredict: ADDRESS_CHECK_NUM_PREDICT,
      log: hostLogging(services),
      chatComplete: services.llm.createAuxiliaryChatComplete({
        numPredict: ADDRESS_CHECK_NUM_PREDICT,
        responseFormat: ADDRESS_RESPONSE_FORMAT,
        traceTurnId: state.turnId,
        traceLabel: "address detection",
      }),
    });

    state.addressed = result.addressed;
    state.addressSource = result.source;

    if (!result.addressed) {
      state.halt = true;
      state.haltReason = "not_addressed";
      return {
        status: "halt",
        phaseId: "address",
        phaseTitle: "Address check",
        summary: result.reason ?? "Not addressed to the bot",
        durationMs: performance.now() - started,
      };
    }

    return {
      status: "ok",
      phaseId: "address",
      phaseTitle: "Address check",
      summary: result.source ?? "Addressed",
      durationMs: performance.now() - started,
    };
  },
};
