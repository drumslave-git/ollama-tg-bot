import { useEffect, useState } from "react";
import type { BadgeVariant } from "../../components/ui/Badge";
import type { TokenCounts } from "../../api";

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

const numberFmt = new Intl.NumberFormat();

/** Thousands-separated integer, e.g. 12345 → "12,345". */
export function formatTokenCount(n: number): string {
  return numberFmt.format(Math.round(n || 0));
}

/**
 * Compact token summary for a processing header, e.g.
 * "1,234 tokens (982 in / 252 out)". Returns null when nothing was recorded so
 * callers can omit the field entirely.
 */
export function formatTokens(tokens: TokenCounts | null | undefined): string | null {
  if (!tokens || tokens.totalTokens <= 0) return null;
  return `${formatTokenCount(tokens.totalTokens)} tokens (${formatTokenCount(
    tokens.promptTokens,
  )} in / ${formatTokenCount(tokens.completionTokens)} out)`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Elapsed time for in-flight traces (server duration or live clock). */
export function liveDurationMs(
  createdAt: string,
  durationMs: number | null | undefined,
  status: string,
  nowMs: number,
): number | null {
  if (status === "processing") {
    const started = Date.parse(createdAt);
    if (!Number.isFinite(started)) return durationMs ?? null;
    return Math.max(0, nowMs - started);
  }
  return durationMs ?? null;
}

export function formatCountdown(
  runAt: string | null | undefined,
  nowMs: number,
): string | null {
  if (!runAt) return null;
  const target = Date.parse(runAt);
  if (!Number.isFinite(target)) return null;
  const sec = Math.max(0, Math.ceil((target - nowMs) / 1000));
  if (sec <= 0) return "now";
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

/** Re-render once per second while countdown or processing is active. */
export function useLiveClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function statusClass(status: string): BadgeVariant {
  if (status === "processed") return "ok";
  if (status === "processing") return "warn";
  if (status === "error") return "danger";
  return "warn";
}
