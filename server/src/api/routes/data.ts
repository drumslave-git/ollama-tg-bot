import { Router } from "express";
import { listDataTables, getDataTable } from "../../db/data/browser.js";

export const dataRouter = Router();

dataRouter.get("/tables", async (_req, res) => {
  res.json({ tables: await listDataTables() });
});

dataRouter.get("/table/:name", async (req, res) => {
  try {
    const table = await getDataTable(req.params.name);
    if (!table) return res.status(404).json({ error: "Table not found" });
    res.json(table);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Error fetching table" });
  }
});
