import type { VisionChatMessage } from "./types.js";

export type VisionJobStoreStatus = "idle" | "scheduled" | "running";

export type VisionJobRunStatus =
  | "scheduled"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type PhaseStatus = "skipped" | "ok" | "failed" | "waiting";

export interface ReportDetailFields {
  type: "fields";
  fields: Array<{ label: string; value: string }>;
}

export interface ReportDetailText {
  type: "text";
  title: string;
  body: string;
}

export interface ReportDetailLlm {
  type: "llm";
  model: string;
  sampling?: string;
  requestBody?: unknown;
  responseBody?: unknown;
  sections: Array<{ title: string; body: string }>;
  output: {
    content: string;
    reasoning?: string;
    meta?: string;
  };
}

export type ReportDetail = ReportDetailFields | ReportDetailText | ReportDetailLlm;

export interface ReportPhase {
  id: string;
  title: string;
  status: PhaseStatus;
  durationMs?: number;
  summary: string;
  detail?: ReportDetail;
}

export interface VisionJobReportRecord {
  status: VisionJobRunStatus;
  headline: string;
  durationMs: number;
  chatsScanned: number;
  mediaBackfilled: number;
  mediaFailed: number;
  interrupted: boolean;
  phases: ReportPhase[];
  error?: string;
}

export interface VisionJobRunListItem {
  id: number;
  status: VisionJobRunStatus;
  headline: string;
  createdAt: string;
  runAt: string | null;
  durationMs: number | null;
  mediaBackfilled: number;
  mediaFailed: number;
}

export interface VisionJobRunDetail {
  id: number;
  status: VisionJobRunStatus;
  createdAt: string;
  scheduledAt: string | null;
  runAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  report: VisionJobReportRecord;
}

export interface VisionJobDebugSnapshot {
  moduleId: string;
  status: VisionJobStoreStatus;
  scheduledRunAt: string | null;
  currentRun: VisionJobRunDetail | null;
  recentRuns: VisionJobRunListItem[];
  lastUpdatedAt: string;
  pendingMediaRows: number;
  chatsWithPending: number;
}

type NotifyFn = () => void;

const LLM_TITLES: Record<string, string> = {
  "vision describe (backfill)": "Vision describe",
};

function llmPhaseId(label: string, seq: number): string {
  const base = label.replace(/\s+/g, "-").toLowerCase();
  return `llm-${base}-${seq}`;
}

function formatVisionMessageBody(message: VisionChatMessage): string {
  const imageNote =
    message.images && message.images.length > 0
      ? `\n[${message.images.length} image(s)]`
      : "";
  return `${message.content}${imageNote}`;
}

class VisionJobRunSession {
  readonly id: number;
  readonly createdAt: string;
  scheduledAt: string | null = null;
  runAt: string | null = null;
  startedAt: string | null = null;
  finishedAt: string | null = null;
  status: VisionJobRunStatus = "scheduled";
  private readonly startedPerf = performance.now();
  private phases: ReportPhase[] = [];
  private chatsScanned = 0;
  private mediaBackfilled = 0;
  private mediaFailed = 0;
  private interrupted = false;
  private error: string | undefined;
  private llmSeq = 0;
  private mediaSeq = 0;
  private readonly onTouch: NotifyFn;

  constructor(id: number, onTouch: NotifyFn) {
    this.id = id;
    this.createdAt = new Date().toISOString();
    this.onTouch = onTouch;
  }

  schedule(runAt: Date): void {
    this.scheduledAt = new Date().toISOString();
    this.runAt = runAt.toISOString();
    this.status = "scheduled";
    this.touch();
  }

  start(): void {
    this.status = "running";
    this.startedAt = new Date().toISOString();
    this.touch();
  }

  setScanSummary(chatCount: number): void {
    this.chatsScanned = chatCount;
    this.okPhase("scan", "Scan chats", `Found ${chatCount} recent chat(s)`, undefined, {
      type: "fields",
      fields: [{ label: "Chats scanned", value: String(chatCount) }],
    });
  }

  recordBackfill(
    convKey: string,
    mediaKind: string,
    descriptionChars: number,
  ): void {
    this.mediaBackfilled += 1;
    this.mediaSeq += 1;
    this.okPhase(
      `media-${this.mediaSeq}-${convKey}-backfill`,
      `Backfill ${mediaKind}`,
      `${convKey} · ${descriptionChars} chars`,
      undefined,
      {
        type: "fields",
        fields: [
          { label: "Chat", value: convKey },
          { label: "Media", value: mediaKind },
          { label: "Description chars", value: String(descriptionChars) },
        ],
      },
    );
    this.touch();
  }

  recordDescribeFailed(convKey: string, mediaKind: string): void {
    this.mediaFailed += 1;
    this.mediaSeq += 1;
    this.failPhase(
      `media-${this.mediaSeq}-${convKey}-failed`,
      `Describe ${mediaKind}`,
      `${convKey} · vision describe returned no result`,
    );
    this.touch();
  }

  markInterrupted(): void {
    this.interrupted = true;
    this.failPhase("interrupted", "Interrupted", "Queue activity resumed");
    this.touch();
  }

  okPhase(
    id: string,
    title: string,
    summary: string,
    durationMs?: number,
    detail?: ReportDetail,
  ): void {
    this.phases.push({
      id,
      title,
      status: "ok",
      summary,
      ...(durationMs != null ? { durationMs: Math.round(durationMs) } : {}),
      ...(detail ? { detail } : {}),
    });
    this.touch();
  }

  failPhase(
    id: string,
    title: string,
    summary: string,
    durationMs?: number,
  ): void {
    this.phases.push({
      id,
      title,
      status: "failed",
      summary,
      ...(durationMs != null ? { durationMs: Math.round(durationMs) } : {}),
    });
    this.touch();
  }

  beginLlmWait(label: string, model: string, timeoutSec: number): string {
    const seq = ++this.llmSeq;
    const id = llmPhaseId(label, seq);
    const title = LLM_TITLES[label] ?? label;
    this.phases.push({
      id,
      title,
      status: "waiting",
      summary: `Waiting for LLM · ${model} · up to ${timeoutSec}s`,
    });
    this.touch();
    return id;
  }

  recordLlmOk(
    phaseId: string,
    label: string,
    model: string,
    messages: VisionChatMessage[],
    raw: string,
    durationMs: number,
  ): void {
    const title = LLM_TITLES[label] ?? label;
    const sections = messages.map((message, index) => ({
      title: `Message ${index + 1} (${message.role})`,
      body: formatVisionMessageBody(message),
    }));
    this.upsertPhase({
      id: phaseId,
      title,
      status: "ok",
      summary: "LLM response received",
      durationMs: Math.round(durationMs),
      detail: {
        type: "llm",
        model,
        sections,
        output: { content: raw },
      },
    });
    this.touch();
  }

  failLlm(phaseId: string, label: string, err: unknown, durationMs: number): void {
    const title = LLM_TITLES[label] ?? label;
    const summary = err instanceof Error ? err.message : String(err);
    this.upsertPhase({
      id: phaseId,
      title,
      status: "failed",
      summary,
      durationMs: Math.round(durationMs),
    });
    this.touch();
  }

  private upsertPhase(phase: ReportPhase): void {
    const idx = this.phases.findIndex((entry) => entry.id === phase.id);
    if (idx >= 0) this.phases[idx] = phase;
    else this.phases.push(phase);
  }

  finish(status: "completed" | "failed" | "cancelled", error?: string): void {
    this.status = status;
    this.finishedAt = new Date().toISOString();
    this.error = error;
    this.touch();
  }

  toDetail(): VisionJobRunDetail {
    const durationMs = Math.round(performance.now() - this.startedPerf);
    const headline = this.buildHeadline();
    return {
      id: this.id,
      status: this.status,
      createdAt: this.createdAt,
      scheduledAt: this.scheduledAt,
      runAt: this.runAt,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      report: {
        status: this.status,
        headline,
        durationMs,
        chatsScanned: this.chatsScanned,
        mediaBackfilled: this.mediaBackfilled,
        mediaFailed: this.mediaFailed,
        interrupted: this.interrupted,
        phases: [...this.phases],
        ...(this.error ? { error: this.error } : {}),
      },
    };
  }

  toListItem(): VisionJobRunListItem {
    const detail = this.toDetail();
    return {
      id: detail.id,
      status: detail.status,
      headline: detail.report.headline,
      createdAt: detail.createdAt,
      runAt: detail.runAt,
      durationMs:
        detail.finishedAt != null ? detail.report.durationMs : null,
      mediaBackfilled: detail.report.mediaBackfilled,
      mediaFailed: detail.report.mediaFailed,
    };
  }

  private buildHeadline(): string {
    if (this.status === "scheduled") return "Vision backfill scheduled";
    if (this.status === "running") return "Vision backfill running";
    if (this.status === "cancelled") return "Vision backfill cancelled";
    if (this.status === "failed") {
      return this.error
        ? `Vision backfill failed: ${this.error}`
        : "Vision backfill failed";
    }
    const parts = [
      `${this.mediaBackfilled} backfilled`,
      this.mediaFailed > 0 ? `${this.mediaFailed} failed` : null,
      this.interrupted ? "interrupted" : null,
    ].filter(Boolean);
    return `Vision backfill done · ${parts.join(", ")}`;
  }

  private touch(): void {
    this.onTouch();
  }
}

export interface VisionJobDebugStore {
  setStatus: (status: VisionJobStoreStatus) => void;
  scheduleRun: (runAt: Date) => void;
  startRun: () => VisionJobRunSession;
  getCurrentSession: () => VisionJobRunSession | null;
  completeRun: () => void;
  failRun: (err: unknown) => void;
  cancelScheduled: () => void;
  getScheduledRunAt: () => string | null;
  snapshot: (pending: {
    pendingMediaRows: number;
    chatsWithPending: number;
  }) => VisionJobDebugSnapshot;
  getRunDetail: (id: number) => VisionJobRunDetail | null;
  wrapChatComplete: (
    label: string,
    model: string,
    timeoutSec: number,
    base: (
      messages: VisionChatMessage[],
      options: {
        numPredict: number;
        auxiliary: boolean;
        traceTurnId?: number;
        traceLabel?: string;
      },
    ) => Promise<string>,
  ) => (
    messages: VisionChatMessage[],
    options: {
      numPredict: number;
      auxiliary: boolean;
      traceTurnId?: number;
      traceLabel?: string;
    },
  ) => Promise<string>;
}

export function createVisionJobDebug(options: {
  moduleId: string;
  maxRuns?: number;
  onUpdate?: NotifyFn;
}): VisionJobDebugStore {
  const maxRuns = options.maxRuns ?? 30;
  let status: VisionJobStoreStatus = "idle";
  let runSeq = 0;
  let currentSession: VisionJobRunSession | null = null;
  let scheduledRunAt: string | null = null;
  const recentRuns: VisionJobRunListItem[] = [];
  const runDetails = new Map<number, VisionJobRunDetail>();
  let lastUpdatedAt = new Date().toISOString();

  function touch(): void {
    lastUpdatedAt = new Date().toISOString();
    options.onUpdate?.();
  }

  function pushRun(detail: VisionJobRunDetail): void {
    runDetails.set(detail.id, detail);
    recentRuns.unshift(detailToListItem(detail));
    if (recentRuns.length > maxRuns) {
      const removed = recentRuns.splice(maxRuns);
      for (const item of removed) runDetails.delete(item.id);
    }
  }

  function detailToListItem(detail: VisionJobRunDetail): VisionJobRunListItem {
    return {
      id: detail.id,
      status: detail.status,
      headline: detail.report.headline,
      createdAt: detail.createdAt,
      runAt: detail.runAt,
      durationMs:
        detail.finishedAt != null ? detail.report.durationMs : null,
      mediaBackfilled: detail.report.mediaBackfilled,
      mediaFailed: detail.report.mediaFailed,
    };
  }

  return {
    setStatus(next) {
      status = next;
      if (next !== "scheduled") scheduledRunAt = null;
      touch();
    },

    scheduleRun(runAt) {
      if (currentSession?.status === "scheduled") return;
      runSeq += 1;
      currentSession = new VisionJobRunSession(runSeq, touch);
      currentSession.schedule(runAt);
      scheduledRunAt = runAt.toISOString();
      status = "scheduled";
      touch();
    },

    startRun() {
      if (!currentSession) {
        runSeq += 1;
        currentSession = new VisionJobRunSession(runSeq, touch);
      }
      currentSession.start();
      scheduledRunAt = null;
      status = "running";
      touch();
      return currentSession;
    },

    getCurrentSession() {
      return currentSession;
    },

    completeRun() {
      if (!currentSession) return;
      currentSession.finish("completed");
      const detail = currentSession.toDetail();
      pushRun(detail);
      currentSession = null;
      status = "idle";
      scheduledRunAt = null;
      touch();
    },

    failRun(err) {
      if (!currentSession) return;
      const message = err instanceof Error ? err.message : String(err);
      currentSession.finish("failed", message);
      const detail = currentSession.toDetail();
      pushRun(detail);
      currentSession = null;
      status = "idle";
      scheduledRunAt = null;
      touch();
    },

    cancelScheduled() {
      if (currentSession?.status === "scheduled") {
        currentSession.finish("cancelled");
        pushRun(currentSession.toDetail());
        currentSession = null;
      }
      status = "idle";
      scheduledRunAt = null;
      touch();
    },

    getScheduledRunAt() {
      return scheduledRunAt;
    },

    snapshot(pending) {
      return {
        moduleId: options.moduleId,
        status,
        scheduledRunAt,
        currentRun: currentSession?.toDetail() ?? null,
        recentRuns: [...recentRuns],
        lastUpdatedAt,
        ...pending,
      };
    },

    getRunDetail(id) {
      if (currentSession?.id === id) return currentSession.toDetail();
      return runDetails.get(id) ?? null;
    },

    wrapChatComplete(label, model, timeoutSec, base) {
      return async (messages, options) => {
        const session = currentSession;
        if (!session) return base(messages, options);
        const phaseId = session.beginLlmWait(label, model, timeoutSec);
        const started = performance.now();
        try {
          const raw = await base(messages, options);
          session.recordLlmOk(
            phaseId,
            label,
            model,
            messages,
            raw,
            performance.now() - started,
          );
          return raw;
        } catch (err) {
          session.failLlm(phaseId, label, err, performance.now() - started);
          throw err;
        }
      };
    },
  };
}
