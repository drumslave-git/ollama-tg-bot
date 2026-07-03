import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..", "..");

dotenv.config({ path: path.join(rootDir, ".env") });

/**
 * Resolve an env value with Docker-secret support: when `${name}_FILE` is set,
 * the referenced file's trimmed contents are used; otherwise the plain `${name}`
 * variable. This lets any credential (e.g. `BOT_TOKEN`, `TAVILY_API_KEY`) be
 * supplied via a mounted secret file rather than a literal env value.
 */
function readEnv(name: string): string {
  const filePath = (process.env[`${name}_FILE`] ?? "").trim();
  if (filePath) {
    try {
      return fs.readFileSync(filePath, "utf8").trim();
    } catch (err) {
      throw new Error(
        `Failed to read ${name}_FILE at ${filePath}: ${(err as Error).message}`,
      );
    }
  }
  return (process.env[name] ?? "").trim();
}

/** API listen port. `PORT` in `.env` applies in production (Docker) only; local dev uses 3000 for Vite proxy. */
function resolvePort(): number {
  if (process.env.NODE_ENV === "production") {
    return Number(process.env.PORT ?? 3000);
  }
  return 3000;
}

function resolveTavilyApiKey(): string {
  return readEnv("TAVILY_API_KEY");
}

function resolveLlmBaseUrl(): string {
  return readEnv("LLM_BASE_URL");
}

function resolveLlmApiKey(): string {
  return readEnv("LLM_API_KEY");
}

/** Base URL for the embedding model. Falls back to LLM_BASE_URL when EMBEDDING_BASE_URL is unset. */
function resolveEmbeddingBaseUrl(): string {
  const embeddingUrl = readEnv("EMBEDDING_BASE_URL");
  return embeddingUrl || resolveLlmBaseUrl();
}

/** API key for the embedding host. Falls back to LLM_API_KEY when EMBEDDING_API_KEY is unset. */
function resolveEmbeddingApiKey(): string {
  const embeddingKey = readEnv("EMBEDDING_API_KEY");
  return embeddingKey || resolveLlmApiKey();
}

/** True when the embedding host resolves to a different URL than the chat LLM host. */
function resolveEmbeddingHostDistinct(): boolean {
  return resolveEmbeddingBaseUrl() !== resolveLlmBaseUrl();
}

/** Base URL for image generation. Falls back to LLM_BASE_URL when IMAGE_GENERATION_BASE_URL is unset. */
function resolveImageBaseUrl(): string {
  const imageUrl = readEnv("IMAGE_GENERATION_BASE_URL");
  return imageUrl || resolveLlmBaseUrl();
}

/** API key for the image host. Falls back to LLM_API_KEY when IMAGE_GENERATION_API_KEY is unset. */
function resolveImageApiKey(): string {
  const imageKey = readEnv("IMAGE_GENERATION_API_KEY");
  return imageKey || resolveLlmApiKey();
}

/** True when the image host resolves to a different URL than the chat LLM host. */
function resolveImageHostDistinct(): boolean {
  return resolveImageBaseUrl() !== resolveLlmBaseUrl();
}

/**
 * Postgres connection string from `DATABASE_URL`. When `PG_PASSWORD` (or
 * `PG_PASSWORD_FILE`, for Docker secrets) is set, its value overrides the
 * password embedded in the URL — so the URL can be committed without the
 * secret and the password supplied separately via a mounted file.
 */
function resolveDatabaseUrl(): string {
  const url = readEnv("DATABASE_URL");
  if (!url) return url;

  const password = readEnv("PG_PASSWORD");
  if (!password) return url;

  try {
    const parsed = new URL(url);
    parsed.password = password;
    return parsed.toString();
  } catch {
    // Not a parseable URL (e.g. a bare DSN); leave it untouched.
    return url;
  }
}

function resolveTimezone(): string {
  const raw = readEnv("TZ");
  return raw || "UTC";
}

export type LoggingLevel = "ERROR" | "DEBUG";

function resolveLoggingLevel(): LoggingLevel {
  const raw = (process.env.LOGGING_LEVEL ?? "ERROR").trim().toUpperCase();
  if (raw === "DEBUG") return "DEBUG";
  return "ERROR";
}

interface StartupEnv {
  botToken: string;
}

let startupEnv: StartupEnv | undefined;

function collectRequiredEnvErrors(): string[] {
  const errors: string[] = [];

  const botToken = readEnv("BOT_TOKEN");
  if (!botToken) {
    errors.push("BOT_TOKEN environment variable is required");
  }

  const llmBaseUrl = resolveLlmBaseUrl();
  if (!llmBaseUrl) {
    errors.push("LLM_BASE_URL environment variable is required");
  }

  if (!resolveDatabaseUrl()) {
    errors.push(
      "DATABASE_URL environment variable is required (Postgres connection string, e.g. postgres://user:pass@host:5432/db)",
    );
  }

  return errors;
}

function resolveStartupEnv(): StartupEnv {
  const errors = collectRequiredEnvErrors();
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }

  return {
    botToken: readEnv("BOT_TOKEN"),
  };
}

/** Validates required startup env (BOT_TOKEN). Call once before the server listens. */
export function requireStartupEnv(): StartupEnv {
  if (!startupEnv) {
    startupEnv = resolveStartupEnv();
  }
  return startupEnv;
}

export function requireBotToken(): string {
  return requireStartupEnv().botToken;
}

export const config = {
  host: "0.0.0.0",
  port: resolvePort(),
  /** Postgres connection string from env (DATABASE_URL). */
  databaseUrl: resolveDatabaseUrl(),
  dashboardDist: path.join(rootDir, "dashboard", "dist"),
  /** Tavily API key from env (TAVILY_API_KEY). Empty = web search off. */
  tavilyApiKey: resolveTavilyApiKey(),
  /** OpenAI-compatible API base URL from env (LLM_BASE_URL). */
  llmBaseUrl: resolveLlmBaseUrl(),
  /** Base URL for the embedding model (EMBEDDING_BASE_URL); falls back to LLM_BASE_URL when unset. */
  embeddingBaseUrl: resolveEmbeddingBaseUrl(),
  /** API key for the embedding host (EMBEDDING_API_KEY); falls back to LLM_API_KEY when unset. */
  embeddingApiKey: resolveEmbeddingApiKey(),
  /** True when EMBEDDING_BASE_URL points somewhere other than LLM_BASE_URL. */
  embeddingHostDistinct: resolveEmbeddingHostDistinct(),
  /** Base URL for image generation (IMAGE_GENERATION_BASE_URL); falls back to LLM_BASE_URL when unset. */
  imageBaseUrl: resolveImageBaseUrl(),
  /** API key for the image host (IMAGE_GENERATION_API_KEY); falls back to LLM_API_KEY when unset. */
  imageApiKey: resolveImageApiKey(),
  /** True when IMAGE_GENERATION_BASE_URL points somewhere other than LLM_BASE_URL. */
  imageHostDistinct: resolveImageHostDistinct(),
  /** OpenAI-compatible API key from env (LLM_API_KEY). Local servers can leave it empty. */
  llmApiKey: resolveLlmApiKey(),
  /** ERROR = errors only; DEBUG = lifecycle events. Use dashboard Debug page for message traces. */
  loggingLevel: resolveLoggingLevel(),
  /** IANA timezone (TZ env, default UTC). Scheduled tasks fire at wall-clock times in this zone. */
  timezone: resolveTimezone(),
};
