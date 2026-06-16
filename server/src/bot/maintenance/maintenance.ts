import type { Context } from "grammy";
import { getSettings } from "../../db/index.js";
import { isOwner } from "../owner/owner.js";

/** True when maintenance mode is on and the sender is not the bot owner. */
export function isMaintenanceBlocked(ctx: Context): boolean {
  return getSettings().maintenanceModeEnabled && !isOwner(ctx);
}
