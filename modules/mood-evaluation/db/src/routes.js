import { Router } from "express";
import { normalizeMoodValues } from "@llm-tg-bot/modules-mood-evaluation";
import { listPersonalities, getPersonalityById, createPersonality, updatePersonalityById, deletePersonalityById, normalizePersonalityName, normalizePersonalityPrompt, normalizePersonalityMoodDefaults, } from "./personalities.js";
import { getMoodStateView, resetMoodState, saveMoodState, tickMoodCooldown, } from "./mood.js";
let host = null;
export function configureMoodRoutes(nextHost) {
    host = nextHost;
}
function requireHost() {
    if (!host?.buildMoodPayload || !host.getSettings || !host.updateSettings) {
        throw new Error("Mood module routes not configured");
    }
    return host;
}
export const moodRouter = Router();
moodRouter.get("/", (_req, res) => {
    try {
        res.json(requireHost().buildMoodPayload());
    }
    catch (err) {
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
    if (!personality)
        return res.status(404).json({ error: "Personality not found" });
    res.json({ personality });
});
moodRouter.post("/personality", (req, res) => {
    const name = normalizePersonalityName(req.body.name);
    const prompt = normalizePersonalityPrompt(req.body.prompt);
    if (!name || !prompt)
        return res.status(400).json({ error: "Invalid personality data" });
    const moodDefaults = normalizePersonalityMoodDefaults(req.body.moodDefaults);
    const personality = createPersonality(name, prompt, moodDefaults);
    res.json({ personality });
});
moodRouter.patch("/personality/:id", (req, res) => {
    const id = Number(req.params.id);
    const patch = {};
    if (req.body.name !== undefined)
        patch.name = normalizePersonalityName(req.body.name);
    if (req.body.prompt !== undefined)
        patch.prompt = normalizePersonalityPrompt(req.body.prompt);
    if (req.body.moodDefaults !== undefined) {
        patch.moodDefaults = normalizePersonalityMoodDefaults(req.body.moodDefaults);
    }
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
        const h = requireHost();
        if (req.body.cooldownMinutes !== undefined) {
            const settings = h.getSettings();
            h.updateSettings({
                ...settings,
                moodCooldownMinutes: Number(req.body.cooldownMinutes),
            });
        }
        if (req.body.current) {
            const state = getMoodStateView();
            const values = normalizeMoodValues(req.body.current);
            saveMoodState({ ...state, ...values });
        }
        res.json(h.buildMoodPayload());
    }
    catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Error" });
    }
});
moodRouter.post("/state/reset", (_req, res) => {
    resetMoodState();
    res.json(requireHost().buildMoodPayload());
});
moodRouter.post("/state/tick", (_req, res) => {
    tickMoodCooldown();
    res.json(requireHost().buildMoodPayload());
});
export function createMoodRouter() {
    return moodRouter;
}
