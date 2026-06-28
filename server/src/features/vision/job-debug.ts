import {
  createJobStatusStore,
  type JobStatusStore,
} from "../../debug/job-status.js";

let notifyStats: (() => void) | null = null;

/** Wire the sidebar-stats refresh that fires when the job's status changes. */
export function configureVisionJobDebugStats(onUpdate: () => void): void {
  notifyStats = onUpdate;
}

export const visionJobDebug: JobStatusStore = createJobStatusStore(() => {
  notifyStats?.();
});

export function getVisionJobScheduledRunAt(): string | null {
  return visionJobDebug.getScheduledRunAt();
}
