export type ModuleJobStatus = "idle" | "scheduled" | "running";

export type ModuleJobRunStatus =
  | "scheduled"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface ModuleJobStep {
  at: string;
  label: string;
  detail?: Record<string, unknown>;
}

export interface ModuleJobRun {
  id: number;
  status: ModuleJobRunStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  steps: ModuleJobStep[];
}

export interface ModuleJobDebugSnapshot {
  moduleId: string;
  status: ModuleJobStatus;
  currentRun: ModuleJobRun | null;
  recentRuns: ModuleJobRun[];
  lastUpdatedAt: string;
}

export interface ModuleJobDebugStore {
  setStatus: (status: ModuleJobStatus) => void;
  scheduleRun: () => void;
  startRun: () => void;
  addStep: (label: string, detail?: Record<string, unknown>) => void;
  completeRun: () => void;
  failRun: (err: unknown) => void;
  cancelScheduled: () => void;
  snapshot: () => ModuleJobDebugSnapshot;
}

export function createModuleJobDebug(options: {
  moduleId: string;
  maxRuns?: number;
}): ModuleJobDebugStore {
  const maxRuns = options.maxRuns ?? 25;
  let status: ModuleJobStatus = "idle";
  let runSeq = 0;
  let currentRun: ModuleJobRun | null = null;
  const recentRuns: ModuleJobRun[] = [];
  let lastUpdatedAt = new Date().toISOString();

  function touch(): void {
    lastUpdatedAt = new Date().toISOString();
  }

  function pushRun(run: ModuleJobRun): void {
    recentRuns.unshift(run);
    if (recentRuns.length > maxRuns) recentRuns.length = maxRuns;
  }

  function setStatus(next: ModuleJobStatus): void {
    status = next;
    touch();
  }

  function scheduleRun(): void {
    if (currentRun?.status === "scheduled") return;
    runSeq += 1;
    currentRun = {
      id: runSeq,
      status: "scheduled",
      scheduledAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      error: null,
      steps: [],
    };
    setStatus("scheduled");
  }

  function startRun(): void {
    if (!currentRun) {
      runSeq += 1;
      currentRun = {
        id: runSeq,
        status: "running",
        scheduledAt: null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        error: null,
        steps: [],
      };
    } else {
      currentRun.status = "running";
      currentRun.startedAt = new Date().toISOString();
    }
    setStatus("running");
  }

  function addStep(label: string, detail?: Record<string, unknown>): void {
    if (!currentRun) return;
    currentRun.steps.push({
      at: new Date().toISOString(),
      label,
      detail,
    });
    touch();
  }

  function finishRun(runStatus: "completed" | "failed" | "cancelled", error?: string): void {
    if (!currentRun) return;
    currentRun.status = runStatus;
    currentRun.finishedAt = new Date().toISOString();
    if (error) currentRun.error = error;
    pushRun(currentRun);
    currentRun = null;
    setStatus("idle");
  }

  return {
    setStatus,
    scheduleRun,
    startRun,
    addStep,
    completeRun: () => finishRun("completed"),
    failRun: (err: unknown) =>
      finishRun("failed", err instanceof Error ? err.message : String(err)),
    cancelScheduled: () => {
      if (currentRun?.status === "scheduled") {
        finishRun("cancelled");
        return;
      }
      if (status === "scheduled") setStatus("idle");
    },
    snapshot: () => ({
      moduleId: options.moduleId,
      status,
      currentRun,
      recentRuns: [...recentRuns],
      lastUpdatedAt,
    }),
  };
}
