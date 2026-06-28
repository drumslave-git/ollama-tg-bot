import { tickMoodCooldown } from "./db/index.js";
import { logEvent, logEventError } from "../../logging/event-log.js";
import { logInfo } from "../../logging/index.js";

const MOOD_COOLDOWN_TICK_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;

async function runTick(): Promise<void> {
  try {
    const changed = await tickMoodCooldown();
    if (changed) {
      logEvent("mood_cooldown_tick", { changed: true });
    }
  } catch (err) {
    logEventError("mood_cooldown_tick_failed", err);
  }
}

export function startMoodCooldownWorker(): void {
  if (timer) return;
  void runTick();
  timer = setInterval(() => void runTick(), MOOD_COOLDOWN_TICK_MS);
  logInfo(`Mood cooldown worker started (every ${MOOD_COOLDOWN_TICK_MS / 1000}s)`);
}

export function stopMoodCooldownWorker(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
