import type { User } from "@grammyjs/types";
import { getSettings, updateSettings } from "../../db/index.js";
import { normalizeTelegramUsername } from "./resolve-owner.js";

/** Persist owner user id once the configured @username messages the bot. */
export async function tryResolveOwnerFromUser(
  user: User | undefined,
): Promise<void> {
  if (!user?.id || !user.username) return;

  const settings = await getSettings();
  const configured = normalizeTelegramUsername(settings.ownerUsername);
  if (!configured || settings.ownerUserId.trim()) return;

  if (user.username.toLowerCase() !== configured) return;

  await updateSettings({ ownerUserId: String(user.id) });
}
