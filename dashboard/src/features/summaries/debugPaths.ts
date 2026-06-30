export function summariesDebugRunPath(runId: number): string {
  return `/history/debug/${runId}`;
}

export function parseSummariesDebugRunId(
  value: string | undefined,
): number | null {
  if (!value) return null;
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}
