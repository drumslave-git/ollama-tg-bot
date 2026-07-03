import type {
  ChatMessage,
  LlmTokenUsage,
  VerbosePromptLayout,
} from "../llm/client.js";
import type {
  EntryType,
  ProcessingStatus,
} from "../db/debug/processing-entries.js";
import { recordLlmUsage } from "../db/debug/llm-usage.js";

/** Running token totals summed across every LLM call in one unit of work. */
export interface TokenTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Persistence backend for one debug domain (messages, tasks, scheduled jobs).
 * The recorder stays domain-agnostic; each domain supplies a sink that writes to
 * its own `<domain>_processings` / `<domain>_processing_entries` tables.
 */
export interface ProcessingSink {
  /** Create the processing row for an owner if absent (idempotent). */
  ensure(ownerId: number): Promise<unknown>;
  /** Append one entry to the owner's processing. */
  report(
    ownerId: number,
    title: string,
    type: EntryType,
    content: string,
  ): Promise<void>;
  /** Set the terminal status (+ elapsed time, token totals, and any domain-specific extras). */
  setStatus(
    ownerId: number,
    status: ProcessingStatus,
    opts: { totalTimeSpentMs: number; tokens: TokenTotals; extra?: unknown },
  ): Promise<void>;
}

const LLM_TITLES: Record<string, string> = {
  "address detection": "Address check",
  "web search decision": "Search decision",
  "mood evaluate": "Mood evaluation",
  "main reply": "Main reply",
  "vision describe": "Vision description",
  "sticker pick": "Sticker selection",
  "memory consolidation": "Memory consolidation",
  "task fire": "Task fire",
};

export function llmTitle(label: string): string {
  const afterTools = /^main reply · after tools (\d+)$/.exec(label);
  if (afterTools) return `Main reply · after tools (round ${afterTools[1]})`;
  if (label === "main reply · final") return "Main reply · final (tools stalled)";
  return LLM_TITLES[label] ?? label;
}

interface ChatResponseShape {
  message?: { content?: string; reasoning?: string };
  toolCalls?: Array<{ name: string; arguments: string }>;
  finishReason?: string;
  completionTokens?: number;
  usage?: LlmTokenUsage;
}

export function jsonContent(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Generic live recorder for one unit of work. It owns the cross-cutting
 * mechanics every domain needs — buffering entries until the owning row exists,
 * serializing writes so entries persist in emission order, timing, and the
 * shared LLM-call / phase entry vocabulary. Domains subclass it to add their own
 * milestone methods and to wire terminal-status semantics.
 */
export class ProcessingRecorder {
  protected readonly startedAt = performance.now();
  protected ownerId: number | null = null;
  private buffer: Array<() => Promise<void>> = [];
  /**
   * Serializes every persisted write. Entries are fire-and-forget from sync call
   * sites and each one awaits `ensure` before its insert, so without this chain
   * two entries emitted back-to-back could race and land out of order.
   */
  private writeChain: Promise<void> = Promise.resolve();

  /**
   * Opaque trace id this recorder is registered under, so the LLM client can
   * route request/response entries here. Defaults to a fresh id; domains with
   * their own turn key (messages) pass it explicitly.
   */
  readonly traceId: number;

  /**
   * Which debug domain this recorder serves ("message" | "task" | "job"). Tags
   * the per-call rows written to `llm_usage` so the overview can attribute
   * token spend by source.
   */
  protected readonly domain: string;

  /** Token counts summed across every LLM call recorded here. */
  private readonly tokenTotals: TokenTotals = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  constructor(
    protected readonly sink: ProcessingSink,
    traceId: number = allocateTraceId(),
    domain = "message",
  ) {
    this.traceId = traceId;
    this.domain = domain;
    registerRecorder(traceId, this);
  }

  private enqueue(task: () => Promise<void>): void {
    this.writeChain = this.writeChain.then(task).catch((err) => {
      console.error("Failed to persist processing entry:", err);
    });
  }

  /** Resolves once every queued write for this unit of work has flushed. */
  flush(): Promise<void> {
    return this.writeChain;
  }

  /** Link this recorder to its stored owner row and flush any buffered entries. */
  link(ownerId: number): void {
    this.ownerId = ownerId;
    this.enqueue(async () => {
      await this.sink.ensure(ownerId);
    });
    const pending = this.buffer;
    this.buffer = [];
    for (const run of pending) this.enqueue(run);
  }

  protected entry(title: string, type: EntryType, content: string): void {
    const run = async () => {
      if (this.ownerId == null) return;
      await this.sink.report(this.ownerId, title, type, content);
    };
    if (this.ownerId == null) {
      this.buffer.push(run);
      return;
    }
    this.enqueue(run);
  }

  /** Append a free-form entry — the primitive every domain builds on. */
  note(title: string, content = ""): void {
    this.entry(title, "text", content);
  }

  /** Append a structured (JSON) entry. */
  noteJson(title: string, value: unknown): void {
    this.entry(title, "json", jsonContent(value));
  }

  protected elapsedMs(): number {
    return Math.round(performance.now() - this.startedAt);
  }

  /** Snapshot of token counts summed across this unit of work's LLM calls. */
  tokens(): TokenTotals {
    return { ...this.tokenTotals };
  }

  protected finish(status: ProcessingStatus, extra?: unknown): void {
    const elapsed = this.elapsedMs();
    const tokens = this.tokens();
    const run = async () => {
      if (this.ownerId == null) return;
      await this.sink.setStatus(this.ownerId, status, {
        totalTimeSpentMs: elapsed,
        tokens,
        extra,
      });
    };
    if (this.ownerId == null) this.buffer.push(run);
    else this.enqueue(run);
  }

  /** Persist the terminal status and unregister this recorder. */
  complete(status: ProcessingStatus, extra?: unknown): void {
    this.finish(status, extra);
    releaseRecorder(this.traceId);
  }

  // ---- Generic pipeline phases --------------------------------------------

  okPhase(
    _id: string,
    title: string,
    summary: string,
    durationMs?: number,
    detail?: unknown,
  ): void {
    const suffix = durationMs != null ? ` · ${Math.round(durationMs)}ms` : "";
    this.entry(title, "text", `${summary}${suffix}`);
    if (detail != null) this.noteJson(`${title} · detail`, detail);
  }

  skipPhase(_id: string, title: string, summary: string): void {
    this.entry(`${title} (skipped)`, "text", summary);
  }

  failPhase(
    _id: string,
    title: string,
    summary: string,
    durationMs?: number,
  ): void {
    const suffix = durationMs != null ? ` · ${Math.round(durationMs)}ms` : "";
    this.entry(`${title} (failed)`, "text", `${summary}${suffix}`);
  }

  // ---- LLM lifecycle: request → waiting → response ------------------------

  beginLlmWait(
    label: string,
    model: string,
    timeoutSec: number,
    requestBody?: unknown,
    samplingLine?: string,
  ): void {
    const title = llmTitle(label);
    if (requestBody != null) {
      this.noteJson(`LLM request · ${title}`, requestBody);
    }
    const sampling = samplingLine ? ` · ${samplingLine}` : "";
    this.entry(
      `Waiting for LLM · ${title}`,
      "text",
      `${model} · up to ${timeoutSec}s${sampling}`,
    );
  }

  failLlmWait(label: string, summary: string, durationMs?: number): void {
    const suffix = durationMs != null ? ` · ${Math.round(durationMs)}ms` : "";
    this.entry(`LLM failed · ${llmTitle(label)}`, "text", `${summary}${suffix}`);
  }

  recordLlmCall(
    label: string,
    model: string,
    maxTokens: number,
    _messages: ChatMessage[],
    response: ChatResponseShape,
    _layout?: VerbosePromptLayout,
    _samplingLine?: string,
    _requestBody?: unknown,
    responseBody?: unknown,
    durationMs?: number,
  ): void {
    const title = llmTitle(label);
    const content = response.message?.content ?? "";
    const reasoning = response.message?.reasoning ?? "";
    const toolCalls = response.toolCalls ?? [];

    const summary: string[] = [model];
    if (toolCalls.length > 0) {
      summary.push(
        `${toolCalls.length} tool call${toolCalls.length === 1 ? "" : "s"}: ${toolCalls
          .map((c) => c.name)
          .join(", ")}`,
      );
    } else {
      summary.push(`${content.length} chars output`);
    }
    if (reasoning) summary.push(`${reasoning.length} chars reasoning`);
    summary.push(`done: ${response.finishReason ?? "unknown"}`);

    // Prefer the provider's full usage (prompt + completion); fall back to the
    // completion-only token count/cap when usage is absent.
    const usage = response.usage;
    if (usage) {
      this.tokenTotals.promptTokens += usage.promptTokens;
      this.tokenTotals.completionTokens += usage.completionTokens;
      this.tokenTotals.totalTokens += usage.totalTokens;
      summary.push(
        `tokens: ${usage.promptTokens} in + ${usage.completionTokens} out = ${usage.totalTokens}`,
      );
      recordLlmUsage({
        domain: this.domain,
        label,
        model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
      });
    } else {
      summary.push(`tokens: ${response.completionTokens ?? 0}/${maxTokens}`);
    }
    if (durationMs != null) summary.push(`${Math.round(durationMs)}ms`);

    this.noteJson(
      `LLM response · ${title}`,
      responseBody ?? { content, reasoning, toolCalls },
    );
    this.entry(`LLM result · ${title}`, "text", summary.join(" · "));
  }
}

/**
 * Process-wide registry of in-flight recorders, keyed by an opaque trace id.
 * The LLM client looks recorders up here so any domain (messages, tasks, jobs)
 * captures the request → waiting → response entries without the client knowing
 * which domain it serves. Trace ids come from {@link allocateTraceId} so keys
 * never collide across domains.
 */
const recorders = new Map<number, ProcessingRecorder>();
let traceSeq = 0;

export function allocateTraceId(): number {
  return ++traceSeq;
}

export function registerRecorder(
  traceId: number,
  recorder: ProcessingRecorder,
): void {
  recorders.set(traceId, recorder);
}

export function getRecorder(traceId: number): ProcessingRecorder | undefined {
  return recorders.get(traceId);
}

export function releaseRecorder(traceId: number): void {
  recorders.delete(traceId);
}
