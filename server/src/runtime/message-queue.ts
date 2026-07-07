import type { Context } from "grammy";
import type {
  PipelineHostServices,
  PipelineTurnState,
} from "../contracts/index.js";
import { parseHistoryPointer } from "../features/history/index.js";
import { recordPhaseTiming } from "../db/debug/phase-timings.js";
import { getMessageReport } from "../debug/message-report.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import { processQueuedTurn } from "../pipeline/queue-runner.js";
import { onQueueActivity, onQueueDrained } from "./background-jobs.js";
import { setHistoryPointer, setQueueSize } from "./pipeline-status.js";

export interface QueuedMessage {
  turnId: number;
  ctx: Context;
  botToken: string;
  state: PipelineTurnState;
  services: PipelineHostServices;
  /** Active typing indicator started as soon as intake accepted this turn. */
  stopTyping?: () => void;
  /** `{convKey}:{telegramMessageId}` anchor for inject / reply placement. */
  historyPointer?: string;
  /** Set by enqueueMessage — start of the queue wait for latency stats. */
  enqueuedAt?: number;
}

const pending: QueuedMessage[] = [];
let active: QueuedMessage | null = null;
let pumping = false;
const historyPointerByChat = new Map<string, string | null>();

function totalQueued(): number {
  return pending.length + (active ? 1 : 0);
}

function refreshQueueSize(): void {
  setQueueSize(totalQueued());
}

function queuePosition(turnId: number): number | null {
  if (active?.turnId === turnId) return 1;
  const idx = pending.findIndex((item) => item.turnId === turnId);
  if (idx < 0) return null;
  return idx + (active ? 2 : 1);
}

function refreshQueuedReports(): void {
  for (let i = 0; i < pending.length; i++) {
    const position = i + (active ? 2 : 1);
    getMessageReport(pending[i]!.turnId)?.setQueued(position);
  }
}

function advanceHistoryPointer(convKey: string): void {
  const next = pending.find((item) => item.state.convKey === convKey);
  const nextPointer = next?.historyPointer ?? null;
  historyPointerByChat.set(convKey, nextPointer);
  setHistoryPointer(nextPointer);
}

export function enqueueMessage(item: QueuedMessage): void {
  item.enqueuedAt = Date.now();
  pending.push(item);
  const convKey = item.state.convKey;
  if (convKey && item.historyPointer && !historyPointerByChat.has(convKey)) {
    historyPointerByChat.set(convKey, item.historyPointer);
    setHistoryPointer(item.historyPointer);
  }
  refreshQueuedReports();
  refreshQueueSize();
  onQueueActivity();
  logEvent("message_queued", {
    turnId: item.turnId,
    chatId: item.state.chatId,
    historyPointer: item.historyPointer ?? null,
    position: queuePosition(item.turnId),
    queueSize: totalQueued(),
  });
  void pump();
}

export function getMessageQueueSize(): number {
  return totalQueued();
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;

  try {
    while (pending.length > 0) {
      const item = pending.shift()!;
      active = item;
      refreshQueueSize();
      onQueueActivity();

      if (item.historyPointer) {
        setHistoryPointer(item.historyPointer);
        const parsed = parseHistoryPointer(item.historyPointer);
        if (parsed) {
          historyPointerByChat.set(parsed.convKey, item.historyPointer);
        }
      }

      getMessageReport(item.turnId)?.setProcessingStarted();
      if (item.enqueuedAt != null) {
        recordPhaseTiming("queue-wait", Date.now() - item.enqueuedAt);
      }
      const turnStarted = performance.now();

      try {
        await processQueuedTurn(item);
      } catch (err) {
        logEventError("queue_turn_failed", err, {
          turnId: item.turnId,
          chatId: item.state.chatId,
          historyPointer: item.historyPointer ?? null,
        });
      } finally {
        recordPhaseTiming("turn-total", performance.now() - turnStarted);
        const convKey = item.state.convKey;
        if (convKey) {
          advanceHistoryPointer(convKey);
        } else {
          setHistoryPointer(null);
        }
        active = null;
        refreshQueuedReports();
        refreshQueueSize();
        onQueueActivity();
      }
    }
  } finally {
    pumping = false;
    if (!active) setHistoryPointer(null);
    onQueueDrained();
  }
}
