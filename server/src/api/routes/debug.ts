import { Router } from "express";
import {
  getProcessingDetail,
  listProcessingChats,
  listProcessingsForChat,
} from "../../db/debug/message-processing.js";

export const debugRouter = Router();

debugRouter.get("/chats", async (_req, res) => {
  res.json({ chats: await listProcessingChats() });
});

debugRouter.get("/chat/:entityId", async (req, res) => {
  res.json({ processings: await listProcessingsForChat(req.params.entityId) });
});

debugRouter.get("/processing/:id", async (req, res) => {
  const processing = await getProcessingDetail(Number(req.params.id));
  if (!processing) return res.status(404).json({ error: "Processing not found" });
  res.json({ processing });
});
