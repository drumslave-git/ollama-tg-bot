import type { Context } from "grammy";
import { chatComplete } from "../llm/client.js";
import {
  getBotIdentity,
  messageReferencesBotByName,
  type BotIdentity,
} from "./bot-identity.js";
import { isMessageForBot } from "./addressed.js";
import { stripNonBotMentions } from "./mentions.js";
import { logEvent, logEventError } from "../event-log.js";
import {
  buildAddressAnalyzerMessages,
  formatBotNamesForAnalyzer,
  parseAddressDecision,
} from "./address-analyze-prompt.js";

export {
  ANALYZER_SYSTEM,
  buildAddressAnalyzerMessages,
  formatBotNamesForAnalyzer,
  parseAddressDecision,
} from "./address-analyze-prompt.js";

const ADDRESS_CHECK_NUM_PREDICT = 192;

export type AddressSource =
  | "private"
  | "mention_or_reply"
  | "name"
  | "analyzer"
  | "no_text";

export interface AddressCheckResult {
  addressed: boolean;
  source?: AddressSource;
}

/**
 * Whether the bot should treat this message as addressed.
 * Private chats: always true. Groups: @mention/reply/command, name match, then LLM name-variant check.
 */
export async function isMessageAddressedToBot(
  ctx: Context,
  turnId?: number,
): Promise<AddressCheckResult> {
  const baseLog = {
    chatId: ctx.chat?.id,
    userId: ctx.from?.id,
    chatType: ctx.chat?.type,
  };

  if (ctx.chat?.type === "private") {
    logEvent("message_addressed", { ...baseLog, source: "private" });
    return { addressed: true, source: "private" };
  }

  if (isMessageForBot(ctx)) {
    logEvent("message_addressed", { ...baseLog, source: "mention_or_reply" });
    return { addressed: true, source: "mention_or_reply" };
  }

  const bot = getBotIdentity();
  const textForNameCheck = stripNonBotMentions(ctx.message, {
    botId: ctx.me?.id,
    botUsername: ctx.me?.username,
  });
  if (textForNameCheck && messageReferencesBotByName(textForNameCheck, bot)) {
    logEvent("message_addressed", { ...baseLog, source: "name" });
    return { addressed: true, source: "name" };
  }

  const text = (ctx.message?.text ?? ctx.message?.caption ?? "").trim();
  if (!text) {
    logEvent("message_address_decision", {
      ...baseLog,
      turnId,
      addressed: false,
      source: "no_text",
    });
    return { addressed: false, source: "no_text" };
  }

  return analyzeGroupMessageForBot(ctx, bot, text, turnId);
}

async function analyzeGroupMessageForBot(
  ctx: Context,
  bot: BotIdentity,
  text: string,
  turnId?: number,
): Promise<AddressCheckResult> {
  const chatType = ctx.chat?.type;
  if (chatType !== "group" && chatType !== "supergroup") {
    return { addressed: false };
  }

  const sender = ctx.from
    ? [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") ||
      ctx.from.username ||
      "Someone"
    : "Someone";

  const messages = buildAddressAnalyzerMessages({
    botLabels: formatBotNamesForAnalyzer(bot),
    chatType,
    sender,
    text,
  });

  try {
    const raw = await chatComplete(messages, {
      numPredict: ADDRESS_CHECK_NUM_PREDICT,
      auxiliary: true,
      traceTurnId: turnId,
      traceLabel: "address detection",
    });
    const yes = parseAddressDecision(raw);
    if (yes) {
      logEvent("message_addressed", {
        chatId: ctx.chat?.id,
        userId: ctx.from?.id,
        turnId,
        chatType,
        source: "analyzer",
      });
      return { addressed: true, source: "analyzer" };
    }
    logEvent("message_address_decision", {
      chatId: ctx.chat?.id,
      userId: ctx.from?.id,
      turnId,
      chatType,
      addressed: false,
      source: "analyzer",
    });
    return { addressed: false, source: "analyzer" };
  } catch (err) {
    logEventError("address_analyzer_failed", err, {
      chatId: ctx.chat?.id,
      userId: ctx.from?.id,
      chatType,
    });
    return { addressed: false, source: "analyzer" };
  }
}
