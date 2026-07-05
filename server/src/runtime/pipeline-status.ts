export type BackgroundJobStatus = "idle" | "scheduled" | "running";
export type BrowserAgentStatus = "idle" | "running";

export interface PipelineRuntimeStatus {
  queueSize: number;
  historyPointer: string | null;
  memoryJobStatus: BackgroundJobStatus;
  memoryJobRunAt: string | null;
  visionJobStatus: BackgroundJobStatus;
  visionJobRunAt: string | null;
  browserAgentStatus: BrowserAgentStatus;
  browserAgentGoal: string | null;
  browserAgentUrl: string | null;
  browserAgentStep: number;
  browserAgentAction: string | null;
  browserAgentRunning: number;
  browserAgentQueued: number;
}

let queueSize = 0;
let historyPointer: string | null = null;
let memoryJobStatus: BackgroundJobStatus = "idle";
let memoryJobRunAt: string | null = null;
let visionJobStatus: BackgroundJobStatus = "idle";
let visionJobRunAt: string | null = null;
let browserAgentGoal: string | null = null;
let browserAgentUrl: string | null = null;
let browserAgentStep = 0;
let browserAgentAction: string | null = null;
let browserAgentRunning = 0;
let browserAgentQueued = 0;

export function getPipelineRuntimeStatus(): PipelineRuntimeStatus {
  return {
    queueSize,
    historyPointer,
    memoryJobStatus,
    memoryJobRunAt,
    visionJobStatus,
    visionJobRunAt,
    browserAgentStatus: browserAgentRunning > 0 ? "running" : "idle",
    browserAgentGoal,
    browserAgentUrl,
    browserAgentStep,
    browserAgentAction,
    browserAgentRunning,
    browserAgentQueued,
  };
}

/** Snapshot the active run's goal/step/URL for the live dashboard card. */
export function setBrowserAgentActivity(
  goal: string | null,
  step: number,
  action: string | null,
  url: string | null,
): void {
  browserAgentGoal = goal;
  browserAgentStep = step;
  browserAgentAction = action;
  browserAgentUrl = url;
  notifyPipelineStatusChanged();
}

/** Update the running / queued run counts. */
export function setBrowserAgentCounts(running: number, queued: number): void {
  browserAgentRunning = Math.max(0, running);
  browserAgentQueued = Math.max(0, queued);
  if (browserAgentRunning === 0) {
    browserAgentGoal = null;
    browserAgentUrl = null;
    browserAgentAction = null;
    browserAgentStep = 0;
  }
  notifyPipelineStatusChanged();
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
