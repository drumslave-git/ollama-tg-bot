import { extractTelegramReply } from "../../features/completions/index.js";
import { listDistinctHistoryChatIds } from "../../features/history/db/index.js";
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

/** Clean the plain-text maintenance broadcast output; reject an empty reply. */
export function parseMaintenanceAnnouncementReply(raw: string): string {
  const reply = extractTelegramReply(raw).trim();
  if (!reply) {
    throw new Error("Maintenance announcement: LLM returned an empty reply");
  }
  return reply;
}
