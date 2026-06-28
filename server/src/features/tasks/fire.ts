import {
  extractTelegramReply,
  getMainReplyResponseFormat,
} from "../completions/index.js";
import { getBot } from "../../bot/index.js";
import { splitTelegramMessage } from "../../bot/replies/delivery.js";
import {
  getActivePersonalityPrompt,
  getEffectiveMood,
} from "../mood/db/index.js";
import { appendAssistantMessage } from "../history/db/index.js";
import { getSettings, recordReply } from "../../db/index.js";
import { chatCompleteDetailed } from "../../llm/client.js";
import { buildSystemPrompt } from "../../pipeline/adapters/system-prompt.js";
import { getResolvedSettings } from "../../settings/runtime.js";
import { getMaintenanceAnnounceNumPredict } from "../../settings/limits.js";
import { getOwnerUserId, getOwnerUsername } from "../../bot/owner/owner.js";
import { logEvent, logEventError } from "../../logging/event-log.js";
import { prepareTelegramHtml, visibleTelegramText } from "../../telegram/html.js";
import type { TaskRecord } from "./db/tasks.js";
import { recordTaskMessage } from "./db/task-messages.js";
import { recordTaskEvent } from "./db/task-events.js";
import { beginTaskProcessing } from "../../debug/task-report.js";
import type { ProcessingRecorder } from "../../debug/processing-recorder.js";

function buildTaskUserMessage(task: TaskRecord): string {
  return (
    `[SCHEDULED TASK] A standing task you set up for this chat is now due. Deliver it now.\n` +
    `Directive: ${task.instruction}\n\n` +
    `Write ONE short, natural, in-character chat message that *performs* this directive right now. ` +
    `The message IS the reminder/nudge itself, spoken to the people it concerns.\n` +
    `- Do NOT restate the directive as an instruction. Never write "remind X to ..." / "Нагадай ..." — instead say what you would actually tell them. (e.g. directive "remind me to call mom" → "Hey, don't forget to call your mom".)\n` +
    `- Write the ENTIRE message in the same language as the directive. Do not mix languages.\n` +
    `- Address people by @username when you know it, otherwise by name. If it concerns the chat owner themselves, address them directly ("you").\n` +
    `- Plain spoken text only. NEVER output raw chat tags such as [user:name:id], [assistant said], or any metadata.\n` +
    `- Vary the wording from previous times; do not mention that this is scheduled or automated.\n` +
    `Output only the message text.`
  );
}

/** True when the text has at least one letter or digit (not just punctuation). */
function hasVisibleContent(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

async function generateTaskMessage(
  task: TaskRecord,
  traceTurnId?: number,
): Promise<string> {
  const settings = getResolvedSettings(await getSettings());
  const systemPrompt = buildSystemPrompt({
    settings,
    customPrompt: await getActivePersonalityPrompt(),
    knownChatUsers: [],
    isGroupChat: task.entityId !== String(task.chatId),
    ownerUserId: await getOwnerUserId(),
    ownerUsername: await getOwnerUsername(),
    mood: await getEffectiveMood(),
    entityId: task.entityId,
  });

  const { raw } = await chatCompleteDetailed(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildTaskUserMessage(task) },
    ],
    {
      auxiliary: true,
      responseFormat: getMainReplyResponseFormat(),
      numPredict: getMaintenanceAnnounceNumPredict(settings),
      traceLabel: "task fire",
      traceTurnId,
    },
  );

  return extractTelegramReply(raw);
}

function replySummary(text: string): string {
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

/** Generate and deliver one task's message; record the message→task links. */
export async function fireTask(task: TaskRecord): Promise<boolean> {
  const report: ProcessingRecorder | null = await beginTaskProcessing(task.id);
  report?.note("Fired", task.instruction);

  let reply: string;
  try {
    reply = await generateTaskMessage(task, report?.traceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEventError("task_fire_generate_failed", err, { taskId: task.id });
    await recordTaskEvent({
      taskId: task.id,
      kind: "fire_failed",
      chatId: task.chatId,
      summary: `Generation failed: ${task.instruction}`,
      detail: { instruction: task.instruction, error: message },
    });
    report?.note("Generation failed", message);
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
    report?.note("Empty reply", reply.slice(0, 200));
    report?.complete("error", { summary: "Empty reply (no visible content)" });
    return false;
  }

  const html = prepareTelegramHtml(reply);
  const chunks = splitTelegramMessage(html);
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
    const message = err instanceof Error ? err.message : String(err);
    logEventError("task_fire_send_failed", err, { taskId: task.id });
    await recordTaskEvent({
      taskId: task.id,
      kind: "fire_failed",
      chatId: task.chatId,
      summary: `Send failed: ${task.instruction}`,
      detail: { instruction: task.instruction, error: message, reply },
    });
    report?.note("Send failed", message);
    report?.complete("error", { summary: `Send failed: ${message}` });
    return false;
  }

  for (const sent of sentMessages) {
    await recordTaskMessage(task.id, String(task.chatId), sent.messageId);
  }
  await appendAssistantMessage(task.entityId, reply);
  await recordReply(false);
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
  report?.note(
    "Delivered",
    `${sentMessages.length} chunk(s) · ${reply.length} chars`,
  );
  report?.complete("processed", { summary: replySummary(reply) });
  return true;
}
