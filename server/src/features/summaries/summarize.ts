import type { ChatMessage, JsonSchemaResponseFormat } from "../../shared/index.js";
import { asObject, parseJsonContent } from "../../shared/index.js";
import { chatComplete } from "../../llm/client.js";
import { embed } from "../../llm/embeddings.js";
import { getSettings } from "../../db/index.js";
import {
  getMessagesInRangeBatches,
  mapHistoryBase64Media,
} from "../history/db/history.js";
import {
  parseBase64MediaHistoryContent,
  redactBase64MediaForDisplay,
  replaceBase64WithVisionDescription,
  type StoredMessage,
} from "../history/index.js";
import {
  describeVisionImages,
  type VisionDescribeConfig,
} from "../vision/index.js";
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
const TRUNCATED_MESSAGE_NOTICE = "[message truncated for summary]";
const OMITTED_IMAGE_DATA_NOTICE = "[image data omitted]";
const OMITTED_BASE64_DATA_NOTICE = "[base64 data omitted]";
const INLINE_IMAGE_DATA_URI =
  /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{128,}/gi;
const LONG_BASE64_RUN = /\b[A-Za-z0-9+/]{4096,}={0,2}\b/g;

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

export function sanitizeSummaryMessageContent(
  content: string,
  maxChars = Number.POSITIVE_INFINITY,
): string {
  let safe = redactBase64MediaForDisplay(content) ?? content;
  safe = safe
    .replace(INLINE_IMAGE_DATA_URI, OMITTED_IMAGE_DATA_NOTICE)
    .replace(LONG_BASE64_RUN, OMITTED_BASE64_DATA_NOTICE)
    .trim();

  if (!Number.isFinite(maxChars) || safe.length <= maxChars) return safe;
  if (maxChars <= TRUNCATED_MESSAGE_NOTICE.length) {
    return TRUNCATED_MESSAGE_NOTICE;
  }

  const keepChars = maxChars - TRUNCATED_MESSAGE_NOTICE.length - 1;
  return `${safe.slice(0, keepChars).trimEnd()}\n${TRUNCATED_MESSAGE_NOTICE}`;
}

function toSummaryMessage(
  message: StoredMessage,
  maxContentChars: number,
): StoredMessage {
  return {
    ...message,
    content: sanitizeSummaryMessageContent(message.content ?? "", maxContentChars),
  };
}

type DescribeSummaryImages = typeof describeVisionImages;
type UpdateHistoryBase64Media = typeof mapHistoryBase64Media;

export interface ResolveSummaryMessageMediaOptions {
  model: string;
  traceTurnId?: number;
  describeImages?: DescribeSummaryImages;
  updateHistoryBase64Media?: UpdateHistoryBase64Media;
}

export async function resolveSummaryMessageMedia(
  chatId: string,
  message: StoredMessage,
  options: ResolveSummaryMessageMediaOptions,
): Promise<StoredMessage> {
  const parsed = parseBase64MediaHistoryContent(message.content ?? "");
  if (!parsed) return message;

  try {
    const describeConfig: VisionDescribeConfig = {
      chatComplete: (messages, opts) =>
        chatComplete(messages, {
          model: options.model,
          numPredict: opts.numPredict,
          auxiliary: opts.auxiliary,
          traceLabel: "vision describe (summary)",
          traceTurnId: opts.traceTurnId,
        }),
    };
    const description = await (options.describeImages ?? describeVisionImages)(
      {
        images: [{ base64: parsed.base64, mimeHint: parsed.mimeHint }],
        traceTurnId: options.traceTurnId,
        logContext: { chatId, summary: true },
      },
      describeConfig,
    );
    const nextContent = replaceBase64WithVisionDescription(
      message.content,
      description,
    );
    if (!nextContent) return message;

    await (options.updateHistoryBase64Media ?? mapHistoryBase64Media)(
      chatId,
      (content) => content === message.content,
      (content) => (content === message.content ? nextContent : null),
    );
    return { ...message, content: nextContent };
  } catch {
    return message;
  }
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
  const maxMessageChars = Math.max(256, charBudget - 128);

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
      const mediaResolvedMessage = await resolveSummaryMessageMedia(chatId, message, {
        model: settings.model,
        traceTurnId: options?.traceTurnId,
      });
      const summaryMessage = toSummaryMessage(mediaResolvedMessage, maxMessageChars);
      const cost = transcriptCost(summaryMessage);
      if (currentBatch.length > 0 && currentBatchChars + cost > charBudget) {
        await flushBatch();
      }
      currentBatch.push(summaryMessage);
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
