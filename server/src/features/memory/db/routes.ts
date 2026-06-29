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
  type MemoryType,
} from "./entries.js";
import { getMemoryConfig, updateMemoryConfig } from "./config.js";

function normalizeType(value: unknown): MemoryType | null {
  return value === "user" || value === "general" ? value : null;
}

const MIN_CONTENT_LENGTH = 2;

function normalizeContent(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= MIN_CONTENT_LENGTH ? trimmed : null;
}

export const memoriesRouter = Router();

// Consolidated memory records
memoriesRouter.get("/memory", async (_req, res) => {
  res.json({ records: await listAllMemory() });
});

memoriesRouter.patch("/memory/:id", async (req, res) => {
  const text = normalizeContent(req.body.content);
  if (text == null) return res.status(400).json({ error: "Invalid content" });
  const record = await replaceMemoryContent(Number(req.params.id), text);
  if (!record) return res.status(404).json({ error: "Not found" });
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
  const content = normalizeContent(req.body.content);
  if (!type || !content) {
    return res.status(400).json({ error: "Invalid type or content" });
  }
  const entityId =
    type === "general"
      ? null
      : typeof req.body.entityId === "string" && req.body.entityId.trim()
        ? req.body.entityId.trim()
        : null;
  if (type === "user" && !entityId) {
    return res.status(400).json({ error: "entityId is required for type 'user'" });
  }
  const entry = await addMemoryEntry(type, entityId, content);
  if (!entry) return res.status(400).json({ error: "Could not save entry" });
  res.json({ entry });
});

memoriesRouter.patch("/entries/:id", async (req, res) => {
  const content = normalizeContent(req.body.content);
  if (content == null) return res.status(400).json({ error: "Invalid content" });
  const entry = await updateEntryContent(Number(req.params.id), content);
  if (!entry) return res.status(404).json({ error: "Not found" });
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
