import type { Message } from "@grammyjs/types";
import type { ModuleDefinition, ModuleLogging } from "@llm-tg-bot/modules-utils";
import {
  detectAddressing,
  type AddressingDetectionConfig,
  type AddressingDetectionOutput,
} from "./detect.js";
import {
  displayNameMatchable,
  messageReferencesBotByName,
  type BotAddressIdentity,
} from "./bot-identity.js";
import { stripNonBotMentions } from "./strip-non-bot-mentions.js";
import { isMessageForBot } from "./telegram-address.js";

export type AddressSource =
  | "private"
  | "mention_or_reply"
  | "name"
  | "analyzer"
  | "no_text";

export interface AddressCheckResult {
  addressed: boolean;
  source?: AddressSource;
  reason?: string;
}

export interface AddressCheckInput {
  chatType?: string;
  chatId?: number;
  userId?: number;
  turnId?: number;
  message?: Message;
  bot: BotAddressIdentity;
  isReplyToBot?: boolean;
  isReplyInBotThread?: boolean;
  /** Display name of the sender; defaults to "Someone". */
  sender?: string;
}

export interface AddressCheckConfig extends AddressingDetectionConfig {
  log?: ModuleLogging;
}

function baseLogFields(input: AddressCheckInput): Record<string, string | number | undefined> {
  return {
    chatId: input.chatId,
    userId: input.userId,
    chatType: input.chatType,
  };
}

/**
 * Whether the bot should treat this message as addressed.
 * Private chats: always true.
 * Groups: @mention, reply to bot, display-name regex, then LLM for other languages.
 */
export async function checkMessageAddressed(
  input: AddressCheckInput,
  config: AddressCheckConfig,
): Promise<AddressCheckResult> {
  const log = config.log;
  const baseLog = baseLogFields(input);

  if (input.chatType === "private") {
    log?.logEvent?.("message_addressed", { ...baseLog, source: "private" });
    return { addressed: true, source: "private" };
  }

  if (
    isMessageForBot({
      chatType: input.chatType,
      message: input.message,
      bot: input.bot,
      isReplyToBot: input.isReplyToBot,
      isReplyInBotThread: input.isReplyInBotThread,
    })
  ) {
    log?.logEvent?.("message_addressed", {
      ...baseLog,
      source: "mention_or_reply",
    });
    return { addressed: true, source: "mention_or_reply" };
  }

  const textForNameCheck = stripNonBotMentions(input.message, {
    botId: input.bot.id,
    botUsername: input.bot.username,
  });
  if (textForNameCheck && messageReferencesBotByName(textForNameCheck, input.bot)) {
    log?.logEvent?.("message_addressed", { ...baseLog, source: "name" });
    return { addressed: true, source: "name" };
  }

  const text = (input.message?.text ?? input.message?.caption ?? "").trim();
  if (!text) {
    log?.logEvent?.("message_address_decision", {
      ...baseLog,
      turnId: input.turnId,
      addressed: false,
      source: "no_text",
    });
    return { addressed: false, source: "no_text" };
  }

  if (!displayNameMatchable(input.bot.displayName)) {
    log?.logEvent?.("message_address_decision", {
      ...baseLog,
      turnId: input.turnId,
      addressed: false,
      source: "analyzer",
      reason: "No usable display name",
    });
    return {
      addressed: false,
      source: "analyzer",
      reason: "No usable display name",
    };
  }

  return analyzeGroupMessageForBot(input, text, config);
}

async function analyzeGroupMessageForBot(
  input: AddressCheckInput,
  text: string,
  config: AddressCheckConfig,
): Promise<AddressCheckResult> {
  const chatType = input.chatType;
  if (chatType !== "group" && chatType !== "supergroup") {
    return { addressed: false };
  }

  const log = config.log;
  const baseLog = baseLogFields(input);

  try {
    const { result, reason } = await detectAddressing(
      {
        message: text,
        sender: input.sender ?? "Someone",
        chatType,
        nameScanFound: false,
      },
      config,
    );
    if (result) {
      log?.logEvent?.("message_addressed", {
        ...baseLog,
        turnId: input.turnId,
        source: "analyzer",
        reason,
      });
      return { addressed: true, source: "analyzer", reason };
    }
    log?.logEvent?.("message_address_decision", {
      ...baseLog,
      turnId: input.turnId,
      addressed: false,
      source: "analyzer",
      reason,
    });
    return { addressed: false, source: "analyzer", reason };
  } catch (err) {
    log?.logEventError?.("address_analyzer_failed", err, baseLog);
    return { addressed: false, source: "analyzer" };
  }
}

export const addressCheckModule: ModuleDefinition<
  AddressCheckInput,
  AddressCheckConfig,
  AddressCheckResult
> = {
  id: "addressing-detection",
  run: checkMessageAddressed,
};

export type { AddressingDetectionOutput };
