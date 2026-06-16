import {
  COMPRESSED_ROLE,
  getHistory,
  historyTotalTokens,
  replaceHistory,
  type StoredMessage,
} from "../db/history/index.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import { chatComplete } from "../llm/client.js";
import type { ChatMessage } from "../llm/client.js";
import { getResolvedHistoryLimits } from "../settings/runtime.js";
import { APPROX_CHARS_PER_TOKEN } from "../settings/limits.js";

const HISTORY_COMPRESS_NUM_PREDICT = 512;

const HISTORY_COMPRESS_SYSTEM = `You compress Telegram chat history into one short narrative paragraph.

Use participant tags exactly like [user:username:id] and [assistant said] for the bot.
Mention replies ("replied to"), media ("sent an image which depicts..."), and key topics.
Output ONLY the summary text - no markdown, no labels.`;

const inFlight = new Map<string, Promise<void>>();

/**
 * Ensure stored history fits in the token budget. If it overflows, compress the
 * entire history into one [compressed] row and overwrite. Awaited before history
 * is injected into a prompt so the caller always sees a fitting transcript.
 */
export function ensureHistoryFits(chatKey: string): Promise<void> {
  const existing = inFlight.get(chatKey);
  if (existing) return existing;

  const task = compressIfNeeded(chatKey).finally(() => {
    inFlight.delete(chatKey);
  });
  inFlight.set(chatKey, task);
  return task;
}

async function compressIfNeeded(chatKey: string): Promise<void> {
  const history = getHistory(chatKey);
  if (history.length === 0) return;

  const limits = getResolvedHistoryLimits();
  if (historyTotalTokens(history) <= limits.historyMaxTokens) return;

  const maxSummaryChars = Math.max(
    400,
    Math.floor(limits.historyMaxTokens * APPROX_CHARS_PER_TOKEN * 0.85),
  );

  const transcript = history.map((m) => m.content.trim()).join("\n");
  const messages: ChatMessage[] = [
    { role: "system", content: HISTORY_COMPRESS_SYSTEM },
    {
      role: "user",
      content:
        `Character budget: about ${maxSummaryChars} characters.\n\n` +
        `History to compress into one paragraph:\n${transcript}`,
    },
  ];

  try {
    const raw = await chatComplete(messages, {
      numPredict: HISTORY_COMPRESS_NUM_PREDICT,
      auxiliary: true,
    });
    const summaryBody = clampSummaryText(raw, maxSummaryChars);
    if (!summaryBody) return;

    const compressed: StoredMessage[] = [
      {
        role: COMPRESSED_ROLE,
        content: summaryBody,
        compressedAt: Math.floor(Date.now() / 1000),
      },
    ];
    replaceHistory(chatKey, compressed, true);
    logEvent("history_compressed", {
      convKey: chatKey,
      messageCount: history.length,
      resultChars: summaryBody.length,
    });
  } catch (err) {
    logEventError("history_compression_failed", err, { convKey: chatKey });
  }
}

function clampSummaryText(raw: string, maxChars: number): string {
  let text = raw.trim();
  text = text.replace(/^\[REPLY\][\s\S]*?\[\/REPLY\]/i, "").trim();
  if (!text) return "";
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut}...`;
}
