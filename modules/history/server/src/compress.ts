import { buildHistoryCompressionTranscript } from "./format.js";
import { historyTotalTokens } from "./transform.js";
import {
  COMPRESSED_ROLE,
  HISTORY_APPROX_CHARS_PER_TOKEN,
  type StoredMessage,
} from "./types.js";

export const HISTORY_COMPRESS_NUM_PREDICT = 512;

export const HISTORY_COMPRESS_SYSTEM = `You compress Telegram chat history into one short narrative paragraph.

Participant tags in the source use the exact form [user:username:id] for humans and [assistant said] for the bot.
Copy those tags verbatim whenever you refer to a participant — never invent, shorten, renumber, or replace them.
Mention replies ("replied to"), media ("sent an image which depicts..."), and key topics.
Output ONLY the summary text - no markdown, no labels.`;

export interface HistoryCompressChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface HistoryCompressDeps {
  getHistory: (chatKey: string) => StoredMessage[];
  replaceHistory: (
    chatKey: string,
    messages: StoredMessage[],
    isCompression?: boolean,
  ) => void;
  chatComplete: (
    messages: HistoryCompressChatMessage[],
    options?: { numPredict?: number },
  ) => Promise<string>;
  getHistoryLimits: () => { historyMaxTokens: number };
  onCompressed?: (info: {
    chatKey: string;
    messageCount: number;
    resultChars: number;
  }) => void;
  onError?: (err: unknown, chatKey: string) => void;
}

export interface HistoryCompressOptions {
  force?: boolean;
}

export interface HistoryCompressResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  messageCount?: number;
  resultChars?: number;
}

const inFlight = new Map<string, Promise<HistoryCompressResult>>();

export function scheduleHistoryCompression(
  chatKey: string,
  deps: HistoryCompressDeps,
  options?: HistoryCompressOptions,
): Promise<HistoryCompressResult> {
  const existing = inFlight.get(chatKey);
  if (existing) return existing;

  const task = compressHistoryChat(chatKey, deps, options).finally(() => {
    inFlight.delete(chatKey);
  });
  inFlight.set(chatKey, task);
  return task;
}

export async function compressHistoryChat(
  chatKey: string,
  deps: HistoryCompressDeps,
  options: HistoryCompressOptions = {},
): Promise<HistoryCompressResult> {
  const history = deps.getHistory(chatKey);
  if (history.length === 0) {
    return { ok: true, skipped: true, reason: "empty" };
  }

  const limits = deps.getHistoryLimits();
  if (!options.force && historyTotalTokens(history) <= limits.historyMaxTokens) {
    return { ok: true, skipped: true, reason: "within_budget" };
  }

  const maxSummaryChars = Math.max(
    400,
    Math.floor(limits.historyMaxTokens * HISTORY_APPROX_CHARS_PER_TOKEN * 0.85),
  );

  const transcript = buildHistoryCompressionTranscript(history);
  const messages: HistoryCompressChatMessage[] = [
    { role: "system", content: HISTORY_COMPRESS_SYSTEM },
    {
      role: "user",
      content:
        `Character budget: about ${maxSummaryChars} characters.\n\n` +
        `History to compress into one paragraph:\n${transcript}`,
    },
  ];

  try {
    const raw = await deps.chatComplete(messages, {
      numPredict: HISTORY_COMPRESS_NUM_PREDICT,
    });
    const summaryBody = clampSummaryText(raw, maxSummaryChars);
    if (!summaryBody) {
      return { ok: false, reason: "empty_summary" };
    }

    const compressed: StoredMessage[] = [
      {
        role: COMPRESSED_ROLE,
        content: summaryBody,
        compressedAt: Math.floor(Date.now() / 1000),
      },
    ];
    deps.replaceHistory(chatKey, compressed, true);
    deps.onCompressed?.({
      chatKey,
      messageCount: history.length,
      resultChars: summaryBody.length,
    });
    return {
      ok: true,
      messageCount: history.length,
      resultChars: summaryBody.length,
    };
  } catch (err) {
    deps.onError?.(err, chatKey);
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "compression_failed",
    };
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
