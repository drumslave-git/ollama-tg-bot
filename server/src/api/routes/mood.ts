import { Router } from "express";
import { 
  listPersonalities, getPersonalityById, createPersonality, 
  updatePersonalityById, deletePersonalityById, normalizePersonalityName, 
  normalizePersonalityPrompt, normalizePersonalityMoodDefaults 
} from "../../db/personalities.js";
import { getMoodStateView, resetMoodState, saveMoodState, tickMoodCooldown } from "../../db/mood.js";
import { buildMoodPayload } from "../../dashboard-payloads.js";
import { normalizeMoodValues } from "../../mood.js";
import { getSettings, updateSettings } from "../../db/database.js";

export const moodRouter = Router();

moodRouter.get("/", (_req, res) => {
  try {
    res.json(buildMoodPayload());
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to load mood",
    });
  }
});

moodRouter.get("/personalities", (_req, res) => {
  res.json({ personalities: listPersonalities() });
});

moodRouter.get("/personality/:id", (req, res) => {
  const personality = getPersonalityById(Number(req.params.id));
  if (!personality) return res.status(404).json({ error: "Personality not found" });
  res.json({ personality });
});

moodRouter.post("/personality", (req, res) => {
  const name = normalizePersonalityName(req.body.name);
  const prompt = normalizePersonalityPrompt(req.body.prompt);
  if (!name || !prompt) return res.status(400).json({ error: "Invalid personality data" });

  const moodDefaults = normalizePersonalityMoodDefaults(req.body.moodDefaults);
  const personality = createPersonality(name, prompt, moodDefaults);
  res.json({ personality });
});

moodRouter.patch("/personality/:id", (req, res) => {
  const id = Number(req.params.id);
  const patch: Parameters<typeof updatePersonalityById>[1] = {};
  if (req.body.name !== undefined) patch.name = normalizePersonalityName(req.body.name);
  if (req.body.prompt !== undefined) patch.prompt = normalizePersonalityPrompt(req.body.prompt);
  if (req.body.moodDefaults !== undefined) patch.moodDefaults = normalizePersonalityMoodDefaults(req.body.moodDefaults);

  const personality = updatePersonalityById(id, patch);
  res.json({ personality });
});

moodRouter.delete("/personality/:id", (req, res) => {
  deletePersonalityById(Number(req.params.id));
  res.json({ ok: true });
});

moodRouter.get("/state", (_req, res) => {
  res.json(getMoodStateView());
});

moodRouter.patch("/state", (req, res) => {
  try {
    if (req.body.cooldownMinutes !== undefined) {
      const settings = getSettings();
      updateSettings({ ...settings, moodCooldownMinutes: Number(req.body.cooldownMinutes) });
    }
    if (req.body.current) {
      const state = getMoodStateView();
      const values = normalizeMoodValues(req.body.current);
      saveMoodState({ ...state, ...values });
    }
    res.json(buildMoodPayload());
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Error" });
  }
});

moodRouter.post("/state/reset", (_req, res) => {
  resetMoodState();
  res.json(buildMoodPayload());
});

moodRouter.post("/state/tick", (_req, res) => {
  tickMoodCooldown();
  res.json(buildMoodPayload());
});
