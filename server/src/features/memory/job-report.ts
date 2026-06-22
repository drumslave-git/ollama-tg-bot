import type { ChatMessage } from "../../shared/index.js";

export type MemoryJobStoreStatus = "idle" | "scheduled" | "running";

export type MemoryJobRunStatus =
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

export interface MemoryJobReportRecord {
  status: MemoryJobRunStatus;
  headline: string;
  durationMs: number;
  chatsScanned: number;
  chatsProcessed: number;
  chatsSkipped: number;
  interrupted: boolean;
  phases: ReportPhase[];
  error?: string;
}

export interface MemoryJobRunListItem {
  id: number;
  status: MemoryJobRunStatus;
  headline: string;
  createdAt: string;
  runAt: string | null;
  durationMs: number | null;
  chatsProcessed: number;
  chatsSkipped: number;
}

export interface MemoryJobRunDetail {
  id: number;
  status: MemoryJobRunStatus;
  createdAt: string;
  scheduledAt: string | null;
  runAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  report: MemoryJobReportRecord;
}

export interface MemoryJobDebugSnapshot {
  moduleId: string;
  status: MemoryJobStoreStatus;
  scheduledRunAt: string | null;
  currentRun: MemoryJobRunDetail | null;
  recentRuns: MemoryJobRunListItem[];
  lastUpdatedAt: string;
}

type NotifyFn = () => void;

const LLM_TITLES: Record<string, string> = {
  "memory extract (debounced)": "Memory extraction",
  "memory merge (debounced)": "Memory merge",
};

function llmPhaseId(label: string, seq: number): string {
  const base = label.replace(/\s+/g, "-").toLowerCase();
  return `llm-${base}-${seq}`;
}

class MemoryJobRunSession {
  readonly id: number;
  readonly createdAt: string;
  scheduledAt: string | null = null;
  runAt: string | null = null;
  startedAt: string | null = null;
  finishedAt: string | null = null;
  status: MemoryJobRunStatus = "scheduled";
  private readonly startedPerf = performance.now();
  private phases: ReportPhase[] = [];
  private chatsScanned = 0;
  private chatsProcessed = 0;
  private chatsSkipped = 0;
  private interrupted = false;
  private error: string | undefined;
  private llmSeq = 0;
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

  skipChat(convKey: string, reason: string): void {
    this.chatsSkipped += 1;
    this.skipPhase(
      `chat-${this.chatsSkipped + this.chatsProcessed}-${convKey}`,
      `Chat ${convKey}`,
      reason,
    );
    this.touch();
  }

  beginChat(convKey: string, inputPreview: string): void {
    this.okPhase(
      `chat-${this.chatsProcessed + this.chatsSkipped + 1}-${convKey}-input`,
      `Chat ${convKey}`,
      "Processing extraction input",
      undefined,
      {
        type: "text",
        title: "Extraction input",
        body: inputPreview,
      },
    );
    this.touch();
  }

  completeChat(
    convKey: string,
    updated: boolean,
    scopes: string[],
  ): void {
    this.chatsProcessed += 1;
    this.okPhase(
      `chat-${this.chatsProcessed}-${convKey}-result`,
      `Chat ${convKey} result`,
      updated
        ? `Updated (${scopes.join(", ") || "yes"})`
        : "No memory changes",
      undefined,
      {
        type: "fields",
        fields: [
          { label: "Updated", value: updated ? "yes" : "no" },
          { label: "Scopes", value: scopes.length > 0 ? scopes.join(", ") : "—" },
        ],
      },
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

  skipPhase(id: string, title: string, summary: string): void {
    this.phases.push({ id, title, status: "skipped", summary });
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
    messages: ChatMessage[],
    raw: string,
    durationMs: number,
  ): void {
    const title = LLM_TITLES[label] ?? label;
    const sections = messages.map((message, index) => ({
      title: `Message ${index + 1} (${message.role})`,
      body: message.content,
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

  toDetail(): MemoryJobRunDetail {
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
        chatsProcessed: this.chatsProcessed,
        chatsSkipped: this.chatsSkipped,
        interrupted: this.interrupted,
        phases: [...this.phases],
        ...(this.error ? { error: this.error } : {}),
      },
    };
  }

  toListItem(): MemoryJobRunListItem {
    const detail = this.toDetail();
    return {
      id: detail.id,
      status: detail.status,
      headline: detail.report.headline,
      createdAt: detail.createdAt,
      runAt: detail.runAt,
      durationMs:
        detail.finishedAt != null ? detail.report.durationMs : null,
      chatsProcessed: detail.report.chatsProcessed,
      chatsSkipped: detail.report.chatsSkipped,
    };
  }

  private buildHeadline(): string {
    if (this.status === "scheduled") return "Memory job scheduled";
    if (this.status === "running") return "Memory extraction running";
    if (this.status === "cancelled") return "Memory job cancelled";
    if (this.status === "failed") {
      return this.error ? `Memory job failed: ${this.error}` : "Memory job failed";
    }
    const parts = [
      `${this.chatsProcessed} processed`,
      this.chatsSkipped > 0 ? `${this.chatsSkipped} skipped` : null,
      this.interrupted ? "interrupted" : null,
    ].filter(Boolean);
    return `Memory job done · ${parts.join(", ")}`;
  }

  private touch(): void {
    this.onTouch();
  }
}

export interface MemoryJobDebugStore {
  setStatus: (status: MemoryJobStoreStatus) => void;
  scheduleRun: (runAt: Date) => void;
  startRun: () => MemoryJobRunSession;
  getCurrentSession: () => MemoryJobRunSession | null;
  completeRun: () => void;
  failRun: (err: unknown) => void;
  cancelScheduled: () => void;
  getScheduledRunAt: () => string | null;
  snapshot: () => MemoryJobDebugSnapshot;
  getRunDetail: (id: number) => MemoryJobRunDetail | null;
  wrapChatComplete: (
    label: string,
    model: string,
    timeoutSec: number,
    base: (messages: ChatMessage[]) => Promise<string>,
  ) => (messages: ChatMessage[]) => Promise<string>;
}

export function createMemoryJobDebug(options: {
  moduleId: string;
  maxRuns?: number;
  onUpdate?: NotifyFn;
}): MemoryJobDebugStore {
  const maxRuns = options.maxRuns ?? 30;
  let status: MemoryJobStoreStatus = "idle";
  let runSeq = 0;
  let currentSession: MemoryJobRunSession | null = null;
  let scheduledRunAt: string | null = null;
  const recentRuns: MemoryJobRunListItem[] = [];
  const runDetails = new Map<number, MemoryJobRunDetail>();
  let lastUpdatedAt = new Date().toISOString();

  function touch(): void {
    lastUpdatedAt = new Date().toISOString();
    options.onUpdate?.();
  }

  function pushRun(detail: MemoryJobRunDetail): void {
    runDetails.set(detail.id, detail);
    recentRuns.unshift(detailToListItem(detail));
    if (recentRuns.length > maxRuns) {
      const removed = recentRuns.splice(maxRuns);
      for (const item of removed) runDetails.delete(item.id);
    }
  }

  function detailToListItem(detail: MemoryJobRunDetail): MemoryJobRunListItem {
    return {
      id: detail.id,
      status: detail.status,
      headline: detail.report.headline,
      createdAt: detail.createdAt,
      runAt: detail.runAt,
      durationMs:
        detail.finishedAt != null ? detail.report.durationMs : null,
      chatsProcessed: detail.report.chatsProcessed,
      chatsSkipped: detail.report.chatsSkipped,
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
      currentSession = new MemoryJobRunSession(runSeq, touch);
      currentSession.schedule(runAt);
      scheduledRunAt = runAt.toISOString();
      status = "scheduled";
      touch();
    },

    startRun() {
      if (!currentSession) {
        runSeq += 1;
        currentSession = new MemoryJobRunSession(runSeq, touch);
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

    snapshot() {
      return {
        moduleId: options.moduleId,
        status,
        scheduledRunAt,
        currentRun: currentSession?.toDetail() ?? null,
        recentRuns: [...recentRuns],
        lastUpdatedAt,
      };
    },

    getRunDetail(id) {
      if (currentSession?.id === id) return currentSession.toDetail();
      return runDetails.get(id) ?? null;
    },

    wrapChatComplete(label, model, timeoutSec, base) {
      return async (messages) => {
        const session = currentSession;
        if (!session) return base(messages);
        const phaseId = session.beginLlmWait(label, model, timeoutSec);
        const started = performance.now();
        try {
          const raw = await base(messages);
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
