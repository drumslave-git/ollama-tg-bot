import { errorMessage } from "../../logging/index.js";
import { getBot } from "../index.js";
import { appendAssistantMessage } from "../../features/history/db/index.js";
import { recordReply } from "../../db/index.js";
import { generateOutOfBandReplyRaw } from "../../pipeline/out-of-band-reply.js";
import { splitTelegramMessage } from "../replies/delivery.js";
import { logEvent, logEventError } from "../../logging/event-log.js";
import { prepareTelegramHtml } from "../../telegram/html.js";
import {
  buildMaintenanceAnnouncementUserMessage,
  collectMaintenanceAnnouncementChatIds,
  parseMaintenanceAnnouncementReply,
} from "./announce-support.js";

export {
  buildMaintenanceAnnouncementUserMessage,
  collectMaintenanceAnnouncementChatIds,
  parseMaintenanceAnnouncementReply,
} from "./announce-support.js";

export async function generateMaintenanceAnnouncement(
  enabled: boolean,
  chatId?: number,
): Promise<string> {
  const raw = await generateOutOfBandReplyRaw({
    userMessage: buildMaintenanceAnnouncementUserMessage(enabled),
    chatId,
    entityId: chatId != null ? String(chatId) : undefined,
  });
  return parseMaintenanceAnnouncementReply(raw);
}

async function sendAnnouncementToChat(
  chatId: number,
  html: string,
  plainText: string,
): Promise<boolean> {
  const bot = getBot();
  const chunks = splitTelegramMessage(html);

  for (const chunk of chunks) {
    try {
      await bot.api.sendMessage(chatId, chunk, { parse_mode: "HTML" });
    } catch (err) {
      try {
        await bot.api.sendMessage(chatId, chunk);
      } catch (fallbackErr) {
        logEventError("maintenance_announce_send_failed", fallbackErr, {
          chatId,
          originalError: errorMessage(err),
        });
        return false;
      }
    }
  }

  await appendAssistantMessage(String(chatId), plainText);
  return true;
}

export async function broadcastMaintenanceAnnouncement(
  enabled: boolean,
): Promise<void> {
  const chatIds = await collectMaintenanceAnnouncementChatIds();
  if (chatIds.length === 0) {
    logEvent("maintenance_announce_skipped", {
      enabled,
      reason: "no_chats",
    });
    return;
  }

  let sent = 0;
  let failed = 0;

  for (const chatId of chatIds) {
    try {
      const reply = await generateMaintenanceAnnouncement(enabled, chatId);
      const html = prepareTelegramHtml(reply);
      const ok = await sendAnnouncementToChat(chatId, html, reply);
      if (ok) sent++;
      else failed++;
    } catch (err) {
      failed++;
      logEventError("maintenance_announce_send_failed", err, {
        chatId,
        enabled,
      });
    }
  }

  if (sent > 0) {
    await recordReply(false);
  }

  logEvent("maintenance_announce_broadcast", {
    enabled,
    chatCount: chatIds.length,
    sent,
    failed,
  });
}
