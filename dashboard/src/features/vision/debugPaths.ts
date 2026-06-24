export function visionDebugRunPath(runId: number): string {
  return `/vision/${runId}`;
}

export function parseVisionDebugRunId(value: string | undefined): number | null {
  if (!value) return null;
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}
