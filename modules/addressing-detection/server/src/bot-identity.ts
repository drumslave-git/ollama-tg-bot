const GENERIC_DISPLAY_NAME_BLOCKLIST = new Set([
  "bot",
  "the",
  "and",
  "cloud",
  "ai",
  "assistant",
]);

export interface BotAddressIdentity {
  id: number;
  username: string;
  /** Telegram first name; the only spoken name that triggers addressing. */
  displayName: string;
}

let runtimeIdentity: BotAddressIdentity | null = null;

/** Called once at bot startup after Telegram getMe. */
export function setBotIdentity(
  me: { id: number; first_name?: string; last_name?: string },
  username: string,
): void {
  runtimeIdentity = buildBotAddressIdentity(me, username);
}

export function getBotIdentity(): BotAddressIdentity {
  if (!runtimeIdentity) {
    throw new Error("Bot identity not initialized — call setBotIdentity at startup");
  }
  return runtimeIdentity;
}

/** Strip @username and display-name mentions using the runtime bot identity. */
export function stripCurrentBotAddressing(text: string): string {
  return stripBotAddressing(text, getBotIdentity());
}

export function buildBotAddressIdentity(
  me: { id: number; first_name?: string; last_name?: string },
  username: string,
): BotAddressIdentity {
  return {
    id: me.id,
    username,
    displayName: me.first_name?.trim() ?? "",
  };
}

export function displayNameMatchable(displayName: string): boolean {
  const trimmed = displayName.trim();
  if (trimmed.length < 3) return false;
  return !GENERIC_DISPLAY_NAME_BLOCKLIST.has(trimmed.toLowerCase());
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when free text names the bot's Telegram display name (not @username). */
export function messageReferencesBotByName(
  text: string,
  bot: BotAddressIdentity,
): boolean {
  const trimmed = text.trim();
  if (!trimmed || !displayNameMatchable(bot.displayName)) return false;

  const name = bot.displayName.toLowerCase();
  const re = new RegExp(`(?:^|[^\\w@])${escapeRegex(name)}(?:[^\\w]|$)`, "i");
  return re.test(trimmed);
}

/** Remove @username and display-name mentions from text. */
export function stripBotAddressing(
  text: string,
  bot: BotAddressIdentity,
): string {
  let out = text.trim();
  if (!out) return out;

  if (bot.username) {
    const escaped = bot.username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`@${escaped}\\s*`, "gi"), " ");
  }

  if (displayNameMatchable(bot.displayName)) {
    const re = new RegExp(
      `(?:^|[^\\w@])${escapeRegex(bot.displayName)}(?:[^\\w]|$)`,
      "gi",
    );
    out = out.replace(re, " ");
  }

  return out.replace(/\s{2,}/g, " ").trim();
}
