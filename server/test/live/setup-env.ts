import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/**
 * Load `.env` from the repo root for the live suite so `LLM_BASE_URL`,
 * `LLM_MODEL`, and an optional `LLM_API_KEY` are available. Values already
 * present in the process environment win over the file.
 */
const here = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(here, "..", "..", "..", ".env");
if (existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
}

// Tests must never hit Tavily web search. Drop any key loaded from `.env` so
// `isTavilyConfigured()` is false and no external search request can be made,
// even if a test imports a module that touches the Tavily client.
delete process.env.TAVILY_API_KEY;
