import type { PipelineTurnState } from "../../contracts/index.js";
import { getTaskIdByMessage } from "./db/task-messages.js";

/**
 * Per-turn context for the always-on tasks MCP tools.
 *
 * MCP tools are global and receive no per-turn data, but task management must be
 * bound to the current chat and gated to the owner. The message queue processes
 * one addressed turn at a time and `systemPromptHost` sets this context before
 * the main-reply tool loop runs, so a file-level variable is safe: every
 * addressed turn overwrites it before any tool call can read it.
 */
export interface TaskTurnContext {
  /** Telegram chat id the task fires into. */
  chatId: number;
  /** Conversation/entity key (same value shown in the `[SESSION]` block). */
  entityId: string;
  /** Current speaker's user id. */
  userId: string | null;
  /** Whether the current speaker is the bot owner. */
  isOwner: boolean;
  inGroup: boolean;
  messageThreadId: number | null;
  /** Task id when this turn replies to one of that task's fired messages. */
  repliedTaskId: number | null;
}

let current: TaskTurnContext | null = null;

export function setTaskTurnContext(ctx: TaskTurnContext): void {
  current = ctx;
}

export function getTaskTurnContext(): TaskTurnContext | null {
  return current;
}

export function clearTaskTurnContext(): void {
  current = null;
}

interface RepliedMessageShape {
  reply_to_message?: { message_id?: number; from?: { id?: number } };
}

/** Resolve the task id a turn replies to, when it replies to a bot task message. */
async function resolveRepliedTaskId(
  state: PipelineTurnState,
): Promise<number | null> {
  const chatId = state.chatId;
  if (chatId == null) return null;
  const message = state.telegram.message as RepliedMessageShape | undefined;
  const replied = message?.reply_to_message;
  const botId = state.telegram.me?.id;
  if (!replied?.message_id || botId == null || replied.from?.id !== botId) {
    return null;
  }
  return getTaskIdByMessage(String(chatId), replied.message_id);
}

/** Capture the current turn's chat/owner context for the tasks tools. */
export async function captureTaskTurnContext(
  state: PipelineTurnState,
): Promise<void> {
  if (state.chatId == null) {
    current = null;
    return;
  }
  setTaskTurnContext({
    chatId: state.chatId,
    entityId: state.convKey ?? String(state.chatId),
    userId: state.userId ?? null,
    isOwner: state.currentSpeakerIsOwner === true,
    inGroup: state.inGroup === true,
    messageThreadId: state.messageThreadId ?? null,
    repliedTaskId: await resolveRepliedTaskId(state),
  });
}
