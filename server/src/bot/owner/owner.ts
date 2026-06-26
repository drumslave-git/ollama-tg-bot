import type { Context } from "grammy";
import { getSettings } from "../../db/index.js";
import { resolveUserId } from "../telegram/keys.js";

export async function getOwnerUserId(): Promise<string | null> {
  const id = (await getSettings()).ownerUserId.trim();
  return id.length > 0 ? id : null;
}

export async function getOwnerUsername(): Promise<string | null> {
  const username = (await getSettings()).ownerUsername.trim();
  return username.length > 0 ? username : null;
}

export async function isOwnerUserId(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  const owner = await getOwnerUserId();
  return owner !== null && userId === owner;
}

export async function isOwnerUsername(
  username: string | null | undefined,
): Promise<boolean> {
  if (!username) return false;
  const owner = await getOwnerUsername();
  return owner !== null && username.toLowerCase() === owner;
}

export async function isOwner(ctx: Context): Promise<boolean> {
  if (await isOwnerUserId(resolveUserId(ctx))) return true;
  return isOwnerUsername(ctx.from?.username);
}
