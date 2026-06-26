import { getMainReplyResponseFormat } from "../../features/completions/index.js";
import { getBot } from "../index.js";
import { getActivePersonalityPrompt } from "../../db/personalities/index.js";
import { appendAssistantMessage } from "../../db/history/index.js";
import { getEffectiveMood } from "../../db/mood/index.js";
import { getSettings, recordReply } from "../../db/index.js";
import { chatCompleteDetailed } from "../../llm/client.js";
import { buildSystemPrompt } from "../../pipeline/adapters/system-prompt.js";
import { getResolvedSettings } from "../../settings/runtime.js";
import {
  getMaintenanceAnnounceNumPredict,
} from "../../settings/limits.js";
import { getOwnerUserId, getOwnerUsername } from "../owner/owner.js";
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
): Promise<string> {
  const settings = getResolvedSettings(await getSettings());
  const systemPrompt = buildSystemPrompt({
    settings,
    customPrompt: await getActivePersonalityPrompt(),
    knownChatUsers: [],
    isGroupChat: false,
    ownerUserId: await getOwnerUserId(),
    ownerUsername: await getOwnerUsername(),
    mood: await getEffectiveMood(),
  });

  const { raw } = await chatCompleteDetailed(
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: buildMaintenanceAnnouncementUserMessage(enabled),
      },
    ],
    {
      auxiliary: true,
      responseFormat: getMainReplyResponseFormat(),
      numPredict: getMaintenanceAnnounceNumPredict(settings),
    },
  );

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
          originalError: err instanceof Error ? err.message : String(err),
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

  let reply: string;
  try {
    reply = await generateMaintenanceAnnouncement(enabled);
  } catch (err) {
    logEventError("maintenance_announce_generate_failed", err, { enabled });
    return;
  }

  const html = prepareTelegramHtml(reply);
  let sent = 0;
  let failed = 0;

  for (const chatId of chatIds) {
    try {
      const ok = await sendAnnouncementToChat(chatId, html, reply);
      if (ok) sent++;
      else failed++;
    } catch (err) {
      failed++;
      logEventError("maintenance_announce_send_failed", err, { chatId, enabled });
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
    replyChars: reply.length,
  });
}
