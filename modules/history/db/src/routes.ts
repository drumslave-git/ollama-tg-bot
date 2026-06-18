import { Router } from "express";
import type { ModuleDbHost } from "@llm-tg-bot/modules-registry";
import type { HistoryCompressResult } from "@llm-tg-bot/modules-history";

let host: ModuleDbHost | null = null;

export function configureHistoryRoutes(nextHost: ModuleDbHost): void {
  host = nextHost;
}

function requireHost(): ModuleDbHost {
  if (!host?.compressHistoryChat) {
    throw new Error("History module routes not configured");
  }
  return host;
}

export const historyRouter = Router();

historyRouter.post("/compress", async (req, res) => {
  try {
    const chatKey =
      typeof req.body.chatKey === "string" ? req.body.chatKey.trim() : "";
    if (!chatKey) {
      return res.status(400).json({ error: "chatKey is required" });
    }

    const force = req.body.force === true;
    const result: HistoryCompressResult = await requireHost().compressHistoryChat!(
      chatKey,
      { force },
    );

    if (!result.ok && !result.skipped) {
      return res.status(500).json({
        error: result.reason ?? "Compression failed",
        ...result,
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Compression failed",
    });
  }
});

export function createHistoryRouter(): Router {
  return historyRouter;
}
