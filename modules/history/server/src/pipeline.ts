import type { Message } from "@grammyjs/types";
import type {
  PipelineModuleHost,
  PipelineStepResult,
} from "@llm-tg-bot/modules-registry";
import { stripCurrentBotAddressing } from "@llm-tg-bot/modules-addressing-detection";
import {
  buildMediaHistoryContent,
  buildPassiveHistoryContent,
  buildTextHistoryContent,
  mediaKindForMessage,
} from "./format.js";

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
  phase: "preprocess",
  order: 0,
  alwaysOn: true,

  async run(state, services): Promise<PipelineStepResult> {
    const cb = services.callbacks;
    state.convKey = cb.resolveConversationKey?.(state.telegram) ?? null;
    state.chatId = state.telegram.chat?.id;
    state.userId = cb.resolveUserId?.(state.telegram) ?? null;
    state.groupChatId = cb.resolveGroupChatId?.(state.telegram) ?? null;
    state.inGroup = cb.isGroupChat?.(state.telegram) ?? false;
    state.userRole = cb.userRoleTag?.(state.telegram.from) ?? null;
    state.currentSpeaker = cb.currentSpeakerFromUser?.(state.telegram.from) ?? null;
    state.currentSpeakerIsOwner = cb.isOwner?.(state.telegram) ?? false;
    state.messageThreadId = (state.telegram.message as Message | undefined)
      ?.message_thread_id;
    state.isForum = state.telegram.chat?.is_forum === true;
    state.skipUserHistory = state.inGroup;

    const rawText = state.rawText ?? "";
    const promptText = stripCurrentBotAddressing(rawText) || rawText;
    state.latestBody = promptText || "(non-text message)";
    state.replyContext =
      cb.formatReplyContext?.(state.telegram, state.currentSpeaker) ?? null;
    state.mentionedUsersContext =
      cb.resolveMentionedUsersContext?.(rawText, state.telegram) ?? null;

    const userId = state.userId;
    const groupChatId = state.groupChatId;
    const knownParticipants =
      state.convKey && cb.getChatParticipants
        ? cb.getChatParticipants(state.convKey, userId ?? null)
        : [];
    const speaker = state.currentSpeaker as
      | { userId: string; label: string }
      | null
      | undefined;
    state.memoryInput = {
      userMessage: state.latestBody,
      replyContext: state.replyContext,
      existingUserFacts: userId ? (cb.getUserFacts?.(userId) ?? []) : [],
      existingGroupFacts: groupChatId
        ? (cb.getGroupFacts?.(groupChatId) ?? [])
        : [],
      existingGeneralFacts: cb.getGeneralFacts?.() ?? [],
      isGroupChat: state.inGroup,
      currentSpeaker: speaker
        ? { userId: speaker.userId, label: speaker.label }
        : null,
      knownParticipants,
    };

    return {
      status: "ok",
      phaseId: "intake",
      phaseTitle: "Turn setup",
      summary: state.convKey ?? "no conv key",
    };
  },
};

export const passiveRecordHost: PipelineModuleHost = {
  id: "history",
  stepId: "history-passive",
  phase: "preprocess",
  order: 10,
  alwaysOn: true,

  shouldRun(state) {
    return Boolean(state.inGroup && state.convKey && state.userRole);
  },

  async run(state, services): Promise<PipelineStepResult> {
    const msg = state.telegram.message as Message | undefined;
    const convKey = state.convKey;
    const role = state.userRole;
    if (!msg || !convKey || !role) {
      return {
        status: "skipped",
        phaseId: "history-passive",
        phaseTitle: "Passive history",
        summary: "Not a group message",
      };
    }

    const cb = services.callbacks;
    const botId = state.telegram.me?.id;
    const from = state.telegram.from;
    const msgLog = {
      chatId: state.chatId,
      userId: (from as { id?: number } | undefined)?.id,
      messageId: msg.message_id,
      convKey,
      passive: true,
    };

    const rawText = (msg.text ?? msg.caption ?? "").trim();
    const enrichedText = rawText
      ? (cb.enrichTextWithUserMentions?.(rawText, msg, {
          botId,
          botUsername: state.telegram.me?.username,
          senderId: (from as { id?: number } | undefined)?.id,
          senderUsername: (from as { username?: string } | undefined)?.username,
        }) ?? rawText)
      : "";

    const textContent = buildPassiveHistoryContent(
      msg,
      from as never,
      enrichedText,
      botId,
    );
    if (textContent) {
      cb.appendMessage?.(convKey, role, textContent);
      services.logging.logEvent("passive_history_stored", {
        ...msgLog,
        kind: "text",
      });
    }

    if (cb.messageHasVisionMedia?.(msg)) {
      const mediaKind = mediaKindForMessage(msg, !!msg.sticker);
      const loaded = await cb.loadVisionFromMessage?.(
        state.telegram.botToken,
        msg,
      );
      if (loaded?.unavailableText) {
        services.logging.logEvent("vision_unavailable", msgLog);
      } else if (loaded && loaded.images.length > 0) {
        const sticker = loaded.sourceSticker ?? msg.sticker;
        const visionDescription = await cb.describeVisionImages?.(
          loaded.images,
          msgLog,
          loaded.visionHint,
        );
        if (visionDescription) {
          const mediaHistory = buildMediaHistoryContent(
            from as never,
            msg,
            mediaKind,
            visionDescription,
            botId,
            cb.stickerPackEmoji?.(sticker) ?? null,
          );
          if (mediaHistory) {
            cb.appendMessage?.(convKey, role, mediaHistory);
            services.logging.logEvent("vision_stored", {
              ...msgLog,
              mediaKind,
              chars: visionDescription.length,
              passive: true,
            });
          }
        }
      }
    }

    return {
      status: "ok",
      phaseId: "history-passive",
      phaseTitle: "Passive history",
      summary: textContent ? "Stored" : "Media/text processed",
    };
  },
};

export const historyInjectHost: PipelineModuleHost = {
  id: "history",
  stepId: "history",
  phase: "pre-reply",
  order: 60,
  alwaysOn: true,

  shouldRun(state) {
    return Boolean(state.shouldReply && state.convKey);
  },

  async run(state, services): Promise<PipelineStepResult> {
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
    await services.callbacks.ensureHistoryFits?.(convKey);

    return {
      status: "ok",
      phaseId: "history",
      phaseTitle: "History",
      summary: "History injected into context",
      durationMs: performance.now() - started,
    };
  },
};

export const historyRecordHost: PipelineModuleHost = {
  id: "history",
  stepId: "history-record",
  phase: "post-reply",
  order: 20,
  alwaysOn: true,

  shouldRun(state) {
    return Boolean(state.shouldReply && state.convKey);
  },

  async run(state, services): Promise<PipelineStepResult> {
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
    const historyText =
      replyBody.trim() && stickerEmoji
        ? `${replyBody}\n[sticker: ${stickerEmoji}]`
        : stickerEmoji
          ? `[sticker: ${stickerEmoji}]`
          : replyBody;

    state.assistantReply = historyText;
    services.callbacks.recordExchange?.(
      convKey,
      state.userRole ?? null,
      state.userHistoryContent ?? null,
      historyText,
      { skipUser: state.skipUserHistory },
    );

    state.delivery = services.callbacks.prepareDelivery?.(state);

    return {
      status: "ok",
      phaseId: "history-record",
      phaseTitle: "History record",
      summary: `Stored exchange · ${webSearchSources.length} search source(s)`,
    };
  },
};

export { buildVisionTurnBody, buildMediaHistoryContent, buildTextHistoryContent, mediaKindForMessage };
