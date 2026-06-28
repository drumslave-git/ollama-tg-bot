import { type ProcessingSink, ProcessingRecorder } from "./processing-recorder.js";
import {
  appendJobEntry,
  createJobProcessing,
  setJobProcessingStatus,
} from "../db/debug/job-processing.js";

/** Writes a background job's processing entries via the shared recorder. */
const jobSink: ProcessingSink = {
  // The processing row is created up front in beginJobProcessing.
  ensure: async () => {},
  report: (processingId, title, type, content) =>
    appendJobEntry(processingId, title, type, content),
  setStatus: (processingId, status, { totalTimeSpentMs, extra }) =>
    setJobProcessingStatus(processingId, status, {
      totalTimeSpentMs,
      summary: (extra as { summary?: string } | undefined)?.summary,
    }),
};

/**
 * Open a debug recorder for one scheduled-job run (e.g. memory/vision backfill).
 * Its `traceId` routes LLM request/response entries here, and
 * `complete(status, { summary })` finalizes the run.
 */
export async function beginJobProcessing(
  featureId: string,
): Promise<ProcessingRecorder | null> {
  try {
    const processingId = await createJobProcessing(featureId);
    if (processingId == null) return null;
    const recorder = new ProcessingRecorder(jobSink);
    recorder.link(processingId);
    return recorder;
  } catch {
    // Debug recording must never break the job (e.g. DB unavailable).
    return null;
  }
}
