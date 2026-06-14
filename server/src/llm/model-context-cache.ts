import { logEventError } from "../event-log.js";
import {
  extractModelMaxCtx,
  modelContextInputFromTags,
  type ModelContextInput,
} from "../context-budget.js";
import { fetchOptionalModelCatalogEntry, showModel } from "./client.js";

const CACHE_TTL_MS = 5 * 60_000;

type CacheEntry = {
  host: string;
  model: string;
  input: ModelContextInput;
  fetchedAt: number;
};

let cache: CacheEntry | null = null;
let refreshPromise: Promise<ModelContextInput> | null = null;

function isFresh(entry: CacheEntry, host: string, model: string): boolean {
  return (
    entry.host === host &&
    entry.model === model &&
    Date.now() - entry.fetchedAt < CACHE_TTL_MS
  );
}

async function fetchModelContext(
  model: string,
  host: string,
): Promise<ModelContextInput> {
  const [show, catalogEntry] = await Promise.all([
    showModel(model, host).catch(() => null),
    fetchOptionalModelCatalogEntry(model, host).catch(() => null),
  ]);

  const input = modelContextInputFromTags(model, {
    name: model,
    size: catalogEntry?.size ?? show?.sizeBytes,
    details: catalogEntry?.details,
    parameterSize: (catalogEntry as any)?.parameterSize ?? show?.parameterSize,
    modelMaxCtx: show?.modelMaxCtx,
  } as any);

  return input;
}

export async function refreshModelContextCache(
  model: string,
  host: string,
): Promise<ModelContextInput> {
  if (!model.trim() || !host.trim()) {
    return { name: model };
  }

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const input = await fetchModelContext(model.trim(), host.trim());
      cache = {
        host: host.trim(),
        model: model.trim(),
        input,
        fetchedAt: Date.now(),
      };
      return input;
    } catch (err) {
      logEventError("model_context_cache_failed", err, { model, host });
      const fallback = { name: model.trim() };
      cache = {
        host: host.trim(),
        model: model.trim(),
        input: fallback,
        fetchedAt: Date.now(),
      };
      return fallback;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export function getCachedModelContext(
  model: string,
  host: string,
): ModelContextInput | null {
  if (!cache || !isFresh(cache, host.trim(), model.trim())) return null;
  return cache.input;
}

export function getModelContextForBudget(
  model: string,
  host: string,
): ModelContextInput {
  const cached = getCachedModelContext(model, host);
  if (cached) return cached;
  return { name: model.trim() };
}

export async function ensureModelContextCache(
  model: string,
  host: string,
): Promise<ModelContextInput> {
  const cached = getCachedModelContext(model, host);
  if (cached) return cached;
  return refreshModelContextCache(model, host);
}

export function invalidateModelContextCache(): void {
  cache = null;
}
