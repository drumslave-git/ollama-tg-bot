import { errorMessage } from "../../logging/index.js";
import { chatComplete } from "../../llm/client.js";
import { embedOne } from "../../llm/embeddings.js";
import { getSettings } from "../../db/index.js";
import { beginJobProcessing } from "../../debug/job-report.js";
import {
  buildMemoryMergeMessages,
  getMemoryMergeResponseFormat,
  parseMemoryBlock,
} from "./merge-prompt.js";
import {
  getEntriesFor,
  deleteEntries,
  listPendingEntities,
  type MemoryType,
} from "./db/entries.js";
import { getMemoryRecord, upsertMemory } from "./db/memory.js";

/** Tokens for the merge pass — a person's accumulated memory can be lengthy. */
export const MEMORY_MERGE_NUM_PREDICT = 1536;

function splitLines(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export interface ConsolidateDeps {
  /** Merge existing + incoming facts into one document. Returns "" when empty. */
  mergeMemory: (
    type: MemoryType,
    existing: string[],
    incoming: string[],
  ) => Promise<string>;
  /** Embed the merged document for semantic recall. */
  embedText: (text: string) => Promise<number[]>;
}

async function defaultMergeMemory(
  type: MemoryType,
  existing: string[],
  incoming: string[],
  traceTurnId?: number,
): Promise<string> {
  const settings = await getSettings();
  const messages = buildMemoryMergeMessages({ kind: type, existing, incoming });
  const raw = await chatComplete(messages, {
    model: settings.model,
    auxiliary: true,
    numPredict: MEMORY_MERGE_NUM_PREDICT,
    responseFormat: getMemoryMergeResponseFormat(),
    traceLabel: "memory consolidation",
    traceTurnId,
  });
  return parseMemoryBlock(raw);
}

/** Real dependencies; `traceTurnId` routes the merge LLM call into a job trace. */
export function defaultConsolidateDeps(traceTurnId?: number): ConsolidateDeps {
  return {
    mergeMemory: (type, existing, incoming) =>
      defaultMergeMemory(type, existing, incoming, traceTurnId),
    embedText: (text) => embedOne(text),
  };
}

export interface ConsolidateResult {
  /** Whether the consolidated record's content changed (or was created). */
  changed: boolean;
  /** Number of raw entries folded in and removed. */
  consumed: number;
}

/**
 * Fold one entity's pending `memory_entry` rows into its consolidated `memory`
 * record: merge with the existing document, embed, upsert, then delete the
 * processed entries. Snapshotting entry ids up front means notes written while
 * this runs survive for the next pass.
 */
export async function consolidateEntity(
  type: MemoryType,
  entityId: string | null,
  deps: ConsolidateDeps = defaultConsolidateDeps(),
): Promise<ConsolidateResult> {
  const entries = await getEntriesFor(type, entityId);
  if (entries.length === 0) return { changed: false, consumed: 0 };

  const ids = entries.map((e) => e.id);
  const existingRecord = await getMemoryRecord(type, entityId);
  const existing = existingRecord ? splitLines(existingRecord.content) : [];
  const incoming = entries.map((e) => e.content);

  const merged = (await deps.mergeMemory(type, existing, incoming)).trim();
  let changed = false;
  if (merged) {
    const embedding = await deps.embedText(merged);
    if (embedding.length > 0) {
      await upsertMemory({ type, entityId, content: merged, embedding });
      changed = merged !== (existingRecord?.content.trim() ?? "");
    }
  }
  // Drop the processed notes whether or not anything merged: they have been
  // considered, and re-merging the same raw notes daily would be wasteful.
  await deleteEntries(ids);
  return { changed, consumed: ids.length };
}

export interface MemoryConsolidationSummary {
  entities: number;
  changed: number;
  consumed: number;
}

/**
 * One full consolidation run over every entity with pending entries, recorded as
 * a single background-job processing row (drives the Memory Debug pages).
 */
export async function runMemoryConsolidation(): Promise<MemoryConsolidationSummary> {
  const report = await beginJobProcessing("memory");
  const deps = defaultConsolidateDeps(report?.traceId);
  const pending = await listPendingEntities();
  report?.note("Scan entries", `Found ${pending.length} entit(y/ies) with pending notes`);

  let changed = 0;
  let consumed = 0;
  try {
    for (const { type, entityId } of pending) {
      const result = await consolidateEntity(type, entityId, deps);
      consumed += result.consumed;
      if (result.changed) changed += 1;
      report?.note(
        `Entity · ${type}${entityId ? `:${entityId}` : ""}`,
        result.changed
          ? `Consolidated ${result.consumed} note(s)`
          : `Processed ${result.consumed} note(s), no change`,
      );
    }
    report?.complete("processed", {
      summary: `${pending.length} entities, ${changed} updated, ${consumed} notes consumed`,
    });
  } catch (err) {
    report?.complete("error", { summary: errorMessage(err) });
    throw err;
  }
  return { entities: pending.length, changed, consumed };
}
