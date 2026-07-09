import { errorMessage } from "../../logging/index.js";
import { extractTelegramReply } from "../completions/index.js";
import { getBot } from "../../bot/index.js";
import { splitTelegramMessage } from "../../bot/replies/delivery.js";
import { appendAssistantMessage } from "../history/db/index.js";
import { recordReply } from "../../db/index.js";
import { generateOutOfBandReplyRaw } from "../../pipeline/out-of-band-reply.js";
import { logEvent, logEventError } from "../../logging/event-log.js";
import { prepareTelegramHtml, visibleTelegramText } from "../../telegram/html.js";
import type { TaskRecord } from "./db/tasks.js";
import {
  getRecentTaskMessageTexts,
  recordTaskMessage,
} from "./db/task-messages.js";
import { recordTaskEvent } from "./db/task-events.js";
import { beginTaskProcessing } from "../../debug/task-report.js";
import type { ProcessingRecorder } from "../../debug/processing-recorder.js";

/**
 * A delivered task nudge is one short chat line. Anything far longer is not a
 * real prior delivery but leaked model output — historically a thinking-runaway
 * (a multi-thousand-char "Wait, I'll just use: …" repetition loop) got posted
 * before the client guard existed and stored in chat history. Feeding such a
 * blob back as "vary from this" primes a fresh runaway, so it must be excluded
 * from the variation context entirely.
 */
const MAX_VARIATION_SAMPLE_CHARS = 1000;

/** Drop leaked/runaway blobs so only clean prior nudges seed wording variation. */
function cleanVariationSamples(previousMessages: string[]): string[] {
  return previousMessages.filter(
    (text) => text.length <= MAX_VARIATION_SAMPLE_CHARS,
  );
}

function buildTaskUserMessage(
  task: TaskRecord,
  previousMessages: string[],
): string {
  const previousBlock =
    previousMessages.length > 0
      ? `\n\nYou have delivered this recurring task before. Your most recent messages for it (newest first):\n` +
        previousMessages.map((text, i) => `${i + 1}. ${text}`).join("\n") +
        `\nSay the same thing a DIFFERENT way this time — fresh wording, angle, or phrasing. Do not reuse any sentence from the list above.`
      : "";
  return (
    `[SCHEDULED TASK] A standing task you set up for this chat is now due. Deliver it now.\n` +
    `Directive: ${task.instruction}\n\n` +
    `Write ONE short, natural, in-character chat message that *performs* this directive right now. ` +
    `The message IS the reminder/nudge itself, spoken to the people it concerns.\n` +
    `- Do NOT restate the directive as an instruction. Never write "remind X to ..." — instead say what you would actually tell them. (e.g. directive "remind me to call mom" → "Hey, don't forget to call your mom".)\n` +
    `- Address people by @username when you know it, otherwise by name. If it concerns the chat owner themselves, address them directly ("you").\n` +
    `- Plain spoken text only. NEVER output raw chat tags such as [user:name:id], [assistant said], or any metadata.\n` +
    `- Vary the wording from previous times; do not mention that this is scheduled or automated.${previousBlock}\n` +
    `Output only the message text.`
  );
}

/** True when the text has at least one letter or digit (not just punctuation). */
function hasVisibleContent(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

async function generateTaskMessage(
  task: TaskRecord,
  previousMessages: string[],
  traceTurnId?: number,
): Promise<{ raw: string; reply: string }> {
  const raw = await generateOutOfBandReplyRaw({
    userMessage: buildTaskUserMessage(task, previousMessages),
    isGroupChat: task.entityId !== String(task.chatId),
    chatId: task.chatId,
    entityId: task.entityId,
    traceLabel: "task fire",
    traceTurnId,
  });
  return { raw, reply: extractTelegramReply(raw) };
}

function replySummary(text: string): string {
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

/** Generate and deliver one task's message; record the message→task links. */
export async function fireTask(task: TaskRecord): Promise<boolean> {
  const report: ProcessingRecorder | null = await beginTaskProcessing(task.id);
  report?.note("Fired", task.instruction);

  // Recurring tasks get their recent deliveries fed back so the model varies its
  // wording; a one-shot has no "previous times" to repeat.
  const previousMessages =
    task.scheduleKind === "once"
      ? []
      : cleanVariationSamples(
          await getRecentTaskMessageTexts(task.id, task.entityId, 5),
        );
  if (previousMessages.length > 0) {
    report?.note(
      "Variation context",
      `${previousMessages.length} previous message(s) included`,
    );
  }

  let raw: string;
  let reply: string;
  try {
    ({ raw, reply } = await generateTaskMessage(
      task,
      previousMessages,
      report?.traceId,
    ));
  } catch (err) {
    const message = errorMessage(err);
    logEventError("task_fire_generate_failed", err, { taskId: task.id });
    await recordTaskEvent({
      taskId: task.id,
      kind: "fire_failed",
      chatId: task.chatId,
      summary: `Generation failed: ${task.instruction}`,
      detail: { instruction: task.instruction, error: message },
    });
    report?.failPhase("generate", "LLM generation", message);
    report?.complete("error", { summary: `Generation failed: ${message}` });
    return false;
  }
  if (!hasVisibleContent(reply)) {
    // The model echoed only chat tags/punctuation (stripped to nothing) — skip
    // rather than post a meaningless message like ":".
    logEvent("task_fire_empty", { taskId: task.id, raw: reply.slice(0, 80) });
    await recordTaskEvent({
      taskId: task.id,
      kind: "fire_failed",
      chatId: task.chatId,
      summary: `Empty reply (no visible content): ${task.instruction}`,
      detail: { instruction: task.instruction, raw: reply.slice(0, 200) },
    });
    report?.failPhase(
      "reply-parse",
      "Reply parsed",
      `Empty reply (no visible content) · ${raw.length} raw chars`,
    );
    report?.complete("error", { summary: "Empty reply (no visible content)" });
    return false;
  }
  report?.okPhase(
    "reply-parse",
    "Reply parsed",
    `${raw.length} raw chars → ${reply.length} chars`,
  );

  const html = prepareTelegramHtml(reply);
  const chunks = splitTelegramMessage(html);
  report?.okPhase("format", "Formatted for Telegram", `${chunks.length} chunk(s)`);
  const bot = getBot();
  const extra: { parse_mode: "HTML"; message_thread_id?: number } = {
    parse_mode: "HTML",
  };
  if (task.messageThreadId != null) extra.message_thread_id = task.messageThreadId;

  const sentMessages: { messageId: number; text: string }[] = [];
  try {
    for (const chunk of chunks) {
      const sent = await bot.api.sendMessage(task.chatId, chunk, extra);
      sentMessages.push({
        messageId: sent.message_id,
        text: visibleTelegramText(chunk),
      });
    }
  } catch (err) {
    const message = errorMessage(err);
    logEventError("task_fire_send_failed", err, { taskId: task.id });
    await recordTaskEvent({
      taskId: task.id,
      kind: "fire_failed",
      chatId: task.chatId,
      summary: `Send failed: ${task.instruction}`,
      detail: { instruction: task.instruction, error: message, reply },
    });
    report?.failPhase("deliver", "Delivery", message);
    report?.complete("error", { summary: `Send failed: ${message}` });
    return false;
  }
  report?.okPhase(
    "deliver",
    "Delivered",
    `${sentMessages.length} chunk(s) · ${reply.length} chars`,
    undefined,
    sentMessages,
  );

  for (const sent of sentMessages) {
    await recordTaskMessage(task.id, String(task.chatId), sent.messageId);
  }
  // Store the first chunk's Telegram id on the assistant history row so future
  // fires can join task_messages → chat_messages to recall this wording.
  await appendAssistantMessage(task.entityId, reply, {
    messageId: sentMessages[0]?.messageId,
  });
  await recordReply(false);
  report?.okPhase(
    "history",
    "History recorded",
    "Assistant message appended to chat history",
  );
  logEvent("task_fired", {
    taskId: task.id,
    chatId: task.chatId,
    chunks: sentMessages.length,
    replyChars: reply.length,
  });
  await recordTaskEvent({
    taskId: task.id,
    kind: "fired",
    chatId: task.chatId,
    summary: replySummary(reply),
    detail: {
      instruction: task.instruction,
      sentMessages,
    },
  });
  report?.complete("processed", { summary: replySummary(reply) });
  return true;
}
