import {
  type ProcessingSink,
  ProcessingRecorder,
  getRecorder,
} from "./processing-recorder.js";
import {
  ensureMessageProcessing,
  reportMessageProcessing,
  setMessageProcessingStatus,
} from "../db/debug/message-processing.js";

export type {
  ProcessingStatus,
  EntryType,
} from "../db/debug/message-processing.js";

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

/** Writes the message domain's processing entries via the shared recorder. */
const messageSink: ProcessingSink = {
  ensure: (ownerId) => ensureMessageProcessing(ownerId),
  report: (ownerId, title, type, content) =>
    reportMessageProcessing(ownerId, title, type, content),
  setStatus: (ownerId, status, { totalTimeSpentMs, extra }) =>
    setMessageProcessingStatus(ownerId, status, {
      totalTimeSpentMs,
      replyMessageIds: (extra as { replyMessageIds?: number[] } | undefined)
        ?.replyMessageIds,
    }),
};

/**
 * Live recorder for one inbound message turn. Adds message-pipeline milestones
 * (routing, queue, terminal states) on top of the shared {@link ProcessingRecorder}.
 * `ownerId` is the chat_messages.id of the triggering message; until it is stored
 * (see {@link linkProcessingMessage}) entries buffer, then flush in order.
 */
export class MessageProcessingReport extends ProcessingRecorder {
  readonly turnId: number;
  private replyMessageIds: number[] = [];

  constructor(turnId: number) {
    // The turn id doubles as the recorder's trace id, so LLM entries from this
    // turn route here via the shared registry.
    super(messageSink, turnId);
    this.turnId = turnId;
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
    this.note("Accepted", `${TRIGGER_LABELS[input.trigger] ?? input.trigger}${source}`);
  }

  setQueued(position: number): void {
    this.note("Queued", `Position ${position} in queue`);
  }

  setProcessingStarted(): void {
    this.note("Processing started", "Picked up from the queue");
  }

  // ---- Terminal states -----------------------------------------------------

  finishIgnored(ignoreReason: string, addressSource?: string): void {
    const source = addressSource
      ? ` · ${ADDRESS_LABELS[addressSource] ?? addressSource}`
      : "";
    this.note("Ignored", `${IGNORE_LABELS[ignoreReason] ?? ignoreReason}${source}`);
    this.complete("ignored");
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
    this.note("Replied", parts.join(" · ") || "Reply delivered");
    this.complete("processed", { replyMessageIds: this.replyMessageIds });
  }

  finalizeEarlyReply(input: { reason: string; replyChars?: number }): void {
    const chars = input.replyChars != null ? ` · ${input.replyChars} chars` : "";
    this.note("Early reply", `${input.reason}${chars}`);
    this.complete("processed");
  }

  finalizeError(error: string): void {
    this.note("Error", error);
    this.complete("error");
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
  // The recorder registers itself in the shared registry under the turn id.
  return new MessageProcessingReport(input.turnId);
}

/** Link a turn's report to the stored chat message that triggered it. */
export function linkProcessingMessage(
  turnId: number,
  chatMessageId: number,
): void {
  getMessageReport(turnId)?.link(chatMessageId);
}

export function getMessageReport(
  turnId: number,
): MessageProcessingReport | undefined {
  // A message turn id only ever maps to a message recorder.
  return getRecorder(turnId) as MessageProcessingReport | undefined;
}
