import type { Context } from "grammy";
import {
  ADDRESS_RESPONSE_FORMAT,
  checkMessageAddressed,
  type AddressCheckResult,
  type AddressSource,
} from "@llm-tg-bot/modules-addressing-detection";

export {
  ANALYZER_SYSTEM,
  buildAddressAnalyzerMessages,
  formatBotLabels,
  parseAddressDecision,
  addressingDetectionModule,
  addressCheckModule,
  detectAddressing,
  checkMessageAddressed,
  buildBotAddressIdentity,
  messageReferencesBotByName,
  stripBotAddressing,
  stripNonBotMentions,
  type AddressingDetectionConfig,
  type AddressingDetectionInput,
  type AddressingDetectionOutput,
  type AddressCheckConfig,
  type AddressCheckInput,
  type AddressSource,
  type BotAddressIdentity,
} from "@llm-tg-bot/modules-addressing-detection";

export type { AddressCheckResult };

import { getBotIdentity } from "./bot-identity.js";
import { isReplyInBotThread, isReplyToBot } from "./replies.js";
import {
  hostAuxiliaryChatComplete,
  hostLlmConfig,
  hostLogging,
} from "../module-host.js";

const ADDRESS_CHECK_NUM_PREDICT = 192;

function senderLabel(ctx: Context): string {
  if (!ctx.from) return "Someone";
  return (
    [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") ||
    ctx.from.username ||
    "Someone"
  );
}

/**
 * Whether the bot should treat this message as addressed.
 */
export async function isMessageAddressedToBot(
  ctx: Context,
  turnId?: number,
): Promise<AddressCheckResult> {
  const bot = getBotIdentity();
  return checkMessageAddressed(
    {
      chatType: ctx.chat?.type,
      chatId: ctx.chat?.id,
      userId: ctx.from?.id,
      turnId,
      message: ctx.message,
      bot,
      isReplyToBot: isReplyToBot(ctx, bot.username),
      isReplyInBotThread: isReplyInBotThread(ctx, bot.username),
      sender: senderLabel(ctx),
    },
    {
      ...hostLlmConfig(),
      botAliases: [bot.username, ...bot.aliases],
      numPredict: ADDRESS_CHECK_NUM_PREDICT,
      log: hostLogging(),
      chatComplete: hostAuxiliaryChatComplete({
        numPredict: ADDRESS_CHECK_NUM_PREDICT,
        responseFormat: ADDRESS_RESPONSE_FORMAT,
        traceTurnId: turnId,
        traceLabel: "address detection",
      }),
    },
  );
}
