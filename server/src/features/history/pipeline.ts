import type { Message } from "@grammyjs/types";
import type {
  PipelineModuleHost,
  PipelineStepResult,
} from "../../contracts/index.js";
import { stripCurrentBotAddressing } from "../addressing/index.js";
import { linkProcessingMessage } from "../../debug/message-report.js";
import {
  buildBase64MediaHistoryContent,
  buildMediaHistoryContent,
  buildPassiveHistoryContent,
  buildTextHistoryContent,
  combineHistoryContent,
  mediaKindForMessage,
} from "./format.js";
import {
  appendMessage,
  currentSpeakerFromUser,
  enrichTextWithUserMentions,
  formatReplyContext,
  isGroupChat,
  isOwner,
  loadVisionFromMessage,
  messageHasVisionMedia,
  recordExchange,
  resolveConversationKey,
  resolveGroupChatId,
  resolveMentionedUsersContext,
  resolveUserId,
  stickerPackEmoji,
  userRoleTag,
} from "../../pipeline/turn-services.js";

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
    state.currentSpeakerIsOwner = (await isOwner(state.telegram)) ?? false;
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
      (await resolveMentionedUsersContext(rawText, state.telegram)) ?? null;

    return {
      status: "ok",
      phaseId: "intake",
      phaseTitle: "Message received",
      summary: state.convKey ? `Chat: ${state.convKey}` : "no conv key",
      replace: true,
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
        phaseTitle: "History: message saved",
        summary: "Nothing to save (missing conversation or role)",
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
      ? await enrichTextWithUserMentions(rawText, msg, {
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

    // One message is stored as one row: the text and any pending base64 media
    // are combined, so the media line rides along with the user's text.
    let mediaContent: string | null = null;
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
        mediaContent =
          buildBase64MediaHistoryContent(
            from as never,
            msg,
            mediaKind,
            image.base64,
            image.mimeHint,
            botId,
            stickerPackEmoji(sticker) ?? null,
          ) ?? null;
      }
    }

    const combined = combineHistoryContent(textContent, mediaContent);
    if (combined) {
      const chatMessageId = await appendMessage(convKey, role, combined, {
        messageId,
      });
      if (chatMessageId != null) {
        state.chatMessageId = chatMessageId;
        linkProcessingMessage(state.turnId, chatMessageId);
      }
      if (textContent) {
        parts.push("text");
        services.logging.logEvent("passive_history_stored", {
          ...msgLog,
          kind: "text",
        });
      }
      if (mediaContent) {
        parts.push("media");
        services.logging.logEvent("passive_history_stored", {
          ...msgLog,
          kind: "media",
          mediaKind: mediaKindForMessage(msg, !!msg.sticker),
        });
      }
    }

    return {
      status: "ok",
      phaseId: "history-intake",
      phaseTitle: "History: message saved",
      summary:
        parts.length > 0
          ? `Saved ${parts.join(" + ")} to chat history`
          : "Nothing to save",
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
        phaseTitle: "History: reply saved",
        summary: "Not saved (no conversation key)",
      };
    }

    const replyBody = state.replyBody ?? "";
    const webSearchSources = state.webSearchSources ?? [];

    // Only the spoken reply is saved — the bot's own sent sticker is not
    // recorded to chat history.
    state.assistantReply = replyBody;
    recordExchange(
      convKey,
      state.userRole ?? null,
      state.userHistoryContent ?? null,
      replyBody,
      {
        skipUser: state.skipUserHistory,
        anchorMessageId: state.telegramMessageId,
      },
    );

    return {
      status: "ok",
      phaseId: "history-record",
      phaseTitle: "History: reply saved",
      summary: `Saved this turn to chat history · ${webSearchSources.length} search source(s)`,
    };
  },
};

export { buildMediaHistoryContent, buildTextHistoryContent, mediaKindForMessage };
