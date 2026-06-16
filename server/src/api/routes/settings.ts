import { Router } from "express";
import { getSettings, updateSettings, type Settings } from "../../db/database.js";
import { buildSettingsPayload } from "../../dashboard-payloads.js";
import { getBot } from "../../bot/index.js";
import { resolveOwnerUsername } from "../../bot/resolve-owner.js";
import { ensureModelContextCache } from "../../llm/model-context-cache.js";
import {
  syncStickerCatalogFromSettings,
  getStickerCatalogState,
  refreshStickerCatalog,
} from "@llm-tg-bot/modules-sticker-selection";
import { logEvent, logEventError, type EventFields } from "../../event-log.js";
import type { BotHostLogging } from "@llm-tg-bot/modules-registry";
import { getResolvedSettings, getResolvedHistoryLimits, getContextBudgetForSettings } from "../../settings-runtime.js";
import { buildBaseSystemPrompt } from "../../prompts.js";
import { getVramAvailableGb, config } from "../../config.js";
import { listModels, checkHealth } from "../../llm/client.js";
import { snapNumPredict, minNumCtxForPredict, getHistoryLimits } from "../../settings-limits.js";
import { calculateContextBudget, modelContextInputFromTags } from "../../context-budget.js";
import { runWebSearch } from "@llm-tg-bot/modules-web-search";

const stickerCatalogLog: BotHostLogging = {
  logEvent: (event, fields) => logEvent(event, fields as EventFields),
  logEventError: (event, err, fields) =>
    logEventError(event, err, fields as EventFields),
};

function isTavilyConfigured(): boolean {
  return config.tavilyApiKey.length > 0;
}

async function checkTavilyHealth(): Promise<boolean> {
  if (!isTavilyConfigured()) return false;
  const result = await runWebSearch(
    { query: "test" },
    {
      apiKey: config.tavilyApiKey,
      maxResults: 1,
      log: {
        logEventError: (event, err, fields) =>
          logEventError(event, err, fields as never),
      },
    },
  );
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return true;
}

function stickerCatalogResponse() {
  const settings = getSettings();
  const catalog = getStickerCatalogState();
  return {
    enabled: settings.stickersEnabled,
    packName: catalog.packName || settings.stickerPackName,
    stickers: catalog.stickers,
    loaded: catalog.loaded,
    error: catalog.error,
  };
}

export const settingsRouter = Router();

settingsRouter.get("/", async (_req, res) => {
  try {
    res.json(await buildSettingsPayload());
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to load settings",
    });
  }
});

settingsRouter.patch("/", async (req, res) => {
  try {
    const body = req.body as Partial<Settings>;
    const allowed: (keyof Settings)[] = [
      "apiBaseUrl",
      "model",
      "activePersonalityId",
      "randomReplyEnabled",
      "randomReplyChance",
      "reactToEveryImage",
      "numPredict",
      "temperature",
      "topP",
      "topK",
      "repeatPenalty",
      "chatTimeoutSec",
      "visionMaxDimension",
      "ownerUsername",
      "stickersEnabled",
      "stickerPackName",
      "stickerReplyChance",
      "moodCooldownMinutes",
      "thinkingEnabled",
      "sendThinkingEnabled",
      "reasoningEffort",
      "maintenanceModeEnabled",
      "workflowSteps",
      "workflowNodes",
      "workflowEdges",
    ];
    const patch: Partial<Settings> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) patch[key] = body[key] as never;
    }

    if (body.ownerUsername !== undefined) {
      const raw = String(body.ownerUsername).trim();
      if (raw === "") {
        patch.ownerUsername = "";
        patch.ownerUserId = "";
      } else {
        const bot = getBot();
        patch.ownerUserId = await resolveOwnerUsername(bot.api, raw);
      }
    }

    const updated = updateSettings(patch);
    await ensureModelContextCache(updated.model, updated.apiBaseUrl);

    if (
      body.stickersEnabled !== undefined ||
      body.stickerPackName !== undefined
    ) {
      try {
        const bot = getBot();
        await syncStickerCatalogFromSettings(
          bot.api,
          updated as unknown as Record<string, unknown>,
          stickerCatalogLog,
        );
      } catch {
        // Bot may not be running during early setup; catalog syncs on startup.
      }
    }

    const resolved = getResolvedSettings(updated);
    res.json({
      ...resolved,
      baseSystemPrompt: buildBaseSystemPrompt(resolved),
      derivedHistoryLimits: getResolvedHistoryLimits(updated),
      contextBudget: getContextBudgetForSettings(updated),
      vramAvailableGb: getVramAvailableGb(),
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Invalid settings",
    });
  }
});

settingsRouter.get("/models", async (req, res) => {
  try {
    const host = typeof req.query.host === "string" ? req.query.host : undefined;
    const models = await listModels(host);
    res.json({ models });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch models";
    const status = message.includes("not configured") ? 400 : 502;
    res.status(status).json({ error: message });
  }
});

settingsRouter.get("/budget", async (req, res) => {
  try {
    const settings = getSettings();
    const model =
      typeof req.query.model === "string" && req.query.model.trim()
        ? req.query.model.trim()
        : settings.model;
    const numPredictRaw =
      typeof req.query.numPredict === "string"
        ? parseInt(req.query.numPredict, 10)
        : settings.numPredict;
    const numPredict = snapNumPredict(numPredictRaw);
    const apiBaseUrl =
      typeof req.query.host === "string" && req.query.host.trim()
        ? req.query.host.trim()
        : settings.apiBaseUrl;

    const modelInput = await ensureModelContextCache(model, apiBaseUrl);
    const budget = await calculateContextBudget(
      getVramAvailableGb(),
      modelInput,
      minNumCtxForPredict(numPredict),
    );

    const historyLimits = getHistoryLimits({
      numPredict,
      numCtx: budget.effectiveNumCtx,
    } as any);

    res.json({
      contextBudget: budget,
      derivedHistoryLimits: historyLimits,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Failed to calculate budget",
    });
  }
});

settingsRouter.post("/test-llm", async (req, res) => {
  try {
    const host = typeof req.body.host === "string" ? req.body.host : undefined;
    await checkHealth(host);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "LLM health check failed",
    });
  }
});

settingsRouter.get("/tavily-status", async (_req, res) => {
  res.json({
    configured: isTavilyConfigured(),
  });
});

settingsRouter.post("/test-tavily", async (_req, res) => {
  try {
    const health = await checkTavilyHealth();
    res.json(health);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Tavily health check failed",
    });
  }
});

settingsRouter.get("/stickers", (_req, res) => {
  res.json(stickerCatalogResponse());
});

settingsRouter.get("/stickers/:index/preview", async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const catalog = getStickerCatalogState();
    const sticker = catalog.stickers[index];
    if (!sticker) return res.status(404).send("Sticker not found");

    const bot = getBot();
    const file = await bot.api.getFile(sticker.fileId);
    if (!file.file_path) return res.status(404).send("File path not found");

    const url = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
    res.redirect(url);
  } catch (err) {
    res.status(500).send(err instanceof Error ? err.message : "Error");
  }
});

settingsRouter.post("/stickers/refresh", async (_req, res) => {
  try {
    const bot = getBot();
    const settings = getSettings();
    await refreshStickerCatalog(
      bot.api,
      settings.stickerPackName,
      stickerCatalogLog,
    );
    res.json(stickerCatalogResponse());
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to refresh stickers",
    });
  }
});
