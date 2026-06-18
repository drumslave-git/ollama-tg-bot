import {
  createVisionJobDebug,
  type VisionJobDebugSnapshot,
  type VisionJobDebugStore,
} from "./job-report.js";

let notifyStats: (() => void) | null = null;

let pendingBackfillStats: (() => {
  pendingMediaRows: number;
  chatsWithPending: number;
}) | null = null;

export function configureVisionJobDebugStats(
  provider: () => { pendingMediaRows: number; chatsWithPending: number },
  onUpdate?: () => void,
): void {
  pendingBackfillStats = provider;
  if (onUpdate) notifyStats = onUpdate;
}

export const visionJobDebug: VisionJobDebugStore = createVisionJobDebug({
  moduleId: "vision",
  maxRuns: 30,
  onUpdate: () => {
    notifyStats?.();
  },
});

export function getVisionJobDebugSnapshot(): VisionJobDebugSnapshot {
  const pending = pendingBackfillStats?.() ?? {
    pendingMediaRows: 0,
    chatsWithPending: 0,
  };
  return visionJobDebug.snapshot(pending);
}

export function getVisionJobRunDetail(id: number) {
  return visionJobDebug.getRunDetail(id);
}

export function getVisionJobScheduledRunAt(): string | null {
  return visionJobDebug.getScheduledRunAt();
}

export {
  createVisionJobDebug,
  type VisionJobDebugSnapshot,
  type VisionJobRunDetail,
  type VisionJobRunListItem,
  type VisionJobDebugStore,
} from "./job-report.js";
