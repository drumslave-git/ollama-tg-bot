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
| `EMBEDDING_API_KEY` | optional | falls back to `LLM_API_KEY` (API key for the embedding host) |
| `TAVILY_API_KEY` | optional | empty (web search off) |
| `LOGGING_LEVEL` | optional | `ERROR` (`DEBUG`) |
| `PORT` | Docker / Portainer only | `3000` |

Do not put `PORT` in `.env` for local dev — it is only for `docker-compose.yml` (`PORT:PORT` mapping + app listen).

**Docker secrets:** every variable also accepts a `<NAME>_FILE` variant — when set, the file's contents are used instead of the literal value. Use this to feed credentials from mounted secret files: `BOT_TOKEN_FILE`, `TAVILY_API_KEY_FILE`, and `PG_PASSWORD_FILE` (overrides the password embedded in `DATABASE_URL`). `docker-compose.yml` ships a commented `secrets:` block you can uncomment to wire them up.

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
| `link-fetch` | Playwright page read via `read_page` MCP tool |
| `vision` | Media download, sticker previews, vision-model image description |
| `history` | Per-chat message storage, formatting, compression, prompt injection |
| `mood` | Personality + mood injection; `/mood` command |
| `sticker` | Sticker selection pass |
| `memory` | Per-user/group/general fact extraction (background job) |
| `completions` | System prompt assembly + main LLM reply; `/explain` command |

Pipeline order is declared in `server/src/runtime/feature-hosts.ts`; feature metadata/db/MCP wiring lives in `server/src/runtime/feature-registry.ts`. Shared helpers are in `server/src/shared/`. In dev, `tsx` runs the server directly from `src/` (no build step for features).

## Releases (Docker Hub)

Images are published to Docker Hub at [`drumslave-git/llm-tg-bot`](https://hub.docker.com/r/drumslave-git/llm-tg-bot) by the [`Publish Docker image`](.github/workflows/publish.yml) GitHub Action.

The `version` field in the root [`package.json`](package.json) is the single source of truth. On every push to `main`, the workflow tags the commit `v<version>` **if that tag does not already exist yet**, then builds and pushes the image with tags `<version>`, `<major>.<minor>`, `<major>`, and `latest`. If the tag already exists (version unchanged), the run is a no-op — so ordinary commits don't republish.

**To cut a release:** bump the version, commit, and push to `main`.

```bash
npm run release:patch   # 1.0.0 -> 1.0.1  (also release:minor / release:major)
git commit -am "Release v1.0.1"
git push
```

These scripts only edit `package.json` (`--no-git-tag-version`); the CI creates and pushes the git tag so it stays the tag authority.

**Required repo secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|-------|
| `DOCKERHUB_USERNAME` | Docker Hub account/namespace (`drumslave-git`) |
| `DOCKERHUB_TOKEN` | Docker Hub [access token](https://hub.docker.com/settings/security) with Read/Write scope |

The image is built for `linux/amd64`.

### Running the published image

The base `docker-compose.yml` builds locally (`build: .`). To run the published image instead, add the [`docker-compose.prod.yml`](docker-compose.prod.yml) overlay, which overrides only the `bot` service to pull from Docker Hub:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Pin a specific release with `IMAGE_TAG` in `.env` (e.g. `IMAGE_TAG=1.2.3`); it defaults to `latest`.

## Stack

Node 22.13+, TypeScript, Grammy, Express, Postgres + pgvector, React (Vite), Docker.

## License

ISC
