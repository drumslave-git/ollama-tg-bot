import { Router } from "express";
import { listDataTables, getDataTable } from "../../db/data/browser.js";

export const dataRouter = Router();

dataRouter.get("/tables", (_req, res) => {
  res.json({ tables: listDataTables() });
});

dataRouter.get("/table/:name", (req, res) => {
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 100;
  const offset = typeof req.query.offset === "string" ? parseInt(req.query.offset, 10) : 0;
  try {
    const table = getDataTable(req.params.name);
    if (!table) return res.status(404).json({ error: "Table not found" });
    res.json(table);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Error fetching table" });
  }
});
