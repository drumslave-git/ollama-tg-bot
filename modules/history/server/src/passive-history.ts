import type { Context } from "grammy";
import type { BotHostServices } from "@llm-tg-bot/modules-registry";
import { appendMessage } from "@llm-tg-bot/modules-history-db";
import {
  buildMediaHistoryContent,
  buildPassiveHistoryContent,
  mediaKindForMessage,
  userRoleTag,
} from "./format.js";

/**
 * Record every human group message into shared history (text + vision for media).
 * Runs before address checks so the bot has context when it joins mid-conversation.
 */
export async function recordPassiveGroupHistory(
  ctx: Context,
  services: BotHostServices,
): Promise<void> {
  const msg = ctx.message;
  if (!msg || ctx.from?.is_bot) return;

  const { callbacks, logging } = services;
  if (callbacks.isSlashCommandMessage?.(ctx)) return;
  if (ctx.chat?.type === "private") return;
  if (callbacks.isMaintenanceBlocked?.(ctx)) return;

  const chatKey = callbacks.resolveConversationKey?.(ctx);
  const role = userRoleTag(ctx.from);
  if (!chatKey || !role) return;

  const msgLog = {
    chatId: ctx.chat?.id,
    userId: ctx.from?.id,
    messageId: msg.message_id,
    convKey: chatKey,
    passive: true,
  };
  const botId = ctx.me?.id;

  const rawText = (msg.text ?? msg.caption ?? "").trim();
  const enrichedText = rawText
    ? (callbacks.enrichTextWithUserMentions?.(rawText, msg, {
        botId,
        botUsername: ctx.me?.username,
        senderId: ctx.from?.id,
        senderUsername: ctx.from?.username,
      }) ?? rawText)
    : "";
  const textContent = buildPassiveHistoryContent(
    msg,
    ctx.from,
    enrichedText,
    botId,
  );
  if (textContent) {
    appendMessage(chatKey, role, textContent);
    logging.logEvent("passive_history_stored", { ...msgLog, kind: "text" });
  }

  if (callbacks.messageHasVisionMedia?.(msg)) {
    const mediaKind = mediaKindForMessage(msg, !!msg.sticker);
    logging.logEvent("media_detected", {
      ...msgLog,
      mediaKind,
      onMessage: true,
    });

    const loaded = await callbacks.loadVisionFromMessage?.(
      services.botToken,
      msg,
    );
    if (!loaded) return;

    if (loaded.unavailableText) {
      logging.logEvent("vision_unavailable", msgLog);
    } else if (loaded.images.length > 0) {
      const sticker = loaded.sourceSticker ?? msg.sticker;
      const visionDescription = await callbacks.describeVisionImages?.(
        loaded.images,
        msgLog,
        loaded.visionHint,
      );
      if (!visionDescription) return;

      const mediaHistory = buildMediaHistoryContent(
        ctx.from,
        msg,
        mediaKind,
        visionDescription,
        botId,
        callbacks.stickerPackEmoji?.(sticker) ?? null,
      );
      if (mediaHistory) {
        appendMessage(chatKey, role, mediaHistory);
        logging.logEvent("vision_stored", {
          ...msgLog,
          mediaKind,
          chars: visionDescription.length,
        });
      }
    }
  }
}
