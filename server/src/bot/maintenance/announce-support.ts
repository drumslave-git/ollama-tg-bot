import { extractTelegramReply } from "../../features/completions/index.js";
import { asObject, parseJsonContent } from "../../shared/index.js";
import { listDistinctHistoryChatIds } from "../../db/history/index.js";
import { MAINTENANCE_MODE_ON_BEHAVIOR } from "./maintenance-mode.js";

export function collectMaintenanceAnnouncementChatIds(): Promise<number[]> {
  return listDistinctHistoryChatIds();
}

export function buildMaintenanceAnnouncementUserMessage(
  enabled: boolean,
): string {
  return enabled
    ? `Maintenance mode is now on. ${MAINTENANCE_MODE_ON_BEHAVIOR}`
    : "Maintenance mode is now off.";
}

/** Parse maintenance broadcast output; never fall back to raw JSON text. */
export function parseMaintenanceAnnouncementReply(raw: string): string {
  const parsed = asObject(parseJsonContent(raw));
  if (!parsed || typeof parsed.reply !== "string") {
    throw new Error(
      "Maintenance announcement: LLM response was not valid JSON with a reply field",
    );
  }

  const reply = extractTelegramReply(raw).trim();
  if (!reply) {
    throw new Error("Maintenance announcement: LLM returned an empty reply");
  }
  return reply;
}
