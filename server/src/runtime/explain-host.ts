import type { ExplainExtension } from "../features/completions/index.js";
import { EXPLAIN_EXTENSION_ID } from "../features/completions/index.js";
import {
  getSettings,
  recordError,
  recordReply,
} from "../db/index.js";
import {
  getPersonalityById,
  resolveActivePersonalityId,
} from "../db/personalities/index.js";
import { getHistory, historyToChatMessages } from "../db/history/index.js";
import { getUserFacts } from "../db/memory/user.js";
import { getGroupFacts } from "../db/memory/group.js";
import { getGeneralFacts } from "../db/memory/general.js";
import { ensureHistoryFits } from "../debug/context-compress.js";
import { chatCompleteDetailed } from "../llm/client.js";
import {
  extractTelegramReply,
  getMainReplyResponseFormat,
} from "../features/completions/index.js";
import {
  hasVisibleTelegramReply,
  prepareTelegramHtml,
} from "../telegram/html.js";
import { buildExplainSystemPrompt } from "../pipeline/adapters/system-prompt.js";
import { recordExchange } from "../pipeline/chat-messages.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import { isOwner } from "../bot/owner/owner.js";
import {
  isGroupChat,
  resolveConversationKey,
  resolveGroupChatId,
  resolveUserId,
} from "../bot/telegram/keys.js";
import { resolveCommandInlineOrReplyText } from "../bot/commands/command-utils.js";
import { userRoleTag } from "../features/history/index.js";
import {
  deliverHtmlErrorReply,
  sendChunkedHtmlReply,
} from "../bot/replies/delivery.js";
import type { Context } from "grammy";

export function createExplainExtension(): ExplainExtension {
  const deps: ExplainExtension["deps"] = {
    logging: {
      logEvent: (event, fields) => logEvent(event, fields as never),
      logEventError: (event, err, fields) =>
        logEventError(event, err, fields as never),
    },
    getSettings: () => getSettings() as unknown as Record<string, unknown>,
    resolveActivePersonalityId: (activePersonalityId) => {
      const id = resolveActivePersonalityId(Number(activePersonalityId ?? 0));
      return id > 0 ? id : null;
    },
    getPersonalityById: (id) => {
      const personality = getPersonalityById(id);
      if (!personality) return null;
      return { name: personality.name, prompt: personality.prompt };
    },
    buildExplainSystemPrompt: (input) =>
      buildExplainSystemPrompt({
        settings: input.settings as never,
        activePersonalityName: input.activePersonalityName,
        activePersonalityPrompt: input.activePersonalityPrompt,
        generalMemoryFacts: input.generalMemoryFacts,
        groupMemoryFacts: input.groupMemoryFacts,
        userMemoryFacts: input.userMemoryFacts,
        isGroupChat: input.isGroupChat,
      }),
    ensureHistoryFits,
    loadHistoryMessages: (convKey) =>
      historyToChatMessages(getHistory(convKey)),
    getMainReplyResponseFormat,
    chatCompleteDetailed: (messages, options) =>
      chatCompleteDetailed(messages as never, options as never),
    extractTelegramReply,
    hasVisibleTelegramReply,
    prepareTelegramHtml,
    recordExchange,
    recordReply,
    recordError,
    sendChunkedHtmlReply: (ctx, options) =>
      sendChunkedHtmlReply(ctx as Context, options),
    deliverHtmlErrorReply: (ctx, options) =>
      deliverHtmlErrorReply(ctx as Context, options),
  };

  return {
    isOwner: (ctx) => isOwner(ctx as Context),
    resolveCommandText: (ctx, inline) =>
      resolveCommandInlineOrReplyText(ctx as Context, inline),
    buildTurnInput: (ctx, question) => {
      const grammyCtx = ctx as Context;
      const chatId = grammyCtx.chat?.id;
      const convKey = resolveConversationKey(grammyCtx);
      if (!chatId || !convKey) return null;

      const userId = resolveUserId(grammyCtx);
      const groupChatId = resolveGroupChatId(grammyCtx);
      const inGroup = isGroupChat(grammyCtx);

      return {
        convKey,
        chatId,
        userId,
        groupChatId,
        inGroup,
        question,
        userRole: userRoleTag(grammyCtx.from),
        userMemoryFacts: userId ? getUserFacts(userId) : [],
        groupMemoryFacts: groupChatId ? getGroupFacts(groupChatId) : [],
        generalMemoryFacts: getGeneralFacts(),
        messageThreadId: grammyCtx.message?.message_thread_id,
        isForum: grammyCtx.chat?.is_forum === true,
      };
    },
    deps,
  };
}

export function createExplainExtensions(): Record<string, unknown> {
  return {
    [EXPLAIN_EXTENSION_ID]: createExplainExtension(),
  };
}
