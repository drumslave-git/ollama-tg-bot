import { createHash } from "node:crypto";
import { cleanMemoryDocument, type MemoryLlmConfig } from "./maintain.js";
import type { MemoryModuleConfig } from "./module-config.js";
import { memoryJobDebug } from "./job-debug.js";
import { beginJobProcessing } from "../../debug/job-report.js";

function maintenanceSummary(
  processed: number,
  skipped: number,
  interrupted: boolean,
): string {
  const parts = [`${processed} processed`];
  if (skipped > 0) parts.push(`${skipped} skipped`);
  if (interrupted) parts.push("interrupted");
  return parts.join(", ");
}

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
  getConfig: () => Promise<MemoryModuleConfig>;
  listUserMemories: () => Promise<{ id: string; content: string }[]>;
  listGroupMemories: () => Promise<{ id: string; content: string }[]>;
  getGeneralContent: () => Promise<string>;
  getRecordFingerprint: (key: string) => Promise<string | null>;
  setRecordFingerprint: (key: string, fingerprint: string) => Promise<void>;
  writeUserMemory: (id: string, lines: string[]) => Promise<void>;
  writeGroupMemory: (id: string, lines: string[]) => Promise<void>;
  writeGeneralMemory: (lines: string[]) => Promise<void>;
  buildCleanupConfig: (traceTurnId?: number) => Promise<{
    model: string;
    llmTimeoutSec: number;
    llm: MemoryLlmConfig;
  }>;
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

async function collectRecords(
  deps: MemoryQueueSchedulerDeps,
): Promise<MemoryRecord[]> {
  const records: MemoryRecord[] = [];
  for (const r of await deps.listUserMemories()) {
    if (!r.content.trim()) continue;
    records.push({ kind: "user", key: `user:${r.id}`, id: r.id, content: r.content });
  }
  for (const r of await deps.listGroupMemories()) {
    if (!r.content.trim()) continue;
    records.push({ kind: "group", key: `group:${r.id}`, id: r.id, content: r.content });
  }
  const general = await deps.getGeneralContent();
  if (general.trim()) {
    records.push({ kind: "general", key: "general", id: null, content: general });
  }
  return records;
}

async function writeBack(
  record: MemoryRecord,
  lines: string[],
  deps: MemoryQueueSchedulerDeps,
): Promise<void> {
  if (record.kind === "user" && record.id) await deps.writeUserMemory(record.id, lines);
  else if (record.kind === "group" && record.id) await deps.writeGroupMemory(record.id, lines);
  else if (record.kind === "general") await deps.writeGeneralMemory(lines);
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
    const report = await beginJobProcessing("memory");
    deps.logEvent?.("memory_job_started", {});

    let processed = 0;
    let skipped = 0;
    let interrupted = false;

    try {
      // The cleanup chatComplete forwards traceTurnId, so the maintenance LLM
      // call's request/response are captured as entries on this run.
      const cfg = await deps.buildCleanupConfig(report?.traceId);
      const llm = cfg.llm;

      const records = await collectRecords(deps);
      report?.note("Scan records", `Found ${records.length} memory record(s)`);

      for (const record of records) {
        if (deps.getQueueSize() > 0) {
          interrupted = true;
          break;
        }
        const fp = fingerprint(record.content);
        if ((await deps.getRecordFingerprint(record.key)) === fp) {
          skipped += 1;
          report?.note(`Skipped · ${record.key}`, "Unchanged since last maintenance");
          continue;
        }

        const cleaned = await cleanMemoryDocument(record.kind, record.content, llm);
        await writeBack(record, cleaned, deps);

        const storedContent = cleaned.join("\n");
        await deps.setRecordFingerprint(record.key, fingerprint(storedContent));
        const changed = storedContent.trim() !== record.content.trim();
        processed += 1;
        report?.note(
          `Record · ${record.key}`,
          changed ? `Updated (${record.kind})` : "No memory changes",
        );
      }
      if (interrupted) report?.note("Interrupted", "Queue activity resumed");
      deps.logEvent?.("memory_job_finished", {});
      report?.complete("processed", {
        summary: maintenanceSummary(processed, skipped, interrupted),
      });
    } catch (err) {
      deps.logEventError?.("memory_job_failed", err, {});
      report?.complete("error", {
        summary: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (deps.getQueueSize() === 0) setStatus("idle");
    }
  }

  async function schedule(): Promise<void> {
    if (timer) clearTimeout(timer);
    if (deps.getQueueSize() > 0) {
      memoryJobDebug.cancelScheduled();
      setStatus("idle");
      return;
    }
    const delayMs = (await deps.getConfig()).maintenanceDebounceSec * 1000;
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
      void schedule();
    },
    getStatus(): MemoryJobStatus {
      return status;
    },
  };
}
