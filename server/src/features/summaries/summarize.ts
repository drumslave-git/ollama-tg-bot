import type { ChatMessage, JsonSchemaResponseFormat } from "../../shared/index.js";
import { asObject, parseJsonContent } from "../../shared/index.js";
import { chatComplete } from "../../llm/client.js";
import { embed } from "../../llm/embeddings.js";
import { getSettings } from "../../db/index.js";
import { getMessagesInRangeBatches } from "../history/db/history.js";
import type { StoredMessage } from "../history/index.js";
import {
  APPROX_CHARS_PER_TOKEN,
  NUM_CTX_GENERATION_HEADROOM,
} from "../../settings/limits.js";
import {
  addCalendarDays,
  zonedWallClockToUtc,
} from "../tasks/schedule.js";
import { replaceSummariesForDate, type InsertSummaryInput } from "./db/summaries.js";

/** Tokens for the summary side pass — topics can be lengthy for a busy day. */
export const SUMMARY_NUM_PREDICT = 2048;

/**
 * Transcript tokens one batch may carry per token of summary output. Each pass is
 * capped at {@link SUMMARY_NUM_PREDICT} output tokens; chat compresses heavily, so
 * a batch can hold several times that of input and still finish in one bounded
 * output. Feeding a whole busy day at once overran the model into a repetition
 * loop — this keeps each batch completable. Conservative; raise to chunk less.
 */
const SUMMARY_INPUT_TOKENS_PER_OUTPUT_TOKEN = 4;

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
  /** Transcript size sent to the LLM — a large value points at context overflow. */
  transcriptChars: number;
}

export interface SummarizeOptions {
  /** Route the summary LLM request/response onto an active debug job run. */
  traceTurnId?: number;
}

/**
 * Transcript chars one summary batch may carry — derived from the model's token
 * budget, not fixed. Primary limit: a few times the {@link SUMMARY_NUM_PREDICT}
 * output budget, so a pass always finishes within one bounded output. Hard
 * ceiling: whatever still fits in context alongside the output and system prompt
 * (matters for small-context models). Scales with numCtx / numPredict.
 */
function summaryBatchCharBudget(numCtx: number): number {
  const ratioTokens = SUMMARY_NUM_PREDICT * SUMMARY_INPUT_TOKENS_PER_OUTPUT_TOKEN;
  const systemTokens = Math.ceil(SUMMARY_SYSTEM.length / APPROX_CHARS_PER_TOKEN);
  const contextTokens =
    numCtx - SUMMARY_NUM_PREDICT - NUM_CTX_GENERATION_HEADROOM - systemTokens;
  const tokens = Math.max(0, Math.min(ratioTokens, contextTokens));
  return Math.floor(tokens * APPROX_CHARS_PER_TOKEN);
}

function transcriptCost(message: StoredMessage): number {
  // ~64 chars of per-line overhead (ISO timestamp, [id:N], role tag).
  return (message.content?.length ?? 0) + 64;
}

/** Run one summary LLM pass over a batch, returning its topics and transcript size. */
async function summarizeBatch(
  batch: StoredMessage[],
  dateStr: string,
  model: string,
  traceTurnId: number | undefined,
): Promise<{ topics: ParsedTopic[]; transcriptChars: number }> {
  const transcript = buildTranscript(batch);
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
    model,
    auxiliary: true,
    // Thinking made the model spend its budget reasoning, then loop on the JSON
    // output. Emitting the structured answer directly avoids that.
    think: false,
    numPredict: SUMMARY_NUM_PREDICT,
    responseFormat: SUMMARY_RESPONSE_FORMAT,
    traceLabel: "history summary",
    traceTurnId,
  });

  return { topics: parseTopics(raw), transcriptChars: transcript.length };
}

/**
 * Summarize one chat's messages for a single day and store the embedded topics.
 * Idempotent at the storage layer: existing rows for the date are replaced. A
 * busy day is summarized in transcript-budget-sized batches and the topics are
 * unioned, so a large group day can't overrun the model into a repetition loop.
 */
export async function summarizeChatDay(
  chatId: string,
  dateStr: string,
  timezone: string,
  options?: SummarizeOptions,
): Promise<SummarizeResult> {
  const { startTs, endTs } = dayBoundsEpochSeconds(dateStr, timezone);
  const settings = await getSettings();
  const charBudget = summaryBatchCharBudget(settings.numCtx);

  const topics: ParsedTopic[] = [];
  let transcriptChars = 0;
  let messageCount = 0;
  let currentBatch: StoredMessage[] = [];
  let currentBatchChars = 0;

  async function flushBatch(): Promise<void> {
    if (currentBatch.length === 0) return;
    const result = await summarizeBatch(
      currentBatch,
      dateStr,
      settings.model,
      options?.traceTurnId,
    );
    topics.push(...result.topics);
    transcriptChars += result.transcriptChars;
    currentBatch = [];
    currentBatchChars = 0;
  }

  for await (const page of getMessagesInRangeBatches(chatId, startTs, endTs)) {
    for (const message of page) {
      const cost = transcriptCost(message);
      if (currentBatch.length > 0 && currentBatchChars + cost > charBudget) {
        await flushBatch();
      }
      currentBatch.push(message);
      currentBatchChars += cost;
      messageCount += 1;
    }
  }
  await flushBatch();

  if (messageCount === 0) {
    await replaceSummariesForDate(chatId, dateStr, []);
    return { topicCount: 0, messageCount: 0, transcriptChars: 0 };
  }

  if (topics.length === 0) {
    await replaceSummariesForDate(chatId, dateStr, []);
    return { topicCount: 0, messageCount, transcriptChars };
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

  return { topicCount: valid.length, messageCount, transcriptChars };
}
