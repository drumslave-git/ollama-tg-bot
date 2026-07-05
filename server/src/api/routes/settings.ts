import { Router } from "express";
import { getSettings, updateSettings, type Settings } from "../../db/index.js";
import { buildSettingsPayload } from "../../dashboard/payloads.js";
import { getBot } from "../../bot/index.js";
import { resolveOwnerUsername } from "../../bot/owner/resolve-owner.js";
import {
  syncStickerCatalogFromSettings,
  getStickerCatalogState,
  refreshStickerCatalog,
} from "../../features/sticker/index.js";
import { logEvent, logEventError, type EventFields } from "../../logging/event-log.js";
import type { BotHostLogging } from "../../contracts/index.js";
import { getResolvedSettings, getResolvedHistoryLimits, getContextBudgetForSettings } from "../../settings/runtime.js";
import { buildBaseSystemPrompt } from "../../pipeline/adapters/system-prompt.js";
import { config } from "../../config/index.js";
import { listModels, checkHealth } from "../../llm/client.js";
import {
  listEmbeddingModels,
  checkEmbeddingHealth,
} from "../../llm/embeddings.js";
import { listImageModels, checkImageHealth } from "../../llm/images.js";
import { snapNumPredict, getHistoryLimits } from "../../settings/limits.js";
import { calculateContextBudget } from "../../settings/context-budget.js";
import { runWebSearch } from "../../features/web-search/index.js";

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

async function stickerCatalogResponse() {
  const settings = await getSettings();
  const catalog = getStickerCatalogState();
  return {
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
      "model",
      "embeddingModel",
      "imageModel",
      "activePersonalityId",
      "numPredict",
      "numCtx",
      "temperature",
      "topP",
      "chatTimeoutSec",
      "visionMaxDimension",
      "ownerUsername",
      "stickerPackName",
      "stickerReplyChance",
      "moodCooldownMinutes",
      "thinkingEnabled",
      "reasoningEffort",
      "maintenanceModeEnabled",
      "workflowSteps",
      "browserAgentConcurrency",
      "browserDownloadMaxMb",
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

    const updated = await updateSettings(patch);

    if (body.stickerPackName !== undefined) {
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
      // Show the manually-set numCtx, not the model-capped runtime value.
      numCtx: updated.numCtx,
      llmBaseUrl: config.llmBaseUrl,
      llmApiKeyConfigured: config.llmApiKey.length > 0,
      baseSystemPrompt: buildBaseSystemPrompt(resolved),
      derivedHistoryLimits: getResolvedHistoryLimits(updated),
      contextBudget: getContextBudgetForSettings(updated),
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Invalid settings",
    });
  }
});

settingsRouter.get("/models", async (_req, res) => {
  try {
    const models = await listModels();
    res.json({ models });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch models";
    const status = message.includes("not configured") ? 400 : 502;
    res.status(status).json({ error: message });
  }
});

settingsRouter.get("/embedding-models", async (_req, res) => {
  try {
    const models = await listEmbeddingModels();
    res.json({ models });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch embedding models";
    const status = message.includes("not configured") ? 400 : 502;
    res.status(status).json({ error: message });
  }
});

settingsRouter.get("/image-models", async (_req, res) => {
  try {
    const models = await listImageModels();
    res.json({ models });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch image models";
    const status = message.includes("not configured") ? 400 : 502;
    res.status(status).json({ error: message });
  }
});

settingsRouter.get("/budget", async (req, res) => {
  try {
    const settings = await getSettings();
    const model =
      typeof req.query.model === "string" && req.query.model.trim()
        ? req.query.model.trim()
        : settings.model;
    const numPredictRaw =
      typeof req.query.numPredict === "string"
        ? parseInt(req.query.numPredict, 10)
        : settings.numPredict;
    const numPredict = snapNumPredict(numPredictRaw);
    const numCtxRaw =
      typeof req.query.numCtx === "string"
        ? parseInt(req.query.numCtx, 10)
        : settings.numCtx;

    const budget = calculateContextBudget(numCtxRaw, numPredict, {
      name: model,
    });

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

settingsRouter.post("/test-llm", async (_req, res) => {
  try {
    await checkHealth();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "LLM health check failed",
    });
  }
});

settingsRouter.post("/test-embedding", async (_req, res) => {
  try {
    await checkEmbeddingHealth();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({
      error:
        err instanceof Error ? err.message : "Embedding health check failed",
    });
  }
});

settingsRouter.post("/test-image", async (_req, res) => {
  try {
    await checkImageHealth();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Image health check failed",
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

settingsRouter.get("/stickers", async (_req, res) => {
  res.json(await stickerCatalogResponse());
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
    const settings = await getSettings();
    await refreshStickerCatalog(
      bot.api,
      settings.stickerPackName,
      stickerCatalogLog,
    );
    res.json(await stickerCatalogResponse());
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to refresh stickers",
    });
  }
});
