import { Router } from "express";
import {
  DEFAULT_CHAT_LANGUAGE,
  deleteChatLanguage,
  getChatLanguage,
  listChatLanguages,
  upsertChatLanguage,
} from "./languages.js";

function parseChatId(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const languagesRouter = Router();

languagesRouter.get("/", async (_req, res) => {
  res.json({
    defaultLanguage: DEFAULT_CHAT_LANGUAGE,
    languages: await listChatLanguages(),
  });
});

languagesRouter.get("/:chatId", async (req, res) => {
  const chatId = parseChatId(req.params.chatId);
  if (chatId == null) {
    return res.status(400).json({ error: "chatId is required" });
  }
  const language = await getChatLanguage(chatId);
  if (!language) {
    return res.status(404).json({ error: "Language setting not found" });
  }
  res.json({ language });
});

languagesRouter.post("/", async (req, res) => {
  const body = req.body ?? {};
  const chatId = parseChatId(body.chatId);
  if (chatId == null) {
    return res.status(400).json({ error: "chatId is required" });
  }
  try {
    const language = await upsertChatLanguage(chatId, String(body.language ?? ""));
    res.json({ language });
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

languagesRouter.patch("/:chatId", async (req, res) => {
  const chatId = parseChatId(req.params.chatId);
  if (chatId == null) {
    return res.status(400).json({ error: "chatId is required" });
  }
  try {
    const language = await upsertChatLanguage(
      chatId,
      String(req.body?.language ?? ""),
    );
    res.json({ language });
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

languagesRouter.delete("/:chatId", async (req, res) => {
  const chatId = parseChatId(req.params.chatId);
  if (chatId == null) {
    return res.status(400).json({ error: "chatId is required" });
  }
  res.json({ ok: await deleteChatLanguage(chatId) });
});

export function createLanguagesRouter(): Router {
  return languagesRouter;
}
