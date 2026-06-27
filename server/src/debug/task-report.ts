import { type ProcessingSink, ProcessingRecorder } from "./processing-recorder.js";
import {
  appendTaskEntry,
  createTaskProcessing,
  setTaskProcessingStatus,
} from "../db/debug/task-processing.js";

/** Writes the task domain's processing entries via the shared recorder. */
const taskSink: ProcessingSink = {
  // The processing row is created up front in beginTaskProcessing.
  ensure: async () => {},
  report: (processingId, title, type, content) =>
    appendTaskEntry(processingId, title, type, content),
  setStatus: (processingId, status, { totalTimeSpentMs, extra }) =>
    setTaskProcessingStatus(processingId, status, {
      totalTimeSpentMs,
      summary: (extra as { summary?: string } | undefined)?.summary,
    }),
};

/**
 * Open a debug recorder for one task fire. Returns the shared
 * {@link ProcessingRecorder}; its `traceId` routes LLM request/response entries
 * here, and `complete(status, { summary })` finalizes the fire.
 */
export async function beginTaskProcessing(
  taskId: number,
): Promise<ProcessingRecorder | null> {
  const processingId = await createTaskProcessing(taskId);
  if (processingId == null) return null;
  const recorder = new ProcessingRecorder(taskSink);
  recorder.link(processingId);
  return recorder;
}
