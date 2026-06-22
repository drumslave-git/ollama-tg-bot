import type { Message } from "@grammyjs/types";
import type {
  PipelineModuleHost,
  PipelineStepResult,
} from "../../contracts/index.js";
import { stripCurrentBotAddressing } from "../addressing/index.js";
import {
  buildBase64MediaHistoryContent,
  buildMediaHistoryContent,
  buildPassiveHistoryContent,
  buildTextHistoryContent,
  mediaKindForMessage,
} from "./format.js";
import {
  appendMessage,
  currentSpeakerFromUser,
  enrichTextWithUserMentions,
  ensureHistoryFitsForTurn,
  formatReplyContext,
  isGroupChat,
  isOwner,
  loadVisionFromMessage,
  messageHasVisionMedia,
  prepareDelivery,
  recordExchange,
  resolveConversationKey,
  resolveGroupChatId,
  resolveMentionedUsersContext,
  resolveUserId,
  stickerPackEmoji,
  userRoleTag,
} from "../../pipeline/turn-services.js";

function buildVisionTurnBody(
  messageText: string,
  mediaKind: string,
  visionDescription: string,
): string {
  const mediaNote = `The user sent a ${mediaKind}: ${visionDescription}`;
  return [messageText, mediaNote].filter(Boolean).join("\n\n");
}

export const turnSetupHost: PipelineModuleHost = {
  id: "history",
  stepId: "intake",
  alwaysOn: true,

  async run(state): Promise<PipelineStepResult> {
    state.convKey = resolveConversationKey(state.telegram) ?? null;
    state.chatId = state.telegram.chat?.id;
    state.userId = resolveUserId(state.telegram) ?? null;
    state.groupChatId = resolveGroupChatId(state.telegram) ?? null;
    state.inGroup = isGroupChat(state.telegram) ?? false;
    state.userRole = userRoleTag(state.telegram.from) ?? null;
    state.currentSpeaker = currentSpeakerFromUser(state.telegram.from) ?? null;
    state.currentSpeakerIsOwner = isOwner(state.telegram) ?? false;
    state.messageThreadId = (state.telegram.message as Message | undefined)
      ?.message_thread_id;
    state.isForum = state.telegram.chat?.is_forum === true;
    state.skipUserHistory = true;
    const msg = state.telegram.message as Message | undefined;
    if (msg?.message_id != null) {
      state.telegramMessageId = msg.message_id;
    }

    const rawText = state.rawText ?? "";
    const promptText = stripCurrentBotAddressing(rawText) || rawText;
    state.latestBody = promptText || "(non-text message)";
    state.replyContext =
      formatReplyContext(state.telegram, state.currentSpeaker) ?? null;
    state.mentionedUsersContext =
      resolveMentionedUsersContext(rawText, state.telegram) ?? null;

    return {
      status: "ok",
      phaseId: "intake",
      phaseTitle: "Turn setup",
      summary: state.convKey ?? "no conv key",
    };
  },
};

export const intakeHistoryHost: PipelineModuleHost = {
  id: "history",
  stepId: "history-intake",
  alwaysOn: true,

  shouldRun(state) {
    return Boolean(state.convKey && state.userRole);
  },

  async run(state, services): Promise<PipelineStepResult> {
    const msg = state.telegram.message as Message | undefined;
    const convKey = state.convKey;
    const role = state.userRole;
    if (!msg || !convKey || !role) {
      return {
        status: "skipped",
        phaseId: "history-intake",
        phaseTitle: "History intake",
        summary: "Missing conversation or role",
      };
    }

    const botId = state.telegram.me?.id;
    const from = state.telegram.from;
    const messageId = msg.message_id;
    const msgLog = {
      chatId: state.chatId,
      userId: (from as { id?: number } | undefined)?.id,
      messageId: msg.message_id,
      convKey,
      passive: true,
    };

    const rawText = (msg.text ?? msg.caption ?? "").trim();
    const enrichedText = rawText
      ? enrichTextWithUserMentions(rawText, msg, {
          botId,
          botUsername: state.telegram.me?.username,
          senderId: (from as { id?: number } | undefined)?.id,
          senderUsername: (from as { username?: string } | undefined)?.username,
        })
      : "";

    const parts: string[] = [];

    const textContent = buildPassiveHistoryContent(
      msg,
      from as never,
      enrichedText,
      botId,
    );
    if (textContent) {
      appendMessage(convKey, role, textContent, { messageId });
      parts.push("text");
      services.logging.logEvent("passive_history_stored", {
        ...msgLog,
        kind: "text",
      });
    }

    if (messageHasVisionMedia(msg)) {
      const mediaKind = mediaKindForMessage(msg, !!msg.sticker);
      const loaded = await loadVisionFromMessage(
        state.telegram.botToken,
        msg,
      );
      if (loaded?.unavailableText) {
        services.logging.logEvent("vision_unavailable", msgLog);
      } else if (loaded && loaded.images.length > 0) {
        const image = loaded.images[0] as { base64: string; mimeHint: string };
        const sticker = loaded.sourceSticker ?? msg.sticker;
        const mediaHistory = buildBase64MediaHistoryContent(
          from as never,
          msg,
          mediaKind,
          image.base64,
          image.mimeHint,
          botId,
          stickerPackEmoji(sticker) ?? null,
        );
        if (mediaHistory) {
          appendMessage(convKey, role, mediaHistory, { messageId });
          parts.push("media");
          services.logging.logEvent("passive_history_stored", {
            ...msgLog,
            kind: "media",
            mediaKind,
          });
        }
      }
    }

    return {
      status: "ok",
      phaseId: "history-intake",
      phaseTitle: "History intake",
      summary: parts.length > 0 ? `Stored ${parts.join(" + ")}` : "Nothing to store",
    };
  },
};

export const historyInjectHost: PipelineModuleHost = {
  id: "history",
  stepId: "history",
  alwaysOn: true,

  shouldRun(state) {
    return Boolean(state.shouldReply && state.convKey);
  },

  async run(state): Promise<PipelineStepResult> {
    const convKey = state.convKey;
    if (!convKey) {
      return {
        status: "failed",
        phaseId: "history",
        phaseTitle: "History",
        summary: "Missing conversation key",
      };
    }

    const started = performance.now();
    await ensureHistoryFitsForTurn(convKey);

    return {
      status: "ok",
      phaseId: "history",
      phaseTitle: "History",
      summary: "Context ready",
      durationMs: performance.now() - started,
    };
  },
};

export const historyRecordHost: PipelineModuleHost = {
  id: "history",
  stepId: "history-record",
  alwaysOn: true,

  shouldRun(state) {
    return Boolean(state.shouldReply && state.convKey);
  },

  async run(state): Promise<PipelineStepResult> {
    const convKey = state.convKey;
    if (!convKey) {
      return {
        status: "skipped",
        phaseId: "history-record",
        phaseTitle: "History record",
        summary: "No conversation key",
      };
    }

    const replyBody = state.replyBody ?? "";
    const stickerEmoji = state.stickerEmoji;
    const webSearchSources = state.webSearchSources ?? [];
    state.delivery = prepareDelivery(state);
    if (state.delivery?.error) {
      return {
        status: "failed",
        phaseId: "history-record",
        phaseTitle: "History record",
        summary: state.delivery.error,
      };
    }

    const historyText =
      replyBody.trim() && stickerEmoji
        ? `${replyBody}\n[sticker: ${stickerEmoji}]`
        : stickerEmoji
          ? `[sticker: ${stickerEmoji}]`
          : replyBody;

    state.assistantReply = historyText;
    recordExchange(
      convKey,
      state.userRole ?? null,
      state.userHistoryContent ?? null,
      historyText,
      {
        skipUser: state.skipUserHistory,
        anchorMessageId: state.telegramMessageId,
      },
    );

    return {
      status: "ok",
      phaseId: "history-record",
      phaseTitle: "History record",
      summary: `Stored exchange · ${webSearchSources.length} search source(s)`,
    };
  },
};

export { buildVisionTurnBody, buildMediaHistoryContent, buildTextHistoryContent, mediaKindForMessage };
