# OpenAI-compatible Telegram Bot

Telegram bot backed by any **OpenAI-compatible chat completions API** (LocalAI, Ollama, vLLM, OpenAI, etc.), with a web dashboard for configuration and stats.

## Docker

```bash
# .env or Portainer: BOT_TOKEN=...  optional PORT=3000
docker compose up -d --build
```

Open `http://localhost:3000` (or your `PORT`). Set `LLM_BASE_URL` in `.env` before starting.

## Local dev

```bash
npm install
cp .env.example .env   # BOT_TOKEN, LLM_BASE_URL, DATABASE_URL
docker compose up -d db # start Postgres + pgvector (or point DATABASE_URL at your own)
npm run dev
```

- UI: http://localhost:5173 (Vite)
- API + bot: http://localhost:3000 (Vite proxies `/api` there)

Storage is **Postgres** with the `pgvector` extension (the bundled `db` compose
service provides it). Set `DATABASE_URL` accordingly.

## Env

| Variable | Where | Default |
|----------|-------|---------|
| `BOT_TOKEN` | everywhere | required |
| `LLM_BASE_URL` | everywhere | required (OpenAI-compatible API base URL) |
| `DATABASE_URL` | everywhere | required (Postgres + pgvector connection string) |
| `LLM_API_KEY` | optional | empty (local servers usually skip this) |
| `EMBEDDING_BASE_URL` | optional | falls back to `LLM_BASE_URL` (base URL for the embedding model) |
| `TAVILY_API_KEY` | optional | empty (web search off) |
| `LOGGING_LEVEL` | optional | `ERROR` (`DEBUG`) |
| `PORT` | Docker / Portainer only | `3000` |

Do not put `PORT` in `.env` for local dev — it is only for `docker-compose.yml` (`PORT:PORT` mapping + app listen).

LLM base URL and API key are set in **`.env`** (`LLM_BASE_URL`, optional `LLM_API_KEY`). Model, embedding model, prompts, owner, maintenance mode, and performance limits live in the **dashboard** (stored in Postgres). Tavily is configured via **`TAVILY_API_KEY`** in `.env`.

### Web search (Tavily)

With `TAVILY_API_KEY` set, the model decides whether a message needs a web search; the bot calls [Tavily](https://tavily.com) and injects the summary plus sources before replying.

### Link fetch (Playwright)

When an addressed message contains `http(s)` links, the bot detects them, opens up to three pages with [Playwright](https://playwright.dev), and injects title plus page text before the main reply. Docker images install Chromium automatically; for local dev run `npx playwright install chromium` once after `npm install`.

## Features

- Group & private chats, vision (images/stickers), optional random group replies
- Optional web search via Tavily (model decides when to search)
- Opens links in addressed messages via Playwright (auto-detected URLs)
- **Maintenance mode** — dashboard toggle; when on, only the configured owner can trigger LLM-backed behavior (others are ignored silently)
- Dashboard: model, owner, prompts, stats (LLM URL from `LLM_BASE_URL` in `.env`)
- **Feature folders** — LLM side passes organized under `server/src/features/<name>` (see [Feature architecture](#feature-architecture))

## Feature architecture

Bot capabilities are organized as plain folders under `server/src/features/<name>/` — one Node process, no separate packages. Each feature contributes one or more **pipeline hosts** (with typed `run`/`shouldRun`), and may add Postgres tables (`features/<name>/db/`), an MCP tool (`register-mcp-tools.ts`), and a dashboard page (`dashboard/src/features/<name>/`).

| Feature | Role |
|---------|------|
| `addressing` | Group address detection (@mention, reply, display name + LLM) |
| `web-search` | Tavily web search via `search_web` MCP tool during the main reply |
| `link-fetch` | Playwright page fetch via `fetch_link` MCP tool |
| `vision` | Media download, sticker previews, vision-model image description |
| `history` | Per-chat message storage, formatting, compression, prompt injection |
| `mood` | Personality + mood injection; `/mood` command |
| `sticker` | Sticker selection pass |
| `memory` | Per-user/group/general fact extraction (background job) |
| `completions` | System prompt assembly + main LLM reply; `/explain` command |

Pipeline order is declared in `server/src/runtime/feature-hosts.ts`; feature metadata/db/MCP wiring lives in `server/src/runtime/feature-registry.ts`. Shared helpers are in `server/src/shared/`. In dev, `tsx` runs the server directly from `src/` (no build step for features).

## Stack

Node 22.13+, TypeScript, Grammy, Express, Postgres + pgvector, React (Vite), Docker.

## License

ISC
