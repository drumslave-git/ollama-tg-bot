import { Router } from "express";
import { MIN_FACT_LENGTH, normalizeEntityId } from "./memory-facts.js";
import {
  listAllUserFacts,
  listUserFacts,
  replaceUserMemory,
  updateUserFactById,
  deleteUserFactById,
  clearUserFactsForUser,
  createUserFact,
} from "./user-memory.js";
import {
  listAllGroupFacts,
  listGroupFacts,
  replaceGroupMemory,
  updateGroupFactById,
  deleteGroupFactById,
  clearGroupFactsForGroup,
  createGroupFact,
} from "./group-memory.js";
import {
  listGeneralFacts,
  createGeneralFact,
  updateGeneralFactById,
  deleteGeneralFactById,
  clearAllGeneralFacts,
} from "./general-memory.js";

function normalizeMemoryContent(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= MIN_FACT_LENGTH ? trimmed : null;
}

import {
  getMemoryModuleConfig,
  updateMemoryModuleConfig,
} from "./module-config.js";
import { getMemoryJobDebugSnapshot } from "../index.js";
import { getMemoryJobRunDetail } from "../index.js";

export const memoriesRouter = Router();
memoriesRouter.get("/user", async (_req, res) => {
  res.json({ facts: await listAllUserFacts() });
});

memoriesRouter.get("/user/:userId", async (req, res) => {
  res.json({ facts: await listUserFacts(req.params.userId) });
});

memoriesRouter.post("/user", async (req, res) => {
  const userId = normalizeEntityId(req.body.userId);
  const text = normalizeMemoryContent(req.body.fact);
  if (!userId || !text) return res.status(400).json({ error: "Invalid data" });
  const fact = await createUserFact(userId, text);
  res.json({ fact });
});

memoriesRouter.put("/user/:userId", async (req, res) => {
  const userId = normalizeEntityId(req.params.userId);
  if (!userId) return res.status(400).json({ error: "Invalid user id" });
  const facts = Array.isArray(req.body.facts) ? req.body.facts.map(String) : [];
  await replaceUserMemory(userId, facts);
  res.json({ ok: true });
});

memoriesRouter.patch("/user/:id", async (req, res) => {
  const text = normalizeMemoryContent(req.body.fact);
  if (text == null) return res.status(400).json({ error: "Invalid fact" });
  const updated = await updateUserFactById(Number(req.params.id), text);
  res.json({ fact: updated });
});

memoriesRouter.delete("/user/:id", async (req, res) => {
  await deleteUserFactById(Number(req.params.id));
  res.json({ ok: true });
});

memoriesRouter.delete("/user/all/:userId", async (req, res) => {
  await clearUserFactsForUser(req.params.userId);
  res.json({ ok: true });
});

// Group memories
memoriesRouter.get("/group", async (_req, res) => {
  res.json({ facts: await listAllGroupFacts() });
});

memoriesRouter.get("/group/:groupId", async (req, res) => {
  res.json({ facts: await listGroupFacts(req.params.groupId) });
});

memoriesRouter.post("/group", async (req, res) => {
  const groupId = normalizeEntityId(req.body.groupId);
  const text = normalizeMemoryContent(req.body.fact);
  if (!groupId || !text) return res.status(400).json({ error: "Invalid data" });
  const fact = await createGroupFact(groupId, text);
  res.json({ fact });
});

memoriesRouter.put("/group/:groupId", async (req, res) => {
  const groupId = normalizeEntityId(req.params.groupId);
  if (!groupId) return res.status(400).json({ error: "Invalid group id" });
  const facts = Array.isArray(req.body.facts) ? req.body.facts.map(String) : [];
  await replaceGroupMemory(groupId, facts);
  res.json({ ok: true });
});

memoriesRouter.patch("/group/:id", async (req, res) => {
  const text = normalizeMemoryContent(req.body.fact);
  if (text == null) return res.status(400).json({ error: "Invalid fact" });
  const updated = await updateGroupFactById(Number(req.params.id), text);
  res.json({ fact: updated });
});

memoriesRouter.delete("/group/:id", async (req, res) => {
  await deleteGroupFactById(Number(req.params.id));
  res.json({ ok: true });
});

memoriesRouter.delete("/group/all/:groupId", async (req, res) => {
  await clearGroupFactsForGroup(req.params.groupId);
  res.json({ ok: true });
});

// General memories
memoriesRouter.get("/general", async (_req, res) => {
  res.json({ facts: await listGeneralFacts() });
});

memoriesRouter.post("/general", async (req, res) => {
  const text = normalizeMemoryContent(req.body.text);
  if (text == null) return res.status(400).json({ error: "Invalid fact" });
  const fact = await createGeneralFact(text);
  res.json({ ok: !!fact, fact });
});

memoriesRouter.patch("/general/:id", async (req, res) => {
  const text = normalizeMemoryContent(req.body.text);
  if (text == null) return res.status(400).json({ error: "Invalid fact" });
  const updated = await updateGeneralFactById(Number(req.params.id), text);
  res.json({ ok: !!updated });
});

memoriesRouter.delete("/general/:id", async (req, res) => {
  await deleteGeneralFactById(Number(req.params.id));
  res.json({ ok: true });
});

memoriesRouter.delete("/general", async (_req, res) => {
  await clearAllGeneralFacts();
  res.json({ ok: true });
});

memoriesRouter.get("/config", async (_req, res) => {
  res.json(await getMemoryModuleConfig());
});

memoriesRouter.get("/debug", (_req, res) => {
  res.json(getMemoryJobDebugSnapshot());
});

memoriesRouter.get("/debug/runs/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid run id" });
  }
  const run = getMemoryJobRunDetail(id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  res.json({ run });
});

memoriesRouter.patch("/config", async (req, res) => {
  try {
    const body = req.body as Partial<{ maintenanceDebounceSec: number }>;
    const updated = await updateMemoryModuleConfig({
      maintenanceDebounceSec: body.maintenanceDebounceSec,
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
