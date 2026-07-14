import { Router } from "express";
import { errorMessage } from "../../../logging/index.js";
import type { StoredMessage } from "../types.js";
import { redactBase64MediaForDisplay } from "../format.js";
import { getHistoryBatches } from "./history.js";

const CSV_COLUMNS = [
  "createdAt",
  "role",
  "messageId",
  "replyToMessageId",
  "content",
] as const;

/** Cells a spreadsheet would evaluate as a formula rather than show as text. */
const CSV_FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One RFC 4180 cell. Message content is untrusted chat text, so a leading
 * `=`/`+`/`-`/`@` is prefixed with an apostrophe — otherwise Excel and Sheets
 * would evaluate the row as a formula on open.
 */
function csvCell(value: string | number | null): string {
  if (value == null) return "";
  const text = String(value);
  const guarded = CSV_FORMULA_START.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function csvRow(cells: Array<string | number | null>): string {
  return `${cells.map(csvCell).join(",")}\r\n`;
}

/** Replace not-yet-described base64 media so exports never dump raw base64. */
function sanitizeForExport(message: StoredMessage): StoredMessage {
  const redacted = redactBase64MediaForDisplay(message.content);
  return redacted == null ? message : { ...message, content: redacted };
}

function isoFromStored(message: StoredMessage): string | null {
  if (message.createdAt == null) return null;
  return new Date(message.createdAt * 1000).toISOString();
}

function messageRow(message: StoredMessage): string {
  return csvRow([
    isoFromStored(message),
    message.role,
    message.messageId ?? null,
    message.replyToMessageId ?? null,
    message.content,
  ]);
}

/** Filename-safe chat id for the Content-Disposition header. */
function safeFilePart(chatId: string): string {
  return chatId.replace(/[^0-9A-Za-z_-]/g, "_") || "chat";
}

export const historyRouter = Router();

/**
 * Download a chat's full stored history as a CSV file — one row per message.
 * Streams the rows in bounded DB pages, so a large chat never has to fit in
 * memory at once.
 */
historyRouter.get("/chat/:chatId/export", async (req, res) => {
  const chatId = req.params.chatId;

  const batches = getHistoryBatches(chatId);
  let firstBatch: StoredMessage[];
  try {
    const first = await batches.next();
    if (first.done) {
      return res.status(404).json({ error: "No history stored for this chat" });
    }
    firstBatch = first.value;
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err) });
  }

  const today = new Date().toISOString().slice(0, 10);
  const filename = `history-${safeFilePart(chatId)}-${today}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const writeBatch = (batch: StoredMessage[]): void => {
    for (const message of batch) {
      res.write(messageRow(sanitizeForExport(message)));
    }
  };

  try {
    res.write(csvRow([...CSV_COLUMNS]));
    writeBatch(firstBatch);
    for await (const batch of batches) {
      writeBatch(batch);
    }
    res.end();
  } catch (err) {
    // Headers are already sent; abort the stream so the client sees a failed
    // download instead of a silently truncated file.
    res.destroy(err instanceof Error ? err : new Error(errorMessage(err)));
  }
});

export function createHistoryRouter(): Router {
  return historyRouter;
}
