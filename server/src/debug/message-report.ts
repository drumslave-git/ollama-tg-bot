import type { ChatMessage, VerbosePromptLayout } from "../llm/client.js";
import {
  type EntryType,
  type ProcessingStatus,
  ensureMessageProcessing,
  reportMessageProcessing,
  setMessageProcessingStatus,
} from "../db/debug/message-processing.js";

export type { ProcessingStatus, EntryType } from "../db/debug/message-processing.js";

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

function llmTitle(label: string): string {
  const toolRound = /^main reply tools (\d+)$/.exec(label);
  if (toolRound) return `Main reply · tools (round ${toolRound[1]})`;
  return LLM_TITLES[label] ?? label;
}

interface ChatResponseShape {
  message?: { content?: string; reasoning?: string };
  toolCalls?: Array<{ name: string; arguments: string }>;
  done_reason?: string;
  eval_count?: number;
}

function jsonContent(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const sessions = new Map<number, MessageProcessingReport>();

/**
 * Live recorder for one inbound message turn. It keeps the same method surface
 * the pipeline already calls (okPhase/recordLlmCall/finalize…), but each call now
 * appends a `message_processing_entries` row keyed by the chat_messages.id of the
 * triggering message. Until that row is stored (see {@link linkProcessingMessage}),
 * calls are buffered, then flushed in order.
 */
export class MessageProcessingReport {
  readonly turnId: number;
  private readonly startedAt = performance.now();
  private chatMessageId: number | null = null;
  private buffer: Array<() => Promise<void>> = [];
  /**
   * Serializes every persisted write for this turn. Entries are fire-and-forget
   * from sync call sites and each one `await`s `ensureMessageProcessing` before
   * its INSERT, so without this chain two entries emitted back-to-back (e.g. an
   * LLM request + waiting line) could race and land out of order.
   */
  private writeChain: Promise<void> = Promise.resolve();
  private replyMessageIds: number[] = [];

  constructor(turnId: number) {
    this.turnId = turnId;
  }

  private enqueue(task: () => Promise<void>): void {
    this.writeChain = this.writeChain.then(task).catch((err) => {
      console.error("Failed to persist message processing entry:", err);
    });
  }

  /** Resolves once every queued write for this turn has been flushed. */
  flush(): Promise<void> {
    return this.writeChain;
  }

  /** Link this turn to its stored chat message and flush any buffered entries. */
  link(chatMessageId: number): void {
    this.chatMessageId = chatMessageId;
    this.enqueue(async () => {
      await ensureMessageProcessing(chatMessageId);
    });
    const pending = this.buffer;
    this.buffer = [];
    for (const run of pending) this.enqueue(run);
  }

  private entry(title: string, type: EntryType, content: string): void {
    const run = async () => {
      if (this.chatMessageId == null) return;
      await reportMessageProcessing(this.chatMessageId, title, type, content);
    };
    if (this.chatMessageId == null) {
      this.buffer.push(run);
      return;
    }
    this.enqueue(run);
  }

  private elapsedMs(): number {
    return Math.round(performance.now() - this.startedAt);
  }

  private finish(status: ProcessingStatus): void {
    const elapsed = this.elapsedMs();
    const replyIds = this.replyMessageIds;
    const run = async () => {
      if (this.chatMessageId == null) return;
      await setMessageProcessingStatus(this.chatMessageId, status, {
        totalTimeSpentMs: elapsed,
        replyMessageIds: replyIds.length ? replyIds : undefined,
      });
    };
    if (this.chatMessageId == null) this.buffer.push(run);
    else this.enqueue(run);
    sessions.delete(this.turnId);
  }

  // ---- Routing / queue milestones -----------------------------------------

  setIntake(_input: { hasMedia: boolean; mediaKind?: string }): void {
    // The stored chat message already captures the content; nothing to record.
  }

  setConvKey(_convKey: string): void {
    // Chat is resolved via the chat_messages relation; no entry needed.
  }

  setAccepted(input: {
    trigger: "addressed" | "random" | "image";
    addressSource?: string;
  }): void {
    const source = input.addressSource
      ? ` · ${ADDRESS_LABELS[input.addressSource] ?? input.addressSource}`
      : "";
    this.entry(
      "Accepted",
      "text",
      `${TRIGGER_LABELS[input.trigger] ?? input.trigger}${source}`,
    );
  }

  setQueued(position: number): void {
    this.entry("Queued", "text", `Position ${position} in queue`);
  }

  setProcessingStarted(): void {
    this.entry("Processing started", "text", "Picked up from the queue");
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
    if (detail != null) this.entry(`${title} · detail`, "json", jsonContent(detail));
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
      this.entry(`LLM request · ${title}`, "json", jsonContent(requestBody));
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
    summary.push(`done: ${response.done_reason ?? "unknown"}`);
    summary.push(`tokens: ${response.eval_count ?? 0}/${maxTokens}`);
    if (durationMs != null) summary.push(`${Math.round(durationMs)}ms`);

    this.entry(
      `LLM response · ${title}`,
      "json",
      jsonContent(responseBody ?? { content, reasoning, toolCalls }),
    );
    this.entry(`LLM result · ${title}`, "text", summary.join(" · "));
  }

  // ---- Terminal states -----------------------------------------------------

  finishIgnored(ignoreReason: string, addressSource?: string): void {
    const source = addressSource
      ? ` · ${ADDRESS_LABELS[addressSource] ?? addressSource}`
      : "";
    this.entry(
      "Ignored",
      "text",
      `${IGNORE_LABELS[ignoreReason] ?? ignoreReason}${source}`,
    );
    this.finish("ignored");
  }

  finalizeProcessed(options?: {
    replyChars?: number;
    chunks?: number;
    sticker?: string;
    replyMessageIds?: number[];
  }): void {
    if (options?.replyMessageIds?.length) {
      this.replyMessageIds = options.replyMessageIds;
    }
    const parts: string[] = [];
    if (options?.replyChars != null) parts.push(`${options.replyChars} chars`);
    if (options?.chunks != null) parts.push(`${options.chunks} chunk(s)`);
    if (options?.sticker) parts.push(`sticker ${options.sticker}`);
    this.entry("Replied", "text", parts.join(" · ") || "Reply delivered");
    this.finish("processed");
  }

  finalizeEarlyReply(input: { reason: string; replyChars?: number }): void {
    const chars = input.replyChars != null ? ` · ${input.replyChars} chars` : "";
    this.entry("Early reply", "text", `${input.reason}${chars}`);
    this.finish("processed");
  }

  finalizeError(error: string): void {
    this.entry("Error", "text", error);
    this.finish("error");
  }
}

export function beginMessageReport(input: {
  turnId: number;
  chatId?: number;
  convKey?: string;
  userId?: string | null;
  chatType?: string;
  messageId?: number | null;
  messagePreview?: string;
}): MessageProcessingReport {
  const session = new MessageProcessingReport(input.turnId);
  sessions.set(input.turnId, session);
  return session;
}

/** Link a turn's report to the stored chat message that triggered it. */
export function linkProcessingMessage(
  turnId: number,
  chatMessageId: number,
): void {
  sessions.get(turnId)?.link(chatMessageId);
}

export function getMessageReport(
  turnId: number,
): MessageProcessingReport | undefined {
  return sessions.get(turnId);
}
