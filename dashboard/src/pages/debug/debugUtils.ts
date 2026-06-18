import { useEffect, useState } from "react";
import type { DebugChatSummary, MessageReportListItem } from "../../api";
import type { BadgeVariant } from "../../components/ui/Badge";

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
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

export function upsertListItem(
  items: MessageReportListItem[],
  next: MessageReportListItem,
): MessageReportListItem[] {
  const idx = items.findIndex((item) => item.id === next.id);
  const merged =
    idx >= 0
      ? [...items.slice(0, idx), next, ...items.slice(idx + 1)]
      : [next, ...items];
  return merged.sort((a, b) => b.id - a.id);
}

export function patchChatSummaries(
  chats: DebugChatSummary[],
  event: {
    chatId: string;
    listItem: MessageReportListItem | null;
  },
): DebugChatSummary[] {
  if (!event.listItem) return chats;

  const idx = chats.findIndex((chat) => chat.chatId === event.chatId);
  if (idx < 0) {
    const stub: DebugChatSummary = {
      chatId: event.chatId,
      chatType: "unknown",
      label: `Chat ${event.chatId}`,
      traceCount: 1,
      latestAt: event.listItem.createdAt,
    };
    return [stub, ...chats].sort((a, b) => {
      const aTime = a.latestAt ? Date.parse(a.latestAt) : 0;
      const bTime = b.latestAt ? Date.parse(b.latestAt) : 0;
      return bTime - aTime;
    });
  }

  const chat = chats[idx];
  const next = [...chats];
  const latestMs = Date.parse(event.listItem.createdAt);
  const currentMs = chat.latestAt ? Date.parse(chat.latestAt) : 0;
  next[idx] = {
    ...chat,
    latestAt: latestMs >= currentMs ? event.listItem.createdAt : chat.latestAt,
  };
  return next.sort((a, b) => {
    const aTime = a.latestAt ? Date.parse(a.latestAt) : 0;
    const bTime = b.latestAt ? Date.parse(b.latestAt) : 0;
    return bTime - aTime;
  });
}
