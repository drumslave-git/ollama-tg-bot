import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..", "..");

dotenv.config({ path: path.join(rootDir, ".env") });

/** API listen port. `PORT` in `.env` applies in production (Docker) only; local dev uses 3000 for Vite proxy. */
function resolvePort(): number {
  if (process.env.NODE_ENV === "production") {
    return Number(process.env.PORT ?? 3000);
  }
  return 3000;
}

function resolveTavilyApiKey(): string {
  return (process.env.TAVILY_API_KEY ?? "").trim();
}

function resolveLlmBaseUrl(): string {
  return (process.env.LLM_BASE_URL ?? "").trim();
}

function resolveLlmApiKey(): string {
  return (process.env.LLM_API_KEY ?? "").trim();
}

function resolveDatabaseUrl(): string {
  return (process.env.DATABASE_URL ?? "").trim();
}

function resolveTimezone(): string {
  const raw = (process.env.TZ ?? "").trim();
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

  const botToken = (process.env.BOT_TOKEN ?? "").trim();
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
    botToken: (process.env.BOT_TOKEN ?? "").trim(),
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
  /** OpenAI-compatible API key from env (LLM_API_KEY). Local servers can leave it empty. */
  llmApiKey: resolveLlmApiKey(),
  /** ERROR = errors only; DEBUG = lifecycle events. Use dashboard Debug page for message traces. */
  loggingLevel: resolveLoggingLevel(),
  /** IANA timezone (TZ env, default UTC). Scheduled tasks fire at wall-clock times in this zone. */
  timezone: resolveTimezone(),
};
