import type { PipelineTurnState } from "../../contracts/index.js";

/**
 * Per-turn context for the always-on browse_web tool. Mirrors the
 * tasks feature: the message queue processes one addressed turn at a time, and
 * systemPromptHost sets this before the main-reply tool loop, so a module-level
 * variable is safe — every addressed turn overwrites it before any tool call.
 */
export interface BrowserTurnContext {
  chatId: number;
  entityId: string;
  userId: string | null;
  isOwner: boolean;
  messageThreadId: number | null;
}

let current: BrowserTurnContext | null = null;

export function getBrowserTurnContext(): BrowserTurnContext | null {
  return current;
}

export function captureBrowserTurnContext(state: PipelineTurnState): void {
  if (state.chatId == null) {
    current = null;
    return;
  }
  current = {
    chatId: state.chatId,
    entityId: state.convKey ?? String(state.chatId),
    userId: state.userId ?? null,
    isOwner: state.currentSpeakerIsOwner === true,
    messageThreadId: state.messageThreadId ?? null,
  };
}

export function clearBrowserTurnContext(): void {
  current = null;
}
