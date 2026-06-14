import { Router } from "express";
import { MIN_FACT_LENGTH, normalizeEntityId } from "../../db/memory-facts.js";
import { listAllUserFacts, listUserFacts, replaceUserMemory, updateUserFactById, deleteUserFactById, clearUserFactsForUser, createUserFact } from "../../db/user-memory.js";
import { listAllGroupFacts, listGroupFacts, replaceGroupMemory, updateGroupFactById, deleteGroupFactById, clearGroupFactsForGroup, createGroupFact } from "../../db/group-memory.js";
import { listGeneralFacts, createGeneralFact, updateGeneralFactById, deleteGeneralFactById, clearAllGeneralFacts } from "../../db/general-memory.js";

function normalizeMemoryContent(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= MIN_FACT_LENGTH ? trimmed : null;
}

export const memoriesRouter = Router();

// User memories
memoriesRouter.get("/user", (_req, res) => {
  res.json({ facts: listAllUserFacts() });
});

memoriesRouter.get("/user/:userId", (req, res) => {
  res.json({ facts: listUserFacts(req.params.userId) });
});

memoriesRouter.post("/user", (req, res) => {
  const userId = normalizeEntityId(req.body.userId);
  const text = normalizeMemoryContent(req.body.fact);
  if (!userId || !text) return res.status(400).json({ error: "Invalid data" });
  const fact = createUserFact(userId, text);
  res.json({ fact });
});

memoriesRouter.put("/user/:userId", (req, res) => {
  const userId = normalizeEntityId(req.params.userId);
  if (!userId) return res.status(400).json({ error: "Invalid user id" });
  const facts = Array.isArray(req.body.facts) ? req.body.facts.map(String) : [];
  replaceUserMemory(userId, facts);
  res.json({ ok: true });
});

memoriesRouter.patch("/user/:id", (req, res) => {
  const text = normalizeMemoryContent(req.body.fact);
  if (text == null) return res.status(400).json({ error: "Invalid fact" });
  const updated = updateUserFactById(Number(req.params.id), text);
  res.json({ fact: updated });
});

memoriesRouter.delete("/user/:id", (req, res) => {
  deleteUserFactById(Number(req.params.id));
  res.json({ ok: true });
});

memoriesRouter.delete("/user/all/:userId", (req, res) => {
  clearUserFactsForUser(req.params.userId);
  res.json({ ok: true });
});

// Group memories
memoriesRouter.get("/group", (_req, res) => {
  res.json({ facts: listAllGroupFacts() });
});

memoriesRouter.get("/group/:groupId", (req, res) => {
  res.json({ facts: listGroupFacts(req.params.groupId) });
});

memoriesRouter.post("/group", (req, res) => {
  const groupId = normalizeEntityId(req.body.groupId);
  const text = normalizeMemoryContent(req.body.fact);
  if (!groupId || !text) return res.status(400).json({ error: "Invalid data" });
  const fact = createGroupFact(groupId, text);
  res.json({ fact });
});

memoriesRouter.put("/group/:groupId", (req, res) => {
  const groupId = normalizeEntityId(req.params.groupId);
  if (!groupId) return res.status(400).json({ error: "Invalid group id" });
  const facts = Array.isArray(req.body.facts) ? req.body.facts.map(String) : [];
  replaceGroupMemory(groupId, facts);
  res.json({ ok: true });
});

memoriesRouter.patch("/group/:id", (req, res) => {
  const text = normalizeMemoryContent(req.body.fact);
  if (text == null) return res.status(400).json({ error: "Invalid fact" });
  const updated = updateGroupFactById(Number(req.params.id), text);
  res.json({ fact: updated });
});

memoriesRouter.delete("/group/:id", (req, res) => {
  deleteGroupFactById(Number(req.params.id));
  res.json({ ok: true });
});

memoriesRouter.delete("/group/all/:groupId", (req, res) => {
  clearGroupFactsForGroup(req.params.groupId);
  res.json({ ok: true });
});

// General memories
memoriesRouter.get("/general", (_req, res) => {
  res.json({ facts: listGeneralFacts() });
});

memoriesRouter.post("/general", (req, res) => {
  const text = normalizeMemoryContent(req.body.text);
  if (text == null) return res.status(400).json({ error: "Invalid fact" });
  const fact = createGeneralFact(text);
  res.json({ ok: !!fact, fact });
});

memoriesRouter.patch("/general/:id", (req, res) => {
  const text = normalizeMemoryContent(req.body.text);
  if (text == null) return res.status(400).json({ error: "Invalid fact" });
  const updated = updateGeneralFactById(Number(req.params.id), text);
  res.json({ ok: !!updated });
});

memoriesRouter.delete("/general/:id", (req, res) => {
  deleteGeneralFactById(Number(req.params.id));
  res.json({ ok: true });
});

memoriesRouter.delete("/general", (_req, res) => {
  clearAllGeneralFacts();
  res.json({ ok: true });
});
