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
cp .env.example .env   # BOT_TOKEN, LLM_BASE_URL, VRAM_AVAILABLE
npm run dev
```

- UI: http://localhost:5173 (Vite)
- API + bot: http://localhost:3000 (Vite proxies `/api` there)

## Env

| Variable | Where | Default |
|----------|-------|---------|
| `BOT_TOKEN` | everywhere | required |
| `LLM_BASE_URL` | everywhere | required (OpenAI-compatible API base URL) |
| `VRAM_AVAILABLE` | everywhere | required (GPU GB, e.g. `24`) |
| `LLM_API_KEY` | optional | empty (local servers usually skip this) |
| `TAVILY_API_KEY` | optional | empty (web search off) |
| `LOGGING_LEVEL` | optional | `ERROR` (`DEBUG`) |
| `PORT` | Docker / Portainer only | `3000` |

Do not put `PORT` in `.env` for local dev — it is only for `docker-compose.yml` (`PORT:PORT` mapping + app listen).

LLM base URL and API key are set in **`.env`** (`LLM_BASE_URL`, optional `LLM_API_KEY`). Model, prompts, owner, maintenance mode, and performance limits live in the **dashboard** (SQLite). Tavily is configured via **`TAVILY_API_KEY`** in `.env`.

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
- **Modular features** — LLM side passes packaged as stateless workspace modules under `modules/` (see [Feature modules](#feature-modules))

## Feature modules

Bot capabilities are split into small **stateless npm packages** (microservice-style contracts, same Node process). Each module lives in `modules/<name>/`, is imported as `@llm-tg-bot/modules-<name>`, and defines typed **input**, **config**, and **output**.

| Module | Role |
|--------|------|
| `@llm-tg-bot/modules-utils` | Shared contract types and auxiliary LLM helpers |
| `@llm-tg-bot/modules-addressing-detection` | Group address detection (@mention, reply, display name + LLM) |
| `@llm-tg-bot/modules-search-decision` | Decides whether a message needs web search and extracts the query (LLM) |
| `@llm-tg-bot/modules-web-search` | Runs web search and formats context/sources for the main reply |

Example (`addressing-detection`):

- **Input:** `{ message: string }` (+ optional `sender`, `chatType`)
- **Config:** `{ baseUrl, model, botUsername, botDisplayName }`
- **Output:** `{ result: boolean, reason: string }`

The Telegram bot host (`server/`) wires modules to Grammy handlers, SQLite settings, and debug tracing. In dev, `tsx` resolves modules from `src/` via `server/tsconfig.json` paths (no rebuild). Production uses `npm run build:modules` before `npm run build`.

## Stack

Node 22.13+, TypeScript, Grammy, Express, SQLite, React (Vite), Docker.

## License

ISC
