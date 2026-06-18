export function memoryDebugRunPath(runId: number): string {
  return `/modules/memory/debug/${runId}`;
}

export function parseMemoryDebugRunId(value: string | undefined): number | null {
  if (!value) return null;
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}
