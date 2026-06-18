import type { Context } from "grammy";
import type {
  PipelineHostServices,
  PipelineTurnState,
} from "@llm-tg-bot/modules-registry";
import { getMessageReport } from "../debug/message-report.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import { processQueuedTurn } from "../pipeline/queue-runner.js";
import { onQueueActivity, onQueueDrained } from "./background-jobs.js";
import { setQueueSize } from "./pipeline-status.js";

export interface QueuedMessage {
  turnId: number;
  ctx: Context;
  botToken: string;
  state: PipelineTurnState;
  services: PipelineHostServices;
}

const pending: QueuedMessage[] = [];
let active: QueuedMessage | null = null;
let pumping = false;

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

export function enqueueMessage(item: QueuedMessage): void {
  pending.push(item);
  refreshQueuedReports();
  refreshQueueSize();
  onQueueActivity();
  logEvent("message_queued", {
    turnId: item.turnId,
    chatId: item.state.chatId,
    position: queuePosition(item.turnId),
    queueSize: totalQueued(),
  });
  void pump();
}

export function getMessageQueueSize(): number {
  return totalQueued();
}

export function getMessageQueuePosition(turnId: number): number | null {
  return queuePosition(turnId);
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

      getMessageReport(item.turnId)?.setProcessingStarted();

      try {
        await processQueuedTurn(item);
      } catch (err) {
        logEventError("queue_turn_failed", err, {
          turnId: item.turnId,
          chatId: item.state.chatId,
        });
      } finally {
        active = null;
        refreshQueuedReports();
        refreshQueueSize();
        onQueueActivity();
      }
    }
  } finally {
    pumping = false;
    onQueueDrained();
  }
}
