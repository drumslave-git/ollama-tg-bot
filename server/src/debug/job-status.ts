/**
 * Lightweight live status for a scheduled background job (memory/vision backfill),
 * read by the dashboard sidebar. Run *history* is persisted separately as
 * `job_processings` via the shared {@link ProcessingRecorder} — this only tracks
 * the transient idle/scheduled/running state and the next scheduled run time.
 */
export type JobRunStatus = "idle" | "scheduled" | "running";

export interface JobStatusStore {
  setStatus: (status: JobRunStatus) => void;
  scheduleRun: (runAt: Date) => void;
  cancelScheduled: () => void;
  getScheduledRunAt: () => string | null;
  getStatus: () => JobRunStatus;
}

export function createJobStatusStore(onUpdate?: () => void): JobStatusStore {
  let status: JobRunStatus = "idle";
  let scheduledRunAt: string | null = null;
  const touch = () => onUpdate?.();

  return {
    setStatus(next) {
      status = next;
      if (next !== "scheduled") scheduledRunAt = null;
      touch();
    },
    scheduleRun(runAt) {
      status = "scheduled";
      scheduledRunAt = runAt.toISOString();
      touch();
    },
    cancelScheduled() {
      status = "idle";
      scheduledRunAt = null;
      touch();
    },
    getScheduledRunAt() {
      return scheduledRunAt;
    },
    getStatus() {
      return status;
    },
  };
}
