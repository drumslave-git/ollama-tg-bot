import type { ChatMessage, JsonSchemaResponseFormat } from "../../shared/index.js";
import { asObject, parseJsonContent } from "../../shared/index.js";
import { chatComplete } from "../../llm/client.js";
import { embed } from "../../llm/embeddings.js";
import { getSettings } from "../../db/index.js";
import { getMessagesInRange } from "../history/db/history.js";
import type { StoredMessage } from "../history/index.js";
import {
  addCalendarDays,
  zonedWallClockToUtc,
} from "../tasks/schedule.js";
import { replaceSummariesForDate, type InsertSummaryInput } from "./db/summaries.js";

/** Tokens for the summary side pass — topics can be lengthy for a busy day. */
export const SUMMARY_NUM_PREDICT = 1024;

export const SUMMARY_RESPONSE_FORMAT: JsonSchemaResponseFormat = {
  name: "history_day_summary",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      topics: {
        type: "array",
        description:
          "Distinct topics/threads discussed during the day. Empty when nothing substantive was said.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            content: {
              type: "string",
              description:
                "A self-contained summary of this topic: what was discussed, decisions, facts, and who was involved.",
            },
            message_ids: {
              type: "array",
              description:
                "The message ids (from the [id:N] labels) that belong to this topic.",
              items: { type: "integer" },
            },
          },
          required: ["content", "message_ids"],
        },
      },
    },
    required: ["topics"],
  },
};

const SUMMARY_SYSTEM = `You compress one day of group chat history into a small set of topic summaries for long-term semantic recall.

Rules:
- Group the day's messages into distinct topics/threads. A day may have one topic or several.
- For each topic, write a self-contained summary: what was discussed, any decisions or facts, and who was involved (use the names/tags shown).
- Each summary must stand alone — a reader with no other context should understand it.
- Reference the [id:N] labels: list the message ids that belong to each topic in message_ids.
- Do not invent content. Summarize only what is present.
- If the day has nothing substantive (only greetings/noise), return an empty topics array.
- Write summaries in the dominant language of the conversation.

Respond with JSON only, matching the provided schema.`;

interface ParsedTopic {
  content: string;
  messageIds: number[];
}

/** Day bounds [startTs, endTs] in epoch seconds for a YYYY-MM-DD date in `tz`. */
export function dayBoundsEpochSeconds(
  dateStr: string,
  tz: string,
): { startTs: number; endTs: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  const start = zonedWallClockToUtc(year, month, day, 0, 0, tz);
  const next = addCalendarDays(year, month, day, 1);
  const nextStart = zonedWallClockToUtc(next.year, next.month, next.day, 0, 0, tz);
  return {
    startTs: Math.floor(start.getTime() / 1000),
    endTs: Math.floor(nextStart.getTime() / 1000) - 1,
  };
}

function buildTranscript(messages: StoredMessage[]): string {
  return messages
    .map((m) => {
      const idLabel = m.messageId != null ? `[id:${m.messageId}] ` : "";
      const at = m.createdAt
        ? new Date(m.createdAt * 1000).toISOString()
        : "";
      const time = at ? `${at} ` : "";
      return `${time}${idLabel}${m.role}: ${m.content}`;
    })
    .join("\n");
}

function parseTopics(raw: string): ParsedTopic[] {
  const parsed = asObject(parseJsonContent(raw));
  const topics = parsed?.topics;
  if (!Array.isArray(topics)) return [];
  const result: ParsedTopic[] = [];
  for (const entry of topics) {
    const obj = asObject(entry);
    if (!obj) continue;
    const content = typeof obj.content === "string" ? obj.content.trim() : "";
    if (!content) continue;
    const ids = Array.isArray(obj.message_ids)
      ? obj.message_ids
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n))
      : [];
    result.push({ content, messageIds: ids });
  }
  return result;
}

export interface SummarizeResult {
  topicCount: number;
  messageCount: number;
}

/**
 * Summarize one chat's messages for a single day and store the embedded topics.
 * Idempotent at the storage layer: existing rows for the date are replaced.
 */
export async function summarizeChatDay(
  chatId: string,
  dateStr: string,
  timezone: string,
): Promise<SummarizeResult> {
  const { startTs, endTs } = dayBoundsEpochSeconds(dateStr, timezone);
  const messages = await getMessagesInRange(chatId, startTs, endTs);
  if (messages.length === 0) {
    await replaceSummariesForDate(chatId, dateStr, []);
    return { topicCount: 0, messageCount: 0 };
  }

  const settings = await getSettings();
  const transcript = buildTranscript(messages);
  const conversation: ChatMessage[] = [
    { role: "system", content: SUMMARY_SYSTEM },
    {
      role: "user",
      content:
        `Summarize the topics discussed in this chat on ${dateStr}.\n\n` +
        `Messages:\n${transcript}`,
    },
  ];

  const raw = await chatComplete(conversation, {
    model: settings.model,
    auxiliary: true,
    numPredict: SUMMARY_NUM_PREDICT,
    responseFormat: SUMMARY_RESPONSE_FORMAT,
    traceLabel: "history summary",
  });

  const topics = parseTopics(raw);
  if (topics.length === 0) {
    await replaceSummariesForDate(chatId, dateStr, []);
    return { topicCount: 0, messageCount: messages.length };
  }

  const vectors = await embed(topics.map((t) => t.content));
  const rows: InsertSummaryInput[] = topics.map((topic, i) => ({
    chatId,
    summaryDate: dateStr,
    messageIds: topic.messageIds,
    content: topic.content,
    embedding: vectors[i] ?? [],
  }));
  // Drop any topic whose embedding failed to materialize.
  const valid = rows.filter((r) => r.embedding.length > 0);
  await replaceSummariesForDate(chatId, dateStr, valid);

  return { topicCount: valid.length, messageCount: messages.length };
}
