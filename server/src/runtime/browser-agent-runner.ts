import { InputFile } from "grammy";
import { getBot } from "../bot/index.js";
import { getSettings } from "../db/index.js";
import { recordReply } from "../db/index.js";
import { splitTelegramMessage } from "../bot/replies/delivery.js";
import { prepareTelegramHtml } from "../telegram/html.js";
import { appendAssistantMessage } from "../features/history/db/index.js";
import { errorMessage } from "../logging/index.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import {
  setBrowserAgentActivity,
  setBrowserAgentCounts,
} from "./pipeline-status.js";
import { beginBrowserAgentProcessing } from "../debug/browser-agent-report.js";
import type { ProcessingRecorder } from "../debug/processing-recorder.js";
import {
  failStaleRunningRuns,
  listQueuedBrowserAgentRuns,
  setBrowserAgentRunStatus,
  type BrowserAgentRun,
} from "../features/web-browse/db/index.js";
import { BrowserSession } from "../features/web-browse/session.js";
import { runBrowserAgent } from "../features/web-browse/agent.js";
import type { CollectedFile } from "../features/web-browse/tools.js";
import { setRunEnqueuedListener } from "../features/web-browse/signal.js";

let started = false;
let pumping = false;
const active = new Set<number>();

function clip(text: string, max = 200): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function refreshCounts(): Promise<void> {
  try {
    const queued = await listQueuedBrowserAgentRuns();
    setBrowserAgentCounts(active.size, queued.length);
  } catch {
    setBrowserAgentCounts(active.size, 0);
  }
}

async function deliverReport(
  run: BrowserAgentRun,
  text: string,
  files: CollectedFile[],
  recorder: ProcessingRecorder | null,
): Promise<void> {
  const bot = getBot();
  const extra: { parse_mode: "HTML"; message_thread_id?: number } = {
    parse_mode: "HTML",
  };
  if (run.messageThreadId != null) extra.message_thread_id = run.messageThreadId;

  const chunks = splitTelegramMessage(prepareTelegramHtml(text));
  let firstMessageId: number | undefined;
  for (const chunk of chunks) {
    const sent = await bot.api.sendMessage(run.chatId, chunk, extra);
    firstMessageId ??= sent.message_id;
  }

  for (const file of files) {
    try {
      await bot.api.sendDocument(
        run.chatId,
        new InputFile(file.buffer, file.filename),
        run.messageThreadId != null
          ? { message_thread_id: run.messageThreadId }
          : undefined,
      );
    } catch (err) {
      logEventError("browser_agent_file_send_failed", err, { runId: run.id });
    }
  }

  // Land the report in history so the conversation stays coherent.
  await appendAssistantMessage(run.entityId, text, { messageId: firstMessageId });
  await recordReply(false);
  recorder?.okPhase(
    "deliver",
    "Delivered",
    `${chunks.length} chunk(s) · ${files.length} file(s)`,
  );
}

async function runOne(run: BrowserAgentRun): Promise<void> {
  await setBrowserAgentRunStatus(run.id, "running");
  await refreshCounts();

  const recorder = await beginBrowserAgentProcessing(run.id);
  recorder?.note("Goal", run.goal);
  const session = new BrowserSession();

  const settings = await getSettings();
  const timeoutMs = settings.browserAgentMaxSeconds * 1000;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void session.close();
  }, timeoutMs);

  try {
    const result = await runBrowserAgent({
      goal: run.goal,
      isOwner: run.isOwner,
      recorder,
      session,
      onProgress: (step, action, url) =>
        setBrowserAgentActivity(run.goal, step, action, url),
    });
    clearTimeout(timer);
    const report =
      result.report ||
      (timedOut
        ? "I ran out of time before finishing that."
        : "I browsed but couldn't find anything useful.");
    await deliverReport(run, report, result.files, recorder);
    await setBrowserAgentRunStatus(run.id, "completed", {
      result: clip(report),
      stepCount: result.steps,
    });
    recorder?.complete("processed", { summary: clip(report) });
    logEvent("browser_agent_completed", { runId: run.id, steps: result.steps });
  } catch (err) {
    clearTimeout(timer);
    const message = timedOut
      ? `Timed out after ${settings.browserAgentMaxSeconds}s`
      : errorMessage(err);
    logEventError("browser_agent_failed", err, { runId: run.id });
    try {
      await deliverReport(
        run,
        timedOut
          ? "I ran out of time before finishing that."
          : "I hit a problem while browsing and had to stop.",
        [],
        recorder,
      );
    } catch (deliverErr) {
      logEventError("browser_agent_report_failed", deliverErr, { runId: run.id });
    }
    await setBrowserAgentRunStatus(run.id, "failed", { result: clip(message) });
    recorder?.failPhase("agent", "Agent run", message);
    recorder?.complete("error", { summary: clip(message) });
  } finally {
    await session.close();
  }
}

async function pump(): Promise<void> {
  if (!started || pumping) return;
  pumping = true;
  try {
    for (;;) {
      const settings = await getSettings();
      // Paused in maintenance mode, like the scheduled-task scheduler.
      if (settings.maintenanceModeEnabled) break;
      if (active.size >= settings.browserAgentConcurrency) break;
      const queued = await listQueuedBrowserAgentRuns();
      const next = queued.find((r) => !active.has(r.id));
      if (!next) break;
      active.add(next.id);
      void runOne(next).finally(() => {
        active.delete(next.id);
        void refreshCounts();
        void pump();
      });
    }
  } finally {
    pumping = false;
  }
  await refreshCounts();
}

export function startBrowserAgentRunner(): void {
  if (started) return;
  started = true;
  setRunEnqueuedListener(() => void pump());
  void (async () => {
    try {
      await failStaleRunningRuns();
    } catch {
      // ignore — the queue still drains
    }
    void pump();
  })();
}

export function stopBrowserAgentRunner(): void {
  started = false;
  setRunEnqueuedListener(null);
}
