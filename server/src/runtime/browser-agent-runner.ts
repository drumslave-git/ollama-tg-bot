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
  setBrowserAgentDownload,
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
  options: { landInHistory?: boolean; silent?: boolean } = {},
): Promise<void> {
  const bot = getBot();
  const extra: {
    parse_mode: "HTML";
    message_thread_id?: number;
    disable_notification?: boolean;
  } = { parse_mode: "HTML" };
  if (run.messageThreadId != null) extra.message_thread_id = run.messageThreadId;
  if (options.silent) extra.disable_notification = true;

  const chunks = splitTelegramMessage(prepareTelegramHtml(text));
  let firstMessageId: number | undefined;
  for (const chunk of chunks) {
    const sent = await bot.api.sendMessage(run.chatId, chunk, extra);
    firstMessageId ??= sent.message_id;
  }

  const docExtra: { message_thread_id?: number; disable_notification?: boolean } =
    {};
  if (run.messageThreadId != null) docExtra.message_thread_id = run.messageThreadId;
  if (options.silent) docExtra.disable_notification = true;

  for (const file of files) {
    try {
      await bot.api.sendDocument(
        run.chatId,
        new InputFile(file.buffer, file.filename),
        Object.keys(docExtra).length > 0 ? docExtra : undefined,
      );
    } catch (err) {
      logEventError("browser_agent_file_send_failed", err, { runId: run.id });
    }
  }

  // Per-file messages stream out as downloads land but are NOT each recorded —
  // the end-of-run recap carries the full list into history (landInHistory).
  if (options.landInHistory ?? true) {
    await appendAssistantMessage(run.entityId, text, { messageId: firstMessageId });
    await recordReply(false);
  }
  recorder?.okPhase(
    "deliver",
    "Delivered",
    `${chunks.length} chunk(s) · ${files.length} file(s)`,
  );
}

/** Report ONE finished download to the chat the moment it lands: the small file
 * as an attachment, a large one as a text line (name / size / source). Wired to
 * the agent's onDownload so every file is reported as it downloads, uniformly
 * for single- and multi-link runs. Sent silently (disable_notification) — these
 * are intermediate progress messages; the end-of-run recap notifies normally.
 * Never recorded individually — the recap does. */
async function deliverDownload(
  run: BrowserAgentRun,
  record: DownloadRecord,
  file: CollectedFile | null,
  recorder: ProcessingRecorder | null,
): Promise<void> {
  try {
    await deliverReport(
      run,
      formatDownloadReport([record]),
      file ? [file] : [],
      recorder,
      { landInHistory: false, silent: true },
    );
  } catch (err) {
    logEventError("browser_agent_file_send_failed", err, { runId: run.id });
  }
}

/** What one link (or the whole goal) produced. Downloaded files are reported to
 * the chat as they land (see deliverDownload); this only carries what the
 * end-of-link message and the end-of-run recap still need. */
interface LinkOutcome {
  ok: boolean;
  steps: number;
  downloads: DownloadRecord[];
  /** Prose shown for this link ONLY when it produced no download (a research
   * answer or a failure) — downloaded files report themselves as they land. */
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
      onDownload: (record, file) =>
        deliverDownload(run, record, file, recorder),
      onDownloadProgress: (progress) => setBrowserAgentDownload(progress),
    });
    const hasDownload = result.downloads.length > 0;
    if (result.loopDetected) {
      recorder?.failPhase(
        "agent",
        "Agent run",
        "Stopped: repeated the same steps without progress",
      );
    }
    // Downloaded files already reported themselves as they landed, so a link
    // that produced downloads carries no prose note.
    const note = hasDownload
      ? ""
      : result.loopDetected
        ? result.report ||
          "I kept repeating the same steps without making progress, so I stopped."
        : result.report;
    return {
      ok: hasDownload || (!result.loopDetected && Boolean(result.report)),
      steps: result.steps,
      downloads: result.downloads,
      note,
    };
  } catch (err) {
    logEventError("browser_agent_failed", err, { runId: run.id });
    recorder?.failPhase("agent", "Agent run", errorMessage(err));
    return {
      ok: false,
      steps: 0,
      downloads: [],
      note: "I hit a problem while browsing and had to stop.",
    };
  } finally {
    await session.close();
  }
}

/** The message a link posts once it finishes. Downloaded files already reported
 * themselves as they landed, so this is only the prose (a research answer or a
 * failure), or a "found nothing" fallback when the link produced neither files
 * nor prose — so every link still says something. Empty = post nothing. */
function buildLinkMessage(
  outcome: LinkOutcome,
  position: { index: number; total: number } | null,
): string {
  const prose = outcome.note.trim();
  const body =
    prose ||
    (outcome.downloads.length === 0
      ? "I browsed but couldn't find anything useful."
      : "");
  if (!body) return "";
  return position
    ? `<b>Link ${position.index}/${position.total}</b>\n\n${body}`
    : body;
}

async function runOne(run: BrowserAgentRun): Promise<void> {
  await setBrowserAgentRunStatus(run.id, "running");
  await refreshCounts();

  const recorder = await beginBrowserAgentProcessing(run.id);
  recorder?.note("Goal", run.goal);

  // Multiple links → process one by one, each with its OWN fresh session. Every
  // downloaded file reports itself to the chat as it lands (deliverDownload),
  // uniformly for single- and multi-link runs; a link only posts a message here
  // for prose (a research answer or a failure).
  const tasks = planGoalLinks(run.goal);
  const multi = tasks.length > 1;
  let okCount = 0;
  let totalSteps = 0;
  const allDownloads: DownloadRecord[] = [];

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
    allDownloads.push(...outcome.downloads);

    const message = buildLinkMessage(
      outcome,
      multi ? { index: index + 1, total: tasks.length } : null,
    );
    if (message) {
      try {
        await deliverReport(run, message, [], recorder);
      } catch (deliverErr) {
        logEventError("browser_agent_report_failed", deliverErr, {
          runId: run.id,
        });
      }
    }
  }

  // Unified end-of-run recap: the full list of files downloaded this run (each
  // was already reported as it landed), plus a link-tally line for multi-link
  // runs. This is the one message that lands the file list in history.
  const recapSections: string[] = [];
  if (multi) {
    recapSections.push(
      `<b>All links done — ${okCount}/${tasks.length} succeeded.</b>`,
    );
  }
  if (allDownloads.length > 0) {
    recapSections.push(formatDownloadReport(allDownloads));
  }
  if (recapSections.length > 0) {
    try {
      await deliverReport(run, recapSections.join("\n\n"), [], recorder);
    } catch (deliverErr) {
      logEventError("browser_agent_report_failed", deliverErr, {
        runId: run.id,
      });
    }
  }

  const totalDownloads = allDownloads.length;

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
