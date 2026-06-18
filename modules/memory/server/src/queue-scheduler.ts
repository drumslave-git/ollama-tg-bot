import {
  persistMemories,
  type MemoryPersistCallbacks,
} from "./persist.js";
import type { MemoryModuleConfig } from "./module-config.js";
import type { KnownParticipant, MemoryExtractInput } from "./extract-prompt.js";
import { memoryJobDebug } from "./job-debug.js";

export type MemoryJobStatus = "idle" | "scheduled" | "running";

type HistoryRow = { role: string; content: string };

function parseUserIdFromRole(role: string): string | null {
  if (!role.startsWith("user:")) return null;
  const parts = role.split(":");
  return parts[parts.length - 1] || null;
}

export interface MemoryQueueSchedulerDeps {
  getQueueSize: () => number;
  getConfig: () => MemoryModuleConfig;
  listHistoryChatKeys: (limit: number) => string[];
  getHistory: (chatKey: string) => HistoryRow[];
  loadChatParticipants: (
    convKey: string,
    currentUserId: string | null,
  ) => KnownParticipant[];
  memoryCallbacks: MemoryPersistCallbacks;
  getUserFacts: (userId: string) => string[];
  getGroupFacts: (groupId: string) => string[];
  getGeneralFacts: () => string[];
  buildPersistConfig: () => {
    extract: Parameters<typeof persistMemories>[1]["extract"];
    merge: Parameters<typeof persistMemories>[1]["merge"];
  };
  onStatusChange?: (status: MemoryJobStatus) => void;
  logEvent?: (event: string, fields?: Record<string, unknown>) => void;
  logEventError?: (
    event: string,
    err: unknown,
    fields?: Record<string, unknown>,
  ) => void;
}

function buildMemoryInputFromHistory(
  convKey: string,
  messages: HistoryRow[],
  deps: MemoryQueueSchedulerDeps,
): MemoryExtractInput | null {
  if (messages.length === 0) return null;

  let userMessage = "";
  let assistantReply = "";
  let userId: string | null = null;
  const isGroup = convKey.includes(":group:");

  for (let i = messages.length - 1; i >= 0; i--) {
    const row = messages[i]!;
    if (!assistantReply && row.role === "assistant") {
      assistantReply = row.content.replace(/^\[assistant said\]:\s*/i, "");
      continue;
    }
    if (!userMessage && row.role.startsWith("user:")) {
      userMessage = row.content;
      userId = parseUserIdFromRole(row.role);
      break;
    }
  }

  if (!userMessage && !assistantReply) return null;

  const groupChatId = isGroup
    ? (convKey.match(/group:([^:]+)/)?.[1] ?? null)
    : null;

  const participants = deps.loadChatParticipants(convKey, userId);

  return {
    userMessage: userMessage || "(no user text)",
    replyContext: null,
    assistantReply,
    existingUserFacts: userId ? deps.getUserFacts(userId) : [],
    existingGroupFacts: groupChatId ? deps.getGroupFacts(groupChatId) : [],
    existingGeneralFacts: deps.getGeneralFacts(),
    isGroupChat: isGroup,
    currentSpeaker: userId
      ? {
          userId,
          label:
            participants.find((p) => p.userId === userId)?.label ?? userId,
        }
      : null,
    knownParticipants: participants,
  };
}

export function createMemoryQueueScheduler(deps: MemoryQueueSchedulerDeps) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let status: MemoryJobStatus = "idle";

  function setStatus(next: MemoryJobStatus): void {
    status = next;
    memoryJobDebug.setStatus(next);
    deps.onStatusChange?.(next);
  }

  async function runJob(): Promise<void> {
    if (deps.getQueueSize() > 0) return;
    setStatus("running");
    memoryJobDebug.startRun();
    deps.logEvent?.("memory_job_started", {});

    try {
      const llm = deps.buildPersistConfig();
      const convKeys = deps.listHistoryChatKeys(30);
      memoryJobDebug.addStep("Scan chats", { chatCount: convKeys.length });
      for (const convKey of convKeys) {
        if (deps.getQueueSize() > 0) {
          memoryJobDebug.addStep("Interrupted by queue activity", { convKey });
          break;
        }
        const messages = deps.getHistory(convKey);
        const input = buildMemoryInputFromHistory(convKey, messages, deps);
        if (!input) continue;

        const userId = input.currentSpeaker?.userId ?? null;
        const groupChatId = input.isGroupChat
          ? (convKey.match(/group:([^:]+)/)?.[1] ?? null)
          : null;

        memoryJobDebug.addStep("Extract memories", {
          convKey,
          userId,
          groupChatId,
          isGroupChat: input.isGroupChat,
        });
        await persistMemories(
          { userId, groupChatId, input },
          llm,
          deps.memoryCallbacks,
        );
        memoryJobDebug.addStep("Persisted memories", { convKey, userId, groupChatId });
      }
      memoryJobDebug.completeRun();
      deps.logEvent?.("memory_job_finished", {});
    } catch (err) {
      memoryJobDebug.failRun(err);
      deps.logEventError?.("memory_job_failed", err, {});
    } finally {
      if (deps.getQueueSize() === 0) setStatus("idle");
    }
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    if (deps.getQueueSize() > 0) {
      memoryJobDebug.cancelScheduled();
      setStatus("idle");
      return;
    }
    setStatus("scheduled");
    memoryJobDebug.scheduleRun();
    const delayMs = deps.getConfig().extractionDebounceSec * 1000;
    timer = setTimeout(() => {
      timer = null;
      if (deps.getQueueSize() > 0) {
        setStatus("idle");
        return;
      }
      void runJob();
    }, delayMs);
  }

  return {
    onQueueActivity(): void {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (deps.getQueueSize() > 0) {
        memoryJobDebug.cancelScheduled();
        setStatus("idle");
        return;
      }
      schedule();
    },
    getStatus(): MemoryJobStatus {
      return status;
    },
  };
}
