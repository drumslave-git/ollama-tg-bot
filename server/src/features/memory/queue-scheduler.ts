import { createHash } from "node:crypto";
import { cleanMemoryDocument, type MemoryLlmConfig } from "./maintain.js";
import type { MemoryModuleConfig } from "./module-config.js";
import { memoryJobDebug } from "./job-debug.js";

export type MemoryJobStatus = "idle" | "scheduled" | "running";

type MemoryKind = "user" | "group" | "general";

interface MemoryRecord {
  kind: MemoryKind;
  /** Stable fingerprint key, e.g. `user:123`, `group:456`, `general`. */
  key: string;
  /** Entity id (null for general). */
  id: string | null;
  content: string;
}

export interface MemoryQueueSchedulerDeps {
  getQueueSize: () => number;
  getConfig: () => MemoryModuleConfig;
  listUserMemories: () => { id: string; content: string }[];
  listGroupMemories: () => { id: string; content: string }[];
  getGeneralContent: () => string;
  getRecordFingerprint: (key: string) => string | null;
  setRecordFingerprint: (key: string, fingerprint: string) => void;
  writeUserMemory: (id: string, lines: string[]) => void;
  writeGroupMemory: (id: string, lines: string[]) => void;
  writeGeneralMemory: (lines: string[]) => void;
  buildCleanupConfig: () => {
    model: string;
    llmTimeoutSec: number;
    llm: MemoryLlmConfig;
  };
  onStatusChange?: (status: MemoryJobStatus) => void;
  logEvent?: (event: string, fields?: Record<string, unknown>) => void;
  logEventError?: (
    event: string,
    err: unknown,
    fields?: Record<string, unknown>,
  ) => void;
}

function fingerprint(content: string): string {
  return createHash("sha256").update(content.trim()).digest("hex");
}

function collectRecords(deps: MemoryQueueSchedulerDeps): MemoryRecord[] {
  const records: MemoryRecord[] = [];
  for (const r of deps.listUserMemories()) {
    if (!r.content.trim()) continue;
    records.push({ kind: "user", key: `user:${r.id}`, id: r.id, content: r.content });
  }
  for (const r of deps.listGroupMemories()) {
    if (!r.content.trim()) continue;
    records.push({ kind: "group", key: `group:${r.id}`, id: r.id, content: r.content });
  }
  const general = deps.getGeneralContent();
  if (general.trim()) {
    records.push({ kind: "general", key: "general", id: null, content: general });
  }
  return records;
}

function writeBack(
  record: MemoryRecord,
  lines: string[],
  deps: MemoryQueueSchedulerDeps,
): void {
  if (record.kind === "user" && record.id) deps.writeUserMemory(record.id, lines);
  else if (record.kind === "group" && record.id) deps.writeGroupMemory(record.id, lines);
  else if (record.kind === "general") deps.writeGeneralMemory(lines);
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
    const session = memoryJobDebug.startRun();
    deps.logEvent?.("memory_job_started", {});

    try {
      const cfg = deps.buildCleanupConfig();
      const tracedCleanup = memoryJobDebug.wrapChatComplete(
        "memory maintenance",
        cfg.model,
        cfg.llmTimeoutSec,
        cfg.llm.chatComplete ??
          (async () => {
            throw new Error("cleanup chatComplete is not configured");
          }),
      );
      const llm: MemoryLlmConfig = { ...cfg.llm, chatComplete: tracedCleanup };

      const records = collectRecords(deps);
      session.setScanSummary(records.length);

      for (const record of records) {
        if (deps.getQueueSize() > 0) {
          session.markInterrupted();
          break;
        }
        const fp = fingerprint(record.content);
        if (deps.getRecordFingerprint(record.key) === fp) {
          session.skipChat(record.key, "Unchanged since last maintenance");
          continue;
        }

        session.beginChat(record.key, record.content);
        const cleaned = await cleanMemoryDocument(record.kind, record.content, llm);
        writeBack(record, cleaned, deps);

        const storedContent = cleaned.join("\n");
        deps.setRecordFingerprint(record.key, fingerprint(storedContent));
        const changed = storedContent.trim() !== record.content.trim();
        session.completeChat(record.key, changed, [record.kind]);
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
    const delayMs = deps.getConfig().maintenanceDebounceSec * 1000;
    const runAt = new Date(Date.now() + delayMs);
    setStatus("scheduled");
    memoryJobDebug.scheduleRun(runAt);
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
