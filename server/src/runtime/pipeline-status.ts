export type BackgroundJobStatus = "idle" | "scheduled" | "running";

export interface PipelineRuntimeStatus {
  queueSize: number;
  memoryJobStatus: BackgroundJobStatus;
  visionJobStatus: BackgroundJobStatus;
}

let queueSize = 0;
let memoryJobStatus: BackgroundJobStatus = "idle";
let visionJobStatus: BackgroundJobStatus = "idle";

export function getPipelineRuntimeStatus(): PipelineRuntimeStatus {
  return { queueSize, memoryJobStatus, visionJobStatus };
}

export function setQueueSize(size: number): void {
  queueSize = Math.max(0, size);
  notifyPipelineStatusChanged();
}

export function setMemoryJobStatus(status: BackgroundJobStatus): void {
  memoryJobStatus = status;
  notifyPipelineStatusChanged();
}

export function setVisionJobStatus(status: BackgroundJobStatus): void {
  visionJobStatus = status;
  notifyPipelineStatusChanged();
}

function notifyPipelineStatusChanged(): void {
  void import("../dashboard/live-events.js").then(({ emitStatsUpdated }) => {
    emitStatsUpdated();
  });
}
