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
import { getExplainNumPredict } from "../settings/limits.js";
import { getResolvedSettings } from "../settings/runtime.js";
import {
  getDebugTraceById,
  getTraceIdByReplyMessage,
} from "../db/debug/traces.js";
import { formatTraceForExplain } from "../debug/trace-format.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import { isOwner } from "../bot/owner/owner.js";
import {
  isGroupChat,
  resolveConversationKey,
  resolveUserId,
} from "../bot/telegram/keys.js";
import {
  deliverHtmlErrorReply,
  sendChunkedHtmlReply,
} from "../bot/replies/delivery.js";
import { startTypingForMessage } from "../bot/replies/typing.js";
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
        traceText: input.traceText,
      }),
    getMainReplyResponseFormat,
    // Single plain completion — the explain pass reasons over the supplied trace
    // and uses no tools. The output budget is sized from the context left after
    // the (potentially large) trace prompt so a generous budget can't push the
    // backend into truncating the prompt.
    chatCompleteDetailed: (messages, options) => {
      const promptChars = messages.reduce(
        (sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0),
        0,
      );
      const numPredict = getExplainNumPredict(
        getResolvedSettings(),
        promptChars,
      );
      return chatCompleteDetailed(messages as never, {
        ...options,
        numPredict,
      } as never);
    },
    extractTelegramReply,
    hasVisibleTelegramReply,
    prepareTelegramHtml,
    startTyping: (ctx) => startTypingForMessage(ctx as Context),
    recordReply,
    recordError,
    sendChunkedHtmlReply: (ctx, options) =>
      sendChunkedHtmlReply(ctx as Context, options),
    deliverHtmlErrorReply: (ctx, options) =>
      deliverHtmlErrorReply(ctx as Context, options),
  };

  return {
    isOwner: (ctx) => isOwner(ctx as Context),
    buildTurnInput: (ctx) => {
      const grammyCtx = ctx as Context;
      const chatId = grammyCtx.chat?.id;
      const convKey = resolveConversationKey(grammyCtx);
      if (!chatId || !convKey) return null;

      // Only a reply to one of the bot's own messages is a valid target.
      const replied = grammyCtx.message?.reply_to_message;
      const botId = grammyCtx.me?.id;
      if (!replied || botId == null || replied.from?.id !== botId) return null;

      const repliedMessageId = replied.message_id;
      const traceId = getTraceIdByReplyMessage(
        String(chatId),
        repliedMessageId,
      );
      const trace = traceId != null ? getDebugTraceById(traceId) : null;

      return {
        convKey,
        chatId,
        userId: resolveUserId(grammyCtx),
        inGroup: isGroupChat(grammyCtx),
        repliedMessageId,
        traceText: trace ? formatTraceForExplain(trace) : null,
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
