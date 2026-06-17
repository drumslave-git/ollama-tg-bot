import type { PipelineHostCallbacks } from "@llm-tg-bot/modules-registry";
import { userRoleTag } from "@llm-tg-bot/modules-history";
import {
  describeVisionImages as runVisionDescribe,
  findReplyMediaMessage,
  loadVisionFromMessage,
  messageHasUserImage,
  messageHasVisionMedia,
  stickerPackEmoji,
} from "@llm-tg-bot/modules-vision";
import { getStickerCatalogForSelection } from "@llm-tg-bot/modules-sticker-selection";
import { getEffectiveMood, saveMoodState } from "../../db/mood/index.js";
import { replaceGeneralFacts } from "../../db/memory/general.js";
import { replaceGroupFacts } from "../../db/memory/group.js";
import { replaceUserFacts } from "../../db/memory/user.js";
import { getSettings } from "../../db/index.js";
import { getActivePersonalityPrompt } from "../../db/personalities/index.js";
import { appendMessage } from "../../db/history/index.js";
import { isOwner } from "../../bot/owner/owner.js";
import { enrichTextWithUserMentions } from "../../bot/messages/mentions.js";
import { currentSpeakerFromUser } from "../../bot/messages/speaker.js";
import { chatComplete } from "../../llm/client.js";
import { logEvent, logEventError, type EventFields } from "../../logging/event-log.js";
import {
  buildChatContextForTurn,
  buildSystemPromptForTurn,
  ensureHistoryFitsForTurn,
  loadGeneralMemoryFacts,
  loadMemoryFactsForGroup,
  loadMemoryFactsForUser,
  preparePipelineDelivery,
} from "../context.js";
import { recordExchange } from "../chat-messages.js";
import {
  formatReplyContextFromTelegram,
  isGroupChatFromTelegram,
  resolveConversationKeyFromTelegram,
  resolveGroupChatIdFromTelegram,
  resolveMentionedUsersContextFromTelegram,
  resolveUserIdFromTelegram,
} from "../telegram.js";

const visionDescribeConfig = {
  chatComplete: (
    messages: Parameters<typeof chatComplete>[0],
    options: {
      numPredict: number;
      auxiliary: boolean;
      traceTurnId?: number;
      traceLabel?: string;
    },
  ) =>
    chatComplete(messages, {
      numPredict: options.numPredict,
      auxiliary: options.auxiliary,
      traceTurnId: options.traceTurnId,
      traceLabel: options.traceLabel,
    }),
  log: {
    logEvent: (event: string, fields?: Record<string, unknown>) =>
      logEvent(event, fields as EventFields),
    logEventError: (
      event: string,
      err: unknown,
      fields?: Record<string, unknown>,
    ) => logEventError(event, err, fields as EventFields),
  },
};

export function createPipelineCallbacks(): PipelineHostCallbacks {
  return {
    resolveConversationKey: resolveConversationKeyFromTelegram,
    resolveUserId: resolveUserIdFromTelegram,
    resolveGroupChatId: resolveGroupChatIdFromTelegram,
    isGroupChat: isGroupChatFromTelegram,
    isOwner: (telegram) =>
      isOwner({ from: telegram.from, chat: telegram.chat } as never),
    getEffectiveMood: () => getEffectiveMood(),
    saveMoodState: (mood) => saveMoodState(mood as never),
    getStickerCatalog: () => getStickerCatalogForSelection(),
    getSettings: () => getSettings() as unknown as Record<string, unknown>,
    getActivePersonalityPrompt: () => getActivePersonalityPrompt(),
    buildSystemPromptForTurn,
    buildChatContextForTurn,
    prepareDelivery: preparePipelineDelivery,
    ensureHistoryFits: ensureHistoryFitsForTurn,
    recordExchange,
    appendMessage: (convKey, role, content) =>
      appendMessage(convKey, role, content),
    enrichTextWithUserMentions: (text, message, options) =>
      enrichTextWithUserMentions(text, message as never, options),
    formatReplyContext: formatReplyContextFromTelegram,
    resolveMentionedUsersContext: resolveMentionedUsersContextFromTelegram,
    currentSpeakerFromUser: (from) => currentSpeakerFromUser(from as never),
    userRoleTag: (from) => userRoleTag(from as never),
    loadVisionFromMessage: (token, message) =>
      loadVisionFromMessage(token, message as never),
    findReplyMediaMessage: (message) => findReplyMediaMessage(message as never),
    messageHasVisionMedia: (message) => messageHasVisionMedia(message as never),
    messageHasUserImage: (message) => messageHasUserImage(message as never),
    describeVisionImages: (images, logContext, visionHint, traceTurnId) =>
      runVisionDescribe(
        {
          images: images as never,
          visionHint,
          traceTurnId,
          logContext: logContext as never,
        },
        visionDescribeConfig,
      ),
    stickerPackEmoji: (sticker) => stickerPackEmoji(sticker as never),
    getUserFacts: loadMemoryFactsForUser,
    getGroupFacts: loadMemoryFactsForGroup,
    getGeneralFacts: loadGeneralMemoryFacts,
    memoryCallbacks: {
      replaceUserFacts,
      replaceGroupFacts,
      replaceGeneralFacts,
    },
  };
}
