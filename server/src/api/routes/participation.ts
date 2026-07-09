import { Router } from "express";
import { listKnownChats } from "../../db/chats/known-chats.js";

export const participationRouter = Router();

participationRouter.get("/", async (_req, res) => {
  res.json({ chats: await listKnownChats() });
});
