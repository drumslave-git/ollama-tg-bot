/**
 * Concrete, directly-imported services for pipeline hosts.
 *
 * Replaces the former `PipelineHostCallbacks` indirection: because every
 * feature now lives in this package, hosts import these functions directly
 * instead of receiving an `unknown`-typed callback bag through `services`.
 */
import type { Context } from "grammy";
import type {
  PipelineTelegramContext,
  PipelineTurnState,
} from "../contracts/index.js";
import { userRoleTag as historyUserRoleTag } from "../features/history/format.js";
import {
  findReplyMediaMessage as visionFindReplyMediaMessage,
  loadVisionFromMessage as visionLoadFromMessage,
  messageHasUserImage as visionMessageHasUserImage,
  messageHasVisionMedia as visionMessageHasVisionMedia,
  stickerPackEmoji as visionStickerPackEmoji,
} from "../features/vision/index.js";
import { getStickerCatalogForSelection } from "../features/sticker/sticker-catalog.js";
import {
  getActivePersonalityPrompt,
  getEffectiveMood,
  saveMoodState,
} from "../features/mood/db/index.js";
import { getSettings } from "../db/index.js";
import { appendMessage, mapHistoryBase64Media } from "../features/history/db/index.js";
import { isOwner as botIsOwner } from "../bot/owner/owner.js";
import {
  enrichTextWithUserMentions as botEnrichTextWithUserMentions,
  replyAddressesOtherParticipant as botReplyAddressesOtherParticipant,
} from "../bot/messages/mentions.js";
import { currentSpeakerFromUser as botCurrentSpeakerFromUser } from "../bot/messages/speaker.js";
import {
  buildChatContextForTurn,
  buildSystemPromptForTurn,
  preparePipelineDelivery,
} from "./context.js";
import { recordExchange } from "./chat-messages.js";
import {
  formatReplyContextFromTelegram,
  isGroupChatFromTelegram,
  resolveConversationKeyFromTelegram,
  resolveGroupChatIdFromTelegram,
  resolveMentionedUsersContextFromTelegram,
  resolveUserIdFromTelegram,
} from "./telegram.js";

export {
  buildChatContextForTurn,
  buildSystemPromptForTurn,
  preparePipelineDelivery as prepareDelivery,
  recordExchange,
  getEffectiveMood,
  saveMoodState,
  getSettings,
  getActivePersonalityPrompt,
  appendMessage,
  mapHistoryBase64Media,
  getStickerCatalogForSelection as getStickerCatalog,
  resolveConversationKeyFromTelegram as resolveConversationKey,
  resolveUserIdFromTelegram as resolveUserId,
  resolveGroupChatIdFromTelegram as resolveGroupChatId,
  isGroupChatFromTelegram as isGroupChat,
  formatReplyContextFromTelegram as formatReplyContext,
  resolveMentionedUsersContextFromTelegram as resolveMentionedUsersContext,
};

export function isOwner(telegram: PipelineTelegramContext): Promise<boolean> {
  return botIsOwner({ from: telegram.from, chat: telegram.chat } as Context);
}

export function userRoleTag(from: unknown): string | null {
  return historyUserRoleTag(from as never);
}

export function currentSpeakerFromUser(from: unknown): unknown {
  return botCurrentSpeakerFromUser(from as never);
}

export function enrichTextWithUserMentions(
  text: string,
  message: unknown,
  options: {
    botId?: number;
    botUsername?: string;
    senderId?: number;
    senderUsername?: string;
  },
): Promise<string> {
  return botEnrichTextWithUserMentions(text, message as never, options);
}

export function replyAddressesOtherParticipant(
  text: string,
  options: {
    botId?: number;
    botUsername?: string;
    senderId?: number;
    senderUsername?: string;
  },
): Promise<boolean> {
  return botReplyAddressesOtherParticipant(text, options);
}

export function messageHasVisionMedia(message: unknown): boolean {
  return visionMessageHasVisionMedia(message as never);
}

export function messageHasUserImage(message: unknown): boolean {
  return visionMessageHasUserImage(message as never);
}

export function findReplyMediaMessage(message: unknown): unknown {
  return visionFindReplyMediaMessage(message as never);
}

export function stickerPackEmoji(sticker: unknown): string | null {
  return visionStickerPackEmoji(sticker as never);
}

export function loadVisionFromMessage(
  botToken: string,
  message: unknown,
): Promise<{
  images: unknown[];
  unavailableText?: string;
  visionHint?: string;
  sourceSticker?: unknown;
}> {
  return visionLoadFromMessage(botToken, message as never);
}

export type { PipelineTurnState, PipelineTelegramContext };
