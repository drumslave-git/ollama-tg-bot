export function debugChatPath(entityId: string): string {
  return `/debug/${encodeURIComponent(entityId)}`;
}

export function debugProcessingPath(
  entityId: string,
  processingId: number,
): string {
  return `/debug/${encodeURIComponent(entityId)}/${processingId}`;
}

export function decodeRouteEntityId(entityId: string | undefined): string | null {
  if (!entityId) return null;
  try {
    return decodeURIComponent(entityId);
  } catch {
    return entityId;
  }
}

export function parseRouteProcessingId(
  processingId: string | undefined,
): number | null {
  if (!processingId) return null;
  const parsed = Number(processingId);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}
