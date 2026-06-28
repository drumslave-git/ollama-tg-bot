import { Router } from "express";
import type { FeatureDbHost } from "../../../contracts/index.js";
import { normalizeMoodValues } from "../values.js";
import {
  listPersonalities,
  getPersonalityById,
  createPersonality,
  updatePersonalityById,
  deletePersonalityById,
  normalizePersonalityName,
  normalizePersonalityPrompt,
  normalizePersonalityMoodDefaults,
  resolveActivePersonalityId,
} from "./personalities.js";
import {
  getMoodStateView,
  resetMoodState,
  saveMoodState,
  tickMoodCooldown,
} from "./mood.js";

let host: FeatureDbHost | null = null;

export function configureMoodRoutes(nextHost: FeatureDbHost): void {
  host = nextHost;
}

function requireHost(): FeatureDbHost {
  if (!host?.buildMoodPayload || !host.getSettings || !host.updateSettings) {
    throw new Error("Mood feature routes not configured");
  }
  return host;
}

export const moodRouter = Router();

moodRouter.get("/", async (_req, res) => {
  try {
    res.json(await requireHost().buildMoodPayload!());
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to load mood",
    });
  }
});

moodRouter.get("/personalities", async (_req, res) => {
  try {
    const h = requireHost();
    const settings = await h.getSettings();
    res.json({
      personalities: await listPersonalities(),
      activePersonalityId: await resolveActivePersonalityId(
        Number(settings.activePersonalityId ?? 0),
      ),
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to load personalities",
    });
  }
});

moodRouter.get("/personality/:id", async (req, res) => {
  const personality = await getPersonalityById(Number(req.params.id));
  if (!personality) return res.status(404).json({ error: "Personality not found" });
  res.json({ personality });
});

moodRouter.post("/personality", async (req, res) => {
  const name = normalizePersonalityName(req.body.name);
  const prompt = normalizePersonalityPrompt(req.body.prompt);
  if (!name || !prompt) return res.status(400).json({ error: "Invalid personality data" });

  const moodDefaults = normalizePersonalityMoodDefaults(req.body.moodDefaults);
  const personality = await createPersonality(name, prompt, moodDefaults);
  res.json({ personality });
});

moodRouter.patch("/personality/:id", async (req, res) => {
  const id = Number(req.params.id);
  const patch: Parameters<typeof updatePersonalityById>[1] = {};
  if (req.body.name !== undefined) patch.name = normalizePersonalityName(req.body.name);
  if (req.body.prompt !== undefined) patch.prompt = normalizePersonalityPrompt(req.body.prompt);
  if (req.body.moodDefaults !== undefined) {
    patch.moodDefaults = normalizePersonalityMoodDefaults(req.body.moodDefaults);
  }

  const personality = await updatePersonalityById(id, patch);
  res.json({ personality });
});

moodRouter.delete("/personality/:id", async (req, res) => {
  try {
    const h = requireHost();
    const id = Number(req.params.id);
    const settings = await h.getSettings();
    const wasActive = Number(settings.activePersonalityId ?? 0) === id;

    if (!(await deletePersonalityById(id))) {
      return res.status(404).json({ error: "Personality not found" });
    }

    let activePersonalityId = await resolveActivePersonalityId(
      Number(settings.activePersonalityId ?? 0),
    );
    if (wasActive) {
      const updated = await h.updateSettings({ activePersonalityId: 0 });
      activePersonalityId = await resolveActivePersonalityId(
        Number(updated.activePersonalityId ?? 0),
      );
    }

    res.json({ ok: true, activePersonalityId });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Failed to delete personality",
    });
  }
});

moodRouter.get("/state", async (_req, res) => {
  res.json(await getMoodStateView());
});

moodRouter.patch("/state", async (req, res) => {
  try {
    const h = requireHost();
    if (req.body.cooldownMinutes !== undefined) {
      const settings = await h.getSettings();
      await h.updateSettings({
        ...settings,
        moodCooldownMinutes: Number(req.body.cooldownMinutes),
      });
    }
    if (req.body.current) {
      const state = await getMoodStateView();
      const values = normalizeMoodValues(req.body.current);
      await saveMoodState({ ...state, ...values });
    }
    res.json(await h.buildMoodPayload!());
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Error" });
  }
});

moodRouter.post("/state/reset", async (_req, res) => {
  await resetMoodState();
  res.json(await requireHost().buildMoodPayload!());
});

moodRouter.post("/state/tick", async (_req, res) => {
  await tickMoodCooldown();
  res.json(await requireHost().buildMoodPayload!());
});

export function createMoodRouter(): Router {
  return moodRouter;
}
