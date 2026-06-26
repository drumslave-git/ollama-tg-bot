import { Router } from "express";
import { listDebugChats, listDebugTracesForChat, getDebugTraceById } from "../../db/debug/traces.js";

export const debugRouter = Router();

debugRouter.get("/chats", async (_req, res) => {
  res.json({ chats: await listDebugChats() });
});

debugRouter.get("/chat/:chatId", async (req, res) => {
  res.json({ traces: await listDebugTracesForChat(req.params.chatId) });
});

debugRouter.get("/trace/:id", async (req, res) => {
  const trace = await getDebugTraceById(Number(req.params.id));
  if (!trace) return res.status(404).json({ error: "Trace not found" });
  res.json({ trace });
});
