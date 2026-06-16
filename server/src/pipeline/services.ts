import type { ChatMessage, JsonSchemaResponseFormat } from "@llm-tg-bot/modules-utils";
import type {
  PipelineHostCallbacks,
  PipelineHostServices,
  PipelineLlmServices,
  PipelineReportWriter,
  PipelineTelegramContext,
} from "@llm-tg-bot/modules-registry";
import { stripBotAddressing } from "@llm-tg-bot/modules-addressing-detection";
import { userRoleTag } from "@llm-tg-bot/modules-history";
import { chatComplete, chatCompleteDetailed } from "../llm/client.js";
import { config } from "../config/index.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import { getMessageReport } from "../debug/message-report.js";
import { getResolvedSettings } from "../settings/runtime.js";
import { getBotIdentity } from "../bot/identity/bot-identity.js";
import { getStickerCatalogForSelection } from "@llm-tg-bot/modules-sticker-selection";
import { getEffectiveMood, saveMoodState } from "../db/mood/index.js";
import { replaceGeneralFacts } from "../db/memory/general.js";
import { replaceGroupFacts } from "../db/memory/group.js";
import { replaceUserFacts } from "../db/memory/user.js";
import { getSettings } from "../db/index.js";
import { getActivePersonalityPrompt } from "../db/personalities/index.js";
import {
  resolveConversationKey,
  resolveGroupChatId,
  resolveUserId,
  isGroupChat,
  currentSpeakerFromUser,
  recordExchange,
} from "../bot/turn/conversation.js";
import { isOwner } from "../bot/owner/owner.js";
import {
  formatReplyContext,
} from "../bot/replies/replies.js";
import {
  resolveMentionedKnownUsers,
  formatMentionedUsersContext,
  enrichTextWithUserMentions,
} from "../bot/messages/mentions.js";
import {
  loadVisionFromMessage,
  findReplyMediaMessage,
  messageHasVisionMedia,
  messageHasUserImage,
  describeVisionImages,
  stickerPackEmoji,
} from "../bot/media/vision-adapter.js";
import {
  buildChatContextForTurn,
  buildSystemPromptForTurn,
  ensureHistoryFitsForTurn,
  loadGeneralMemoryFacts,
  loadMemoryFactsForGroup,
  loadMemoryFactsForUser,
  preparePipelineDelivery,
} from "./context.js";

function toReportWriter(turnId: number): PipelineReportWriter | null {
  const report = getMessageReport(turnId);
  if (!report) return null;
  return {
    okPhase: (id, title, summary, durationMs, detail) =>
      report.okPhase(id, title, summary, durationMs, detail as never),
    skipPhase: (id, title, summary) => report.skipPhase(id, title, summary),
    failPhase: (id, title, summary, durationMs) =>
      report.failPhase(id, title, summary, durationMs),
    completeMemory: (input) => report.completeMemory(input),
  };
}

function createLlmServices(): PipelineLlmServices {
  const settings = getResolvedSettings();
  return {
    baseUrl: settings.apiBaseUrl,
    model: settings.model,
    apiKey: config.openAiApiKey || undefined,
    createAuxiliaryChatComplete: (options) => (messages) =>
      chatComplete(messages as ChatMessage[], {
        numPredict: options.numPredict,
        auxiliary: true,
        think: options.think,
        responseFormat: options.responseFormat as JsonSchemaResponseFormat,
        traceTurnId: options.traceTurnId,
        traceLabel: options.traceLabel,
      }),
    createMainChatComplete: (options) => async (messages) => {
      const result = await chatCompleteDetailed(messages as ChatMessage[], {
        think: options.think,
        responseFormat: options.responseFormat as JsonSchemaResponseFormat,
        traceTurnId: options.traceTurnId,
        traceLabel: options.traceLabel,
        traceLayout: options.traceLayout as never,
      });
      return { raw: result.raw, thinking: result.thinking };
    },
  };
}

const callbacks: PipelineHostCallbacks = {
  getBotIdentity: () => getBotIdentity(),
  resolveConversationKey: (telegram) =>
    resolveConversationKey({ chat: telegram.chat, from: telegram.from } as never),
  resolveUserId: (telegram) =>
    resolveUserId({ from: telegram.from } as never),
  resolveGroupChatId: (telegram) =>
    resolveGroupChatId({ chat: telegram.chat } as never),
  isGroupChat: (telegram) =>
    isGroupChat({ chat: telegram.chat } as never),
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
  enrichTextWithUserMentions: (text, message, options) =>
    enrichTextWithUserMentions(text, message as never, options),
  formatReplyContext: (telegram, currentSpeaker) =>
    formatReplyContext(
      {
        message: telegram.message,
        chat: telegram.chat,
        me: telegram.me,
      } as never,
      telegram.me?.id,
      currentSpeaker as never,
    ),
  stripBotAddressing: (text) => stripBotAddressing(text, getBotIdentity()),
  resolveMentionedUsersContext: (text, telegram) => {
    const mentionedUsers = resolveMentionedKnownUsers(
      text.trim(),
      telegram.message as never,
      {
        botId: telegram.me?.id,
        botUsername: telegram.me?.username,
        senderId: (telegram.from as { id?: number } | undefined)?.id,
        senderUsername: (telegram.from as { username?: string } | undefined)
          ?.username,
      },
    );
    return formatMentionedUsersContext(mentionedUsers);
  },
  currentSpeakerFromUser: (from) => currentSpeakerFromUser(from as never),
  userRoleTag: (from) => userRoleTag(from as never),
  loadVisionFromMessage: (token, message) =>
    loadVisionFromMessage(token, message as never),
  findReplyMediaMessage: (message) => findReplyMediaMessage(message as never),
  messageHasVisionMedia: (message) => messageHasVisionMedia(message as never),
  messageHasUserImage: (message) => messageHasUserImage(message as never),
  describeVisionImages: (images, logContext, visionHint, traceTurnId) =>
    describeVisionImages(
      images as never,
      logContext as never,
      visionHint,
      traceTurnId,
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

export function createPipelineServices(): PipelineHostServices {
  return {
    logging: {
      logEvent: (event, fields) => logEvent(event, fields as never),
      logEventError: (event, err, fields) =>
        logEventError(event, err, fields as never),
    },
    llm: createLlmServices(),
    getWorkflowSteps: () => getResolvedSettings().workflowSteps ?? [],
    getReport: toReportWriter,
    getSecret: (name) => {
      if (name === "tavily") return config.tavilyApiKey;
      if (name === "openai") return config.openAiApiKey;
      return "";
    },
    callbacks,
  };
}

export function createInitialPipelineState(input: {
  turnId: number;
  telegram: PipelineTelegramContext;
  rawText: string;
}): import("@llm-tg-bot/modules-registry").PipelineTurnState {
  return {
    turnId: input.turnId,
    telegram: input.telegram,
    rawText: input.rawText,
    latestBody: input.rawText,
  };
}
