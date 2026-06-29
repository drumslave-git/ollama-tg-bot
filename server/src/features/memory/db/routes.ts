import { Router } from "express";
import {
  listAllMemory,
  replaceMemoryContent,
  deleteMemory,
} from "./memory.js";
import { listAllEntries, deleteEntryById } from "./entries.js";
import { getMemoryConfig, updateMemoryConfig } from "./config.js";

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

// Pending raw entries (awaiting consolidation)
memoriesRouter.get("/entries", async (_req, res) => {
  res.json({ entries: await listAllEntries() });
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
