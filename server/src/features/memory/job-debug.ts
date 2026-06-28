import {
  createJobStatusStore,
  type JobStatusStore,
} from "../../debug/job-status.js";

let notifyStats: (() => void) | null = null;

/** Wire the sidebar-stats refresh that fires when the job's status changes. */
export function configureMemoryJobDebugStats(onUpdate: () => void): void {
  notifyStats = onUpdate;
}

export const memoryJobDebug: JobStatusStore = createJobStatusStore(() => {
  notifyStats?.();
});

export function getMemoryJobScheduledRunAt(): string | null {
  return memoryJobDebug.getScheduledRunAt();
}
