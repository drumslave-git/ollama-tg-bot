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
import { planGoalLinks } from "../features/web-browse/goal-links.js";
import type { CollectedFile } from "../features/web-browse/tools.js";
import { setRunEnqueuedListener } from "../features/web-browse/signal.js";

let started = false;
let pumping = false;
const active = new Set<number>();

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

/** Run one link (or the whole goal) with its OWN fresh session, step budget,
 * and wall-clock timeout, then deliver its report. Never throws. */
async function runOneLink(
  run: BrowserAgentRun,
  goal: string,
  recorder: ProcessingRecorder | null,
): Promise<{ ok: boolean; steps: number }> {
  const session = new BrowserSession();
  const settings = await getSettings();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void session.close();
  }, settings.browserAgentMaxSeconds * 1000);

  try {
    const result = await runBrowserAgent({
      goal,
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
    return { ok: Boolean(result.report) && !timedOut, steps: result.steps };
  } catch (err) {
    clearTimeout(timer);
    const message = timedOut
      ? `Timed out after ${settings.browserAgentMaxSeconds}s`
      : errorMessage(err);
    logEventError("browser_agent_failed", err, { runId: run.id });
    recorder?.failPhase("agent", "Agent run", message);
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
    return { ok: false, steps: 0 };
  } finally {
    await session.close();
  }
}

async function runOne(run: BrowserAgentRun): Promise<void> {
  await setBrowserAgentRunStatus(run.id, "running");
  await refreshCounts();

  const recorder = await beginBrowserAgentProcessing(run.id);
  recorder?.note("Goal", run.goal);

  // Multiple links → process one by one; each gets a fresh budget ("reset
  // limits") and its own report. One/zero links → a single task.
  const tasks = planGoalLinks(run.goal);
  let okCount = 0;
  let totalSteps = 0;

  for (const [index, task] of tasks.entries()) {
    if (tasks.length > 1) {
      recorder?.note(
        `Link ${index + 1}/${tasks.length}`,
        task.url ?? "(from goal)",
      );
    }
    const { ok, steps } = await runOneLink(run, task.goal, recorder);
    if (ok) okCount += 1;
    totalSteps += steps;
  }

  const summary =
    tasks.length > 1
      ? `${okCount}/${tasks.length} link(s) done`
      : okCount > 0
        ? "done"
        : "no result";
  await setBrowserAgentRunStatus(
    run.id,
    tasks.length > 1 || okCount > 0 ? "completed" : "failed",
    { result: summary, stepCount: totalSteps },
  );
  recorder?.complete(okCount > 0 ? "processed" : "error", { summary });
  logEvent("browser_agent_completed", {
    runId: run.id,
    links: tasks.length,
    ok: okCount,
    steps: totalSteps,
  });
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
