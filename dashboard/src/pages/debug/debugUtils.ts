import { useEffect, useState } from "react";
import type { DebugChatSummary, MessageReportListItem } from "../../api";

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

/** Re-render once per second while any watched status is processing. */
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

export function statusClass(status: string): string {
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
