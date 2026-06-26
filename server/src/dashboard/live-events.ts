import type { Server } from "socket.io";
import {
  buildMoodPayload,
  buildSettingsPayload,
  buildStatsPayload,
} from "./payloads.js";
export type MemoryScope = "user" | "group" | "general";

export interface DashboardDebugEvent {
  entityId: string;
  processingId: number;
}

export interface DashboardDataEvent {
  tableIds?: string[];
}

let io: Server | null = null;

export function registerLiveIo(server: Server): void {
  io = server;
}

function emit(event: string, payload?: unknown): void {
  io?.emit(event, payload);
}

export function emitStatsUpdated(): void {
  void buildStatsPayload().then((payload) => emit("dashboard:stats", payload));
}

export function emitMoodUpdated(): void {
  void buildMoodPayload().then((payload) => emit("dashboard:mood", payload));
}

export function emitPersonalitiesUpdated(): void {
  emit("dashboard:personalities");
}

export function emitMemoryUpdated(scope: MemoryScope): void {
  emit("dashboard:memory", { scope });
}

export function emitDebugUpdated(
  payload: DashboardDebugEvent | null,
): void {
  if (payload) emit("dashboard:debug", payload);
}

export function emitDataUpdated(tableIds?: string[]): void {
  const payload: DashboardDataEvent = tableIds?.length
    ? { tableIds }
    : {};
  emit("dashboard:data", payload);
}

export async function emitSettingsUpdated(): Promise<void> {
  emit("dashboard:settings", await buildSettingsPayload());
}

export function emitInitialSnapshots(): void {
  emitStatsUpdated();
  emitMoodUpdated();
}
