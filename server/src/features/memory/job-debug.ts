import { createMemoryJobDebug, type MemoryJobDebugStore } from "./job-report.js";

let notifyStats: (() => void) | null = null;

export function configureMemoryJobDebugStats(onUpdate: () => void): void {
  notifyStats = onUpdate;
}

export const memoryJobDebug: MemoryJobDebugStore = createMemoryJobDebug({
  moduleId: "memory",
  maxRuns: 30,
  onUpdate: () => {
    notifyStats?.();
  },
});

export function getMemoryJobDebugSnapshot() {
  return memoryJobDebug.snapshot();
}

export function getMemoryJobRunDetail(id: number) {
  return memoryJobDebug.getRunDetail(id);
}

export function getMemoryJobScheduledRunAt(): string | null {
  return memoryJobDebug.getScheduledRunAt();
}

export {
  createMemoryJobDebug,
  type MemoryJobDebugSnapshot,
  type MemoryJobRunDetail,
  type MemoryJobRunListItem,
  type MemoryJobDebugStore,
} from "./job-report.js";
