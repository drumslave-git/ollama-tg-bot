import { Router } from "express";
import {
  listAllMemory,
  replaceMemoryContent,
  deleteMemory,
} from "./memory.js";
import {
  listAllEntries,
  addMemoryEntry,
  updateEntryContent,
  deleteEntryById,
  MIN_FACT_LENGTH,
  MAX_FACT_LENGTH,
  type MemoryType,
} from "./entries.js";
import { getMemoryConfig, updateMemoryConfig } from "./config.js";

function normalizeType(value: unknown): MemoryType | null {
  return value === "user" || value === "general" ? value : null;
}

type ContentResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** Validate a memory note/content with a precise, user-facing error message. */
function validateContent(value: unknown): ContentResult {
  if (typeof value !== "string") {
    return { ok: false, error: "Content is required." };
  }
  const trimmed = value.trim();
  if (trimmed.length < MIN_FACT_LENGTH) {
    return {
      ok: false,
      error: `Content must be at least ${MIN_FACT_LENGTH} characters.`,
    };
  }
  if (trimmed.length > MAX_FACT_LENGTH) {
    return {
      ok: false,
      error: `Content is too long: ${trimmed.length} characters (max ${MAX_FACT_LENGTH}).`,
    };
  }
  return { ok: true, value: trimmed };
}

export const memoriesRouter = Router();

// Consolidated memory records
memoriesRouter.get("/memory", async (_req, res) => {
  res.json({ records: await listAllMemory() });
});

memoriesRouter.patch("/memory/:id", async (req, res) => {
  const content = validateContent(req.body.content);
  if (!content.ok) return res.status(400).json({ error: content.error });
  const record = await replaceMemoryContent(Number(req.params.id), content.value);
  if (!record) return res.status(404).json({ error: "Memory record not found." });
  res.json({ record });
});

memoriesRouter.delete("/memory/:id", async (req, res) => {
  await deleteMemory(Number(req.params.id));
  res.json({ ok: true });
});

// Pending raw entries (awaiting consolidation) — full CRUD from the dashboard
memoriesRouter.get("/entries", async (_req, res) => {
  res.json({ entries: await listAllEntries() });
});

memoriesRouter.post("/entries", async (req, res) => {
  const type = normalizeType(req.body.type);
  if (!type) {
    return res.status(400).json({ error: "type must be 'user' or 'general'." });
  }
  const content = validateContent(req.body.content);
  if (!content.ok) return res.status(400).json({ error: content.error });
  const entityId =
    type === "general"
      ? null
      : typeof req.body.entityId === "string" && req.body.entityId.trim()
        ? req.body.entityId.trim()
        : null;
  if (type === "user" && !entityId) {
    return res.status(400).json({ error: "entityId is required for type 'user'." });
  }
  const entry = await addMemoryEntry(type, entityId, content.value);
  if (!entry) return res.status(400).json({ error: "Could not save entry." });
  res.json({ entry });
});

memoriesRouter.patch("/entries/:id", async (req, res) => {
  const content = validateContent(req.body.content);
  if (!content.ok) return res.status(400).json({ error: content.error });
  const entry = await updateEntryContent(Number(req.params.id), content.value);
  if (!entry) return res.status(404).json({ error: "Memory note not found." });
  res.json({ entry });
});

memoriesRouter.delete("/entries/:id", async (req, res) => {
  await deleteEntryById(Number(req.params.id));
  res.json({ ok: true });
});

// Config
memoriesRouter.get("/config", async (_req, res) => {
  res.json(await getMemoryConfig());
});

memoriesRouter.patch("/config", async (req, res) => {
  try {
    const body = req.body as Partial<{ enabled: boolean; runHour: number }>;
    const updated = await updateMemoryConfig({
      enabled: body.enabled,
      runHour: body.runHour,
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Invalid memory config",
    });
  }
});

export function createMemoriesRouter(): Router {
  return memoriesRouter;
}
