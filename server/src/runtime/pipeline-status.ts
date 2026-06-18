export type BackgroundJobStatus = "idle" | "scheduled" | "running";

export interface PipelineRuntimeStatus {
  queueSize: number;
  historyPointer: string | null;
  memoryJobStatus: BackgroundJobStatus;
  memoryJobRunAt: string | null;
  visionJobStatus: BackgroundJobStatus;
  visionJobRunAt: string | null;
}

let queueSize = 0;
let historyPointer: string | null = null;
let memoryJobStatus: BackgroundJobStatus = "idle";
let memoryJobRunAt: string | null = null;
let visionJobStatus: BackgroundJobStatus = "idle";
let visionJobRunAt: string | null = null;

export function getPipelineRuntimeStatus(): PipelineRuntimeStatus {
  return {
    queueSize,
    historyPointer,
    memoryJobStatus,
    memoryJobRunAt,
    visionJobStatus,
    visionJobRunAt,
  };
}

export function setQueueSize(size: number): void {
  queueSize = Math.max(0, size);
  notifyPipelineStatusChanged();
}

export function setHistoryPointer(pointer: string | null): void {
  historyPointer = pointer;
  notifyPipelineStatusChanged();
}

export function setMemoryJobStatus(status: BackgroundJobStatus): void {
  memoryJobStatus = status;
  if (status !== "scheduled") memoryJobRunAt = null;
  notifyPipelineStatusChanged();
}

export function setMemoryJobRunAt(runAt: string | null): void {
  memoryJobRunAt = runAt;
  notifyPipelineStatusChanged();
}

export function setVisionJobStatus(status: BackgroundJobStatus): void {
  visionJobStatus = status;
  if (status !== "scheduled") visionJobRunAt = null;
  notifyPipelineStatusChanged();
}

export function setVisionJobRunAt(runAt: string | null): void {
  visionJobRunAt = runAt;
  notifyPipelineStatusChanged();
}

function notifyPipelineStatusChanged(): void {
  void import("../dashboard/live-events.js").then(({ emitStatsUpdated }) => {
    emitStatsUpdated();
  });
}
