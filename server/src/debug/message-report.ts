import type { ChatMessage } from "../llm/client.js";
import type { VerbosePromptLayout } from "../llm/client.js";
import {
  type MessageReportListSummary,
  type MessageReportRecord,
  type ReportDetail,
  type ReportPhase,
  type ReportStatus,
  upsertMessageReport,
} from "../db/debug/traces.js";

export type {
  MessageReportListSummary,
  MessageReportRecord,
  ReportDetail,
  MessageReport,
  ReportPhase,
  ReportStatus,
} from "../db/debug/traces.js";

const IGNORE_LABELS: Record<string, string> = {
  from_bot: "Sender is a bot",
  slash_command: "Slash command",
  no_content: "Empty message",
  maintenance_mode: "Maintenance mode blocked",
  not_addressed: "Not addressed to the bot",
};

const ADDRESS_LABELS: Record<string, string> = {
  private: "Private chat (always addressed)",
  mention_or_reply: "Mention or reply to bot",
  name: "Bot name in message",
  analyzer: "LLM address check",
  no_text: "No text for address check",
};

const TRIGGER_LABELS: Record<string, string> = {
  addressed: "Addressed normally",
  random: "Random reply trigger",
  image: "Image reaction trigger",
};

function llmPhaseId(label: string): string {
  if (label === "main reply") return "completions";
  const toolRound = /^main reply tools (\d+)$/.exec(label);
  if (toolRound) return `completions-tools-${toolRound[1]}`;
  return `llm-${label.replace(/\s+/g, "-")}`;
}

function llmPhaseTitle(label: string): string {
  const toolRound = /^main reply tools (\d+)$/.exec(label);
  if (toolRound) return `Main reply · tools (round ${toolRound[1]})`;
  return LLM_TITLES[label] ?? label;
}

const LLM_TITLES: Record<string, string> = {
  "address detection": "Address check",
  "web search decision": "Search decision",
  "mood evaluate": "Mood evaluation",
  "main reply": "Main reply",
  "vision describe": "Vision description",
  "sticker pick": "Sticker selection",
  "memory extract": "Memory extraction",
  "user memory merge": "Memory merge (user)",
  "group memory merge": "Memory merge (group)",
};

interface ChatResponseShape {
  message?: {
    content?: string;
    reasoning?: string;
  };
  done_reason?: string;
  eval_count?: number;
}

const sessions = new Map<number, MessageReportSession>();

const PROCESSING_TICK_MS = 2000;
let processingTick: ReturnType<typeof setInterval> | null = null;

function trackProcessingSession(session: MessageReportSession): void {
  sessions.set(session.turnId, session);
  if (processingTick != null) return;
  processingTick = setInterval(() => {
    if (sessions.size === 0) {
      if (processingTick != null) clearInterval(processingTick);
      processingTick = null;
      return;
    }
    for (const active of sessions.values()) {
      active.tick();
    }
  }, PROCESSING_TICK_MS);
}

function releaseProcessingSession(turnId: number): void {
  sessions.delete(turnId);
}

export class MessageReportSession {
  readonly turnId: number;
  readonly chatId: string;
  convKey: string;
  readonly userId: string | null;
  readonly chatType: string;
  readonly messageId: number | null;
  readonly messagePreview: string;
  private readonly startedAt = performance.now();
  private status: ReportStatus = "processing";
  private hasMedia = false;
  private mediaKind?: string;
  private routing:
    | {
        decision: "pending";
        pendingLabel: string;
      }
    | {
        decision: "ignored";
        ignoreReason: string;
        ignoreLabel: string;
        addressSource?: string;
      }
    | {
        decision: "accepted";
        trigger: "addressed" | "random" | "image";
        triggerLabel: string;
        addressSource?: string;
      }
    | {
        decision: "queued";
        position: number;
        queueLabel: string;
      }
    | null = null;
  private phases: ReportPhase[] = [];
  private result: MessageReportRecord["result"] = {};

  constructor(input: {
    turnId: number;
    chatId: string;
    convKey?: string;
    userId: string | null;
    chatType: string;
    messageId: number | null;
    messagePreview: string;
  }) {
    this.turnId = input.turnId;
    this.chatId = input.chatId;
    this.convKey = input.convKey ?? "";
    this.userId = input.userId;
    this.chatType = input.chatType;
    this.messageId = input.messageId;
    this.messagePreview = input.messagePreview;
  }

  setConvKey(convKey: string): void {
    this.convKey = convKey;
  }

  setIntake(input: { hasMedia: boolean; mediaKind?: string }): void {
    this.hasMedia = input.hasMedia;
    this.mediaKind = input.mediaKind;
    this.persistIfInFlight();
  }

  /** Write the trace as soon as the bot receives a message. */
  markReceived(): void {
    this.routing = {
      decision: "pending",
      pendingLabel: "Message received",
    };
    this.upsertPhase({
      id: "intake",
      title: "Message received",
      status: "ok",
      summary: this.messagePreview.slice(0, 120) || "(non-text message)",
    });
  }

  /** Re-persist in-flight traces so the dashboard can show live duration. */
  tick(): void {
    if (this.status === "processing") {
      this.persist();
    }
  }

  finishIgnored(ignoreReason: string, addressSource?: string): void {
    this.status = "ignored";
    this.routing = {
      decision: "ignored",
      ignoreReason,
      ignoreLabel: IGNORE_LABELS[ignoreReason] ?? ignoreReason,
      addressSource: addressSource
        ? humanAddressLabel(addressSource)
        : undefined,
    };
    this.persist();
    releaseProcessingSession(this.turnId);
  }

  setAccepted(input: {
    trigger: "addressed" | "random" | "image";
    addressSource?: string;
  }): void {
    this.status = "processing";
    this.routing = {
      decision: "accepted",
      trigger: input.trigger,
      triggerLabel: TRIGGER_LABELS[input.trigger] ?? input.trigger,
      addressSource: input.addressSource
        ? humanAddressLabel(input.addressSource)
        : undefined,
    };
    this.persist();
  }

  setQueued(position: number): void {
    this.status = "processing";
    this.routing = {
      decision: "queued",
      position,
      queueLabel: `Queued · position ${position}`,
    };
    this.upsertPhase({
      id: "queue",
      title: "Queue",
      status: "waiting",
      summary: `Position ${position} in queue`,
    });
    this.persist();
  }

  setProcessingStarted(): void {
    this.upsertPhase({
      id: "queue",
      title: "Queue",
      status: "ok",
      summary: "Processing started",
    });
    this.persistIfInFlight();
  }

  skipPhase(
    id: string,
    title: string,
    summary: string,
    options?: { replace?: boolean },
  ): void {
    const phase: ReportPhase = { id, title, status: "skipped", summary };
    if (options?.replace) {
      this.upsertPhase(phase);
      return;
    }
    this.phases.push(phase);
    this.persistIfInFlight();
  }

  okPhase(
    id: string,
    title: string,
    summary: string,
    durationMs?: number,
    detail?: ReportDetail,
    options?: { replace?: boolean },
  ): void {
    const phase: ReportPhase = {
      id,
      title,
      status: "ok",
      summary,
      ...(durationMs != null ? { durationMs: Math.round(durationMs) } : {}),
      ...(detail ? { detail } : {}),
    };
    if (options?.replace) {
      this.upsertPhase(phase);
      return;
    }
    this.phases.push(phase);
    this.persistIfInFlight();
  }

  failPhase(
    id: string,
    title: string,
    summary: string,
    durationMs?: number,
    options?: { replace?: boolean },
  ): void {
    const phase: ReportPhase = {
      id,
      title,
      status: "failed",
      summary,
      ...(durationMs != null ? { durationMs: Math.round(durationMs) } : {}),
    };
    if (options?.replace) {
      this.upsertPhase(phase);
      return;
    }
    this.phases.push(phase);
    this.persistIfInFlight();
  }

  /** Mark an in-flight LLM request so Debug shows a waiting state. */
  beginLlmWait(label: string, model: string, timeoutSec: number): void {
    const title = llmPhaseTitle(label);
    this.upsertPhase({
      id: llmPhaseId(label),
      title,
      status: "waiting",
      summary: `Waiting for LLM · ${model} · up to ${timeoutSec}s`,
    });
  }

  failLlmWait(label: string, summary: string, durationMs?: number): void {
    const title = llmPhaseTitle(label);
    this.upsertPhase({
      id: llmPhaseId(label),
      title,
      status: "failed",
      summary,
      ...(durationMs != null ? { durationMs: Math.round(durationMs) } : {}),
    });
  }

  recordLlmCall(
    label: string,
    model: string,
    maxTokens: number,
    messages: ChatMessage[],
    response: ChatResponseShape,
    layout?: VerbosePromptLayout,
    samplingLine?: string,
    requestBody?: unknown,
    responseBody?: unknown,
    durationMs?: number,
  ): void {
    const title = llmPhaseTitle(label);
    const id = llmPhaseId(label);
    const sections: Array<{ title: string; body: string }> = [];

    if (layout) {
      sections.push({ title: "System", body: layout.system });
      if (layout.history.length > 0) {
        sections.push({
          title: `History (${layout.history.length} messages)`,
          body: layout.history
            .map(
              (m, i) =>
                `[${i + 1}] ${m.role}${m.images?.length ? ` (${m.images.length} image(s))` : ""}\n${m.content}`,
            )
            .join("\n\n"),
        });
      }
      sections.push({ title: "Latest turn", body: layout.latest });
    } else {
      sections.push({
        title: "Messages",
        body: messages
          .map(
            (m, i) =>
              `[${i + 1}] ${m.role}${m.images?.length ? ` (${m.images.length} image(s))` : ""}\n${m.content}`,
          )
          .join("\n\n"),
      });
    }

    const content = response.message?.content ?? "";
    const reasoning = response.message?.reasoning ?? "";
    const meta = [
      `done: ${response.done_reason ?? "unknown"}`,
      `tokens: ${response.eval_count ?? 0}`,
      `max_tokens: ${maxTokens}`,
      samplingLine,
    ]
      .filter(Boolean)
      .join(" · ");

    const summaryParts = [`${model}`, `${content.length} chars output`];
    if (reasoning) summaryParts.push(`${reasoning.length} chars reasoning`);

    this.upsertPhase({
      id,
      title,
      status: "ok",
      summary: summaryParts.join(" · "),
      ...(durationMs != null ? { durationMs: Math.round(durationMs) } : {}),
      detail: {
        type: "llm",
        model,
        sampling: samplingLine,
        requestBody,
        responseBody,
        sections,
        output: {
          content,
          reasoning: reasoning || undefined,
          meta,
        },
      },
    });
  }

  finalizeProcessed(options?: {
    replyChars?: number;
    chunks?: number;
    sticker?: string;
    thinkingSent?: boolean;
  }): void {
    this.status = "processed";
    this.result = {
      ...this.result,
      replyChars: options?.replyChars,
      chunks: options?.chunks,
      sticker: options?.sticker,
      thinkingSent: options?.thinkingSent,
    };
    this.persist();
    releaseProcessingSession(this.turnId);
  }

  finalizeError(error: string): void {
    this.status = "error";
    this.result = { ...this.result, error };
    this.persist();
    releaseProcessingSession(this.turnId);
  }

  finalizeEarlyReply(input: { reason: string; replyChars?: number }): void {
    this.status = "processed";
    this.result = {
      error: input.reason,
      replyChars: input.replyChars,
    };
    this.persist();
    releaseProcessingSession(this.turnId);
  }

  private buildReport(): MessageReportRecord {
    const durationMs = Math.round(performance.now() - this.startedAt);
    return {
      status: this.status,
      headline: buildHeadline(
        this.status,
        durationMs,
        this.routing,
        this.phases,
        this.result,
      ),
      durationMs,
      intake: {
        messagePreview: this.messagePreview,
        hasMedia: this.hasMedia,
        mediaKind: this.mediaKind,
      },
      routing:
        this.routing ??
        (this.status === "processing"
          ? {
              decision: "pending",
              pendingLabel: "Message received",
            }
          : {
              decision: "ignored",
              ignoreReason: "unknown",
              ignoreLabel: "Unknown",
            }),
      phases: this.phases,
      result: this.result,
    };
  }

  private upsertPhase(phase: ReportPhase): void {
    const idx = this.phases.findIndex((entry) => entry.id === phase.id);
    if (idx >= 0) {
      this.phases[idx] = phase;
    } else {
      this.phases.push(phase);
    }
    this.persistIfInFlight();
  }

  private persistIfInFlight(): void {
    if (this.status === "processing") {
      this.persist();
    }
  }

  private persist(): void {
    const report = this.buildReport();
    const listSummary: MessageReportListSummary = {
      headline: report.headline,
      badges: buildBadges(report),
      trigger:
        report.routing.decision === "accepted"
          ? report.routing.trigger
          : undefined,
      ignoreLabel:
        report.routing.decision === "ignored"
          ? report.routing.ignoreLabel
          : undefined,
    };

    upsertMessageReport({
      id: this.turnId,
      chatId: this.chatId,
      convKey: this.convKey,
      userId: this.userId,
      chatType: this.chatType,
      messageId: this.messageId,
      messagePreview: this.messagePreview,
      status: this.status,
      listSummary,
      report,
      durationMs: report.durationMs,
    });
  }
}

function buildBadges(report: MessageReportRecord): string[] {
  const badges: string[] = [];
  if (report.routing.decision === "accepted") {
    badges.push(report.routing.triggerLabel);
  } else if (report.routing.decision === "queued") {
    badges.push(`queued #${report.routing.position}`);
  } else if (report.routing.decision === "ignored") {
    badges.push(report.routing.ignoreLabel);
  } else if (report.status === "processing") {
    badges.push("in progress");
  }

  for (const phase of report.phases) {
    if (phase.status !== "ok") continue;
    if (phase.id.startsWith("llm-")) continue;
    if (["delivery", "routing"].includes(phase.id)) continue;
    badges.push(phase.title.toLowerCase());
  }

  return [...new Set(badges)].slice(0, 6);
}

function buildHeadline(
  status: ReportStatus,
  durationMs: number,
  routing: MessageReportSession["routing"],
  phases: ReportPhase[],
  result: MessageReportRecord["result"],
): string {
  const duration = formatDuration(durationMs);

  if (status === "ignored") {
    const label =
      routing?.decision === "ignored" ? routing.ignoreLabel : "Ignored";
    return `Ignored · ${label}`;
  }

  if (status === "processing") {
    const waitingPhase = [...phases].reverse().find((p) => p.status === "waiting");
    if (waitingPhase) {
      return `Waiting for LLM · ${waitingPhase.title}`;
    }
    if (routing?.decision === "queued") {
      return routing.queueLabel;
    }
    if (routing?.decision === "accepted") {
      return `Processing · ${routing.triggerLabel}`;
    }
    if (routing?.decision === "pending") {
      const activePhase = [...phases]
        .reverse()
        .find((p) => p.status === "ok" && p.id !== "intake");
      if (activePhase) {
        return `Processing · ${activePhase.title}`;
      }
      return `Processing · ${routing.pendingLabel}`;
    }
    const lastPhase = phases.at(-1);
    if (lastPhase) {
      return `Processing · ${lastPhase.title}`;
    }
    return "Processing · message received";
  }

  if (status === "error") {
    return `Failed in ${duration}${result.error ? ` · ${result.error}` : ""}`;
  }

  const features = [
    ...new Set(
      phases
        .filter((p) => p.status === "ok")
        .map((p) => p.title.toLowerCase())
        .filter((t) => t !== "main reply" && t !== "delivery"),
    ),
  ].slice(0, 4);

  if (result.error && !result.replyChars) {
    return `Stopped in ${duration} · ${result.error}`;
  }

  const replyPart =
    result.replyChars != null ? `${result.replyChars} chars` : "replied";
  const featureText = features.length > 0 ? ` · ${features.join(", ")}` : "";
  return `Replied in ${duration} · ${replyPart}${featureText}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function humanAddressLabel(source?: string): string | undefined {
  if (!source) return undefined;
  return ADDRESS_LABELS[source] ?? source;
}

export function beginMessageReport(input: {
  turnId: number;
  chatId: number;
  convKey?: string;
  userId: string | null;
  chatType: string;
  messageId: number | null;
  messagePreview: string;
}): MessageReportSession {
  const session = new MessageReportSession({
    turnId: input.turnId,
    chatId: String(input.chatId),
    convKey: input.convKey,
    userId: input.userId,
    chatType: input.chatType,
    messageId: input.messageId,
    messagePreview: input.messagePreview,
  });
  trackProcessingSession(session);
  session.markReceived();
  return session;
}

export function getMessageReport(
  turnId: number,
): MessageReportSession | undefined {
  return sessions.get(turnId);
}
