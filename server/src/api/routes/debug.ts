import { Router } from "express";
import { listDebugChats, listDebugTracesForChat, getDebugTraceById } from "../../db/debug-traces.js";

export const debugRouter = Router();

debugRouter.get("/chats", (_req, res) => {
  res.json({ chats: listDebugChats() });
});

debugRouter.get("/chat/:chatId", (req, res) => {
  res.json({ traces: listDebugTracesForChat(req.params.chatId) });
});

debugRouter.get("/trace/:id", (req, res) => {
  const trace = getDebugTraceById(Number(req.params.id));
  if (!trace) return res.status(404).json({ error: "Trace not found" });
  res.json({ trace });
});
