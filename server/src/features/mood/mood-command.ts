import { escapeHtml } from "../../shared/index.js";
import type { MoodCommandExtension } from "./mood-command-types.js";
import { MOOD_KEYS } from "./values.js";

function formatTraitLine(
  key: string,
  current: number,
  defaultValue: number,
): string {
  const marker = current !== defaultValue ? "•" : "·";
  return `${marker} <code>${key}</code>: ${current}/5 <i>(default ${defaultValue})</i>`;
}

export async function buildMoodCommandReply(
  settings: Record<string, unknown>,
  extension: MoodCommandExtension,
): Promise<string> {
  await extension.tickMoodCooldown();

  const defaults = await extension.getActivePersonalityMoodDefaults();
  const current = await extension.getEffectiveMood();
  const state = await extension.getMoodStateView();
  const activeId = await extension.resolveActivePersonalityId(
    Number(settings.activePersonalityId ?? 0),
  );
  const activeName = activeId
    ? (await extension.getPersonalityById(activeId))?.name
    : null;

  const lines = ["<b>Mood</b> (global)"];

  if (activeName) {
    lines.push(`Defaults from character: <b>${escapeHtml(activeName)}</b>`);
  } else {
    lines.push("Defaults: base values (no active character)");
  }

  lines.push("");
  for (const key of MOOD_KEYS) {
    lines.push(formatTraitLine(key, current[key], defaults[key]));
  }

  if (state?.updatedAt) {
    const when = new Date(state.updatedAt);
    const label = Number.isNaN(when.getTime())
      ? state.updatedAt
      : when.toLocaleString();
    lines.push(`\nLast interaction: ${escapeHtml(label)}`);
  } else {
    lines.push("\nNo mood recorded yet — defaults apply.");
  }

  lines.push(
    `Cooldown: ${Number(settings.moodCooldownMinutes ?? 120)} min to full default drift`,
  );

  return lines.join("\n");
}
