import { type ProcessingSink, ProcessingRecorder } from "./processing-recorder.js";
import {
  appendBrowserAgentEntry,
  createBrowserAgentProcessing,
  setBrowserAgentProcessingStatus,
} from "../db/debug/browser-agent-processing.js";

/** Writes the browser-agent domain's processing entries via the shared recorder. */
const browserAgentSink: ProcessingSink = {
  // The processing row is created up front in beginBrowserAgentProcessing.
  ensure: async () => {},
  report: (processingId, title, type, content) =>
    appendBrowserAgentEntry(processingId, title, type, content),
  setStatus: (processingId, status, { totalTimeSpentMs, tokens, extra }) =>
    setBrowserAgentProcessingStatus(processingId, status, {
      totalTimeSpentMs,
      tokens,
      summary: (extra as { summary?: string } | undefined)?.summary,
    }),
};

/**
 * Open a debug recorder for one browsing run. Its `traceId` routes the agent
 * loop's LLM request/response entries here, and `complete(status, { summary })`
 * finalizes the run.
 */
export async function beginBrowserAgentProcessing(
  runId: number,
): Promise<ProcessingRecorder | null> {
  try {
    const processingId = await createBrowserAgentProcessing(runId);
    if (processingId == null) return null;
    const recorder = new ProcessingRecorder(browserAgentSink, undefined, "browser");
    recorder.link(processingId);
    return recorder;
  } catch {
    return null;
  }
}
