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
import type {
  CollectedFile,
  DownloadRecord,
} from "../features/web-browse/tools.js";
import { formatDownloadReport } from "../features/web-browse/report.js";
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

/** What one link (or the whole goal) produced. Each link is reported to the
 * chat as it finishes; a multi-link run adds a final summary once all are done. */
interface LinkOutcome {
  ok: boolean;
  steps: number;
  files: CollectedFile[];
  downloads: DownloadRecord[];
  /** Text shown in the final report ONLY when the link produced no download
   * (a research answer or a failure) — download links use the structured form. */
  note: string;
}

/** Run one link with its OWN fresh session, to completion. There is no step or
 * wall-clock cap — it ends when the agent reports back or the tool loop detects
 * it is looping (which fails the link). Never throws; never delivers. */
async function runOneLink(
  run: BrowserAgentRun,
  goal: string,
  recorder: ProcessingRecorder | null,
): Promise<LinkOutcome> {
  const session = new BrowserSession();

  try {
    const result = await runBrowserAgent({
      goal,
      isOwner: run.isOwner,
      recorder,
      session,
      onProgress: (step, action, url) =>
        setBrowserAgentActivity(run.goal, step, action, url),
    });
    const hasDownload = result.downloads.length > 0;
    if (result.loopDetected) {
      recorder?.failPhase(
        "agent",
        "Agent run",
        "Stopped: repeated the same steps without progress",
      );
    }
    // A download link is reported by the deterministic download section, so its
    // (dropped) prose becomes an empty note.
    const note = hasDownload
      ? ""
      : result.loopDetected
        ? result.report ||
          "I kept repeating the same steps without making progress, so I stopped."
        : result.report;
    return {
      ok: hasDownload || (!result.loopDetected && Boolean(result.report)),
      steps: result.steps,
      files: result.files,
      downloads: result.downloads,
      note,
    };
  } catch (err) {
    logEventError("browser_agent_failed", err, { runId: run.id });
    recorder?.failPhase("agent", "Agent run", errorMessage(err));
    return {
      ok: false,
      steps: 0,
      files: [],
      downloads: [],
      note: "I hit a problem while browsing and had to stop.",
    };
  } finally {
    await session.close();
  }
}

/** Build one link's chat report: the deterministic download section (source
 * url / filename / size) plus any research/failure note, prefixed with
 * "Link n/total" for multi-link runs so each message says which URL it is for. */
function buildLinkReport(
  outcome: LinkOutcome,
  position: { index: number; total: number } | null,
): string {
  const sections: string[] = [];
  const downloadSection = formatDownloadReport(outcome.downloads);
  if (downloadSection) sections.push(downloadSection);
  if (outcome.note.trim()) sections.push(outcome.note.trim());
  const body =
    sections.join("\n\n") || "I browsed but couldn't find anything useful.";
  return position
    ? `<b>Link ${position.index}/${position.total}</b>\n\n${body}`
    : body;
}

async function runOne(run: BrowserAgentRun): Promise<void> {
  await setBrowserAgentRunStatus(run.id, "running");
  await refreshCounts();

  const recorder = await beginBrowserAgentProcessing(run.id);
  recorder?.note("Goal", run.goal);

  // Multiple links → process one by one, each with its OWN fresh session, and
  // report each link to the chat as it finishes (incremental feedback). One/
  // zero links → a single task whose report IS the whole end-of-task result.
  const tasks = planGoalLinks(run.goal);
  const multi = tasks.length > 1;
  let okCount = 0;
  let totalSteps = 0;
  let totalDownloads = 0;

  for (const [index, task] of tasks.entries()) {
    if (multi) {
      recorder?.note(
        `Link ${index + 1}/${tasks.length}`,
        task.url ?? "(from goal)",
      );
    }
    const outcome = await runOneLink(run, task.goal, recorder);
    if (outcome.ok) okCount += 1;
    totalSteps += outcome.steps;
    totalDownloads += outcome.downloads.length;

    // Report this link now, with its own inline files, so the user sees each
    // URL's result as it lands instead of waiting for the whole run.
    const report = buildLinkReport(
      outcome,
      multi ? { index: index + 1, total: tasks.length } : null,
    );
    try {
      await deliverReport(run, report, outcome.files, recorder);
    } catch (deliverErr) {
      logEventError("browser_agent_report_failed", deliverErr, {
        runId: run.id,
      });
    }
  }

  // Final summary once the whole task is done — only for multi-link runs, where
  // a single wrap-up line ties the per-link reports together. A single link
  // needs none: its report above already was the end-of-task report.
  if (multi) {
    const summary =
      `<b>All links done — ${okCount}/${tasks.length} succeeded` +
      (totalDownloads > 0 ? `, ${totalDownloads} file(s) downloaded.` : ".") +
      `</b>`;
    try {
      await deliverReport(run, summary, [], recorder);
    } catch (deliverErr) {
      logEventError("browser_agent_report_failed", deliverErr, {
        runId: run.id,
      });
    }
  }

  const statusSummary = multi
    ? `${okCount}/${tasks.length} link(s) done`
    : okCount > 0
      ? "done"
      : "no result";
  await setBrowserAgentRunStatus(
    run.id,
    multi || okCount > 0 ? "completed" : "failed",
    { result: statusSummary, stepCount: totalSteps },
  );
  recorder?.complete(okCount > 0 ? "processed" : "error", {
    summary: statusSummary,
  });
  logEvent("browser_agent_completed", {
    runId: run.id,
    links: tasks.length,
    ok: okCount,
    steps: totalSteps,
    downloads: totalDownloads,
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
