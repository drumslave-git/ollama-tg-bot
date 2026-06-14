# AGENTS.md

Guidance for AI agents working in this repository.

## Project summary

Telegram bot backed by **OpenAI-compatible API**, with a **React dashboard** for configuration. One Node process runs the Grammy bot, Express API, and (in production) serves the built dashboard.

| Workspace | Role |
|-----------|------|
| `server/` | Bot, LLM client, SQLite, REST API |
| `dashboard/` | Vite + React admin UI |

## Commands

```bash
npm install
cp .env.example .env          # BOT_TOKEN required
npm run dev                   # server :3000 + dashboard :5173 (API proxied)
npm run build                 # dashboard dist + server tsc
npm run start                 # production server only
```

Per-workspace:

```bash
npm run dev -w server
npm run build -w server
npm run build -w dashboard
```

Docker: `docker compose up -d --build` (see `README.md`).

**Node:** `>=22.13.0` (see `.nvmrc`).

## Environment

| Variable | Purpose |
|----------|---------|
| `BOT_TOKEN` | Telegram bot token (required) |
| `VRAM_AVAILABLE` | GPU VRAM in GB (required); derives context window budget |
| `OPENAI_API_KEY` | Optional API key for authenticated OpenAI-compatible endpoints |
| `LOGGING_LEVEL` | `ERROR` (default), `DEBUG` (lifecycle events to console) |
| `TAVILY_API_KEY` | Optional web search via Tavily |
| `PORT` | Docker/production listen port only — not for local dev |
| `DATABASE_PATH` | Optional SQLite path (default `data/bot.db`) |

API base URL, model, prompts, owner, maintenance mode, and performance limits live in **dashboard settings** (SQLite), not `.env`.

## Architecture

```
Telegram → Grammy handlers → chat-turn → LLM
                ↓
         SQLite (settings, history, memories, stats)
                ↑
         Express /api ← dashboard (Vite dev proxy)
```

### Message flow

1. **`server/src/bot/handlers.ts`** — Register **commands before** the catch-all `bot.on("message")`. Generic message handlers must not block command handlers (Grammy middleware order).
2. **`server/src/bot/maintenance.ts`** — When `maintenanceModeEnabled` is on, non-owner messages are dropped before any LLM work (address check, vision, chat turn). Also gates passive group history in `history-record.ts`.
3. **`server/src/bot/chat-turn.ts`** — One user turn: optional link fetch (Playwright), optional Tavily search, build messages, LLM chat, Telegram reply, history + memory scheduling.
4. **`server/src/bot/conversation.ts`** — Assembles system prompt, history, reply context, group speaker wrapping.
5. **`server/src/prompts.ts`** — Base system prompt; custom prompt from settings appended.

### LLM

- Client: `server/src/llm/client.ts` (OpenAI SDK → `/v1/chat/completions`; optional `showModel` / catalog fetch for context-budget metadata)
- OpenAI-compatible parsing: `server/src/llm/openai-compat.ts` (`content` vs `reasoning` / `reasoning_content`, request `options`)
- Debug traces: `server/src/debug-trace.ts`, `server/src/db/debug-traces.ts` — per-message processing stored in SQLite (50 per chat); LLM I/O recorded when a trace session is active
- Chat options: `server/src/settings-limits.ts` (`temperature`, `topP`, `topK`, `repeatPenalty`, `numCtx` via `getProviderExtensions()`)
- **Chat history limits are derived** from `numCtx` and `numPredict` via `getHistoryLimits()` — not separate settings. Dashboard preview: `dashboard/src/derivedHistoryLimits.ts` (keep in sync with server).

**OpenAI-compatible backends:** Chat requests send provider-specific `options` plus `reasoning_effort` (`"medium"` when `thinkingEnabled` is on, `"none"` when off). Some models/backends mis-split when thinking is enabled via API (`content` empty, answer in `reasoning`); structured `[REPLY]` replies require the full answer in `message.content`. Parse **`message.content`** for `[REPLY]` (Telegram reply). Parse **`message.reasoning_content`** / **`reasoning`** as chain-of-thought only — never for replies. Extensions: `providerChatExtensions()` in `openai-compat.ts`.

**Terminology — OpenAI-compatible only:** This project targets **any OpenAI-compatible API** (LocalAI, vLLM, llama.cpp server, cloud providers, etc.). Do **not** use vendor-specific names in code, comments, docs, or agent replies — especially **“Ollama”**. Describe behavior in neutral terms: “OpenAI-compatible API”, “provider”, “backend”, “optional model metadata endpoints”. Some servers expose non-standard routes such as `POST /api/show` or `GET /api/tags` for context length and model size; treat these as **optional provider extensions** (best-effort, fail silently if absent). Primary integration is always `/v1/models` and `/v1/chat/completions`.

### Memory

Three layers, extracted in a **background pass** (`server/src/memory-extract.ts`), not in the main reply:

- Per-user, per-group, general — see `server/src/db/*-memory.ts`
- User/group memories are merged into one entity document during persistence.

### Group behavior

- Bot responds when @mentioned, replied to, named (LLM check), or on random/image toggles.
- Per-member history in groups (`conversationKey` includes `userId`).
- Owner account: `ownerUsername` in settings; id resolved via Telegram API + `known_users` table. Owner-only commands: `/mood`, `/explain`, `/remember`.
- **Maintenance mode** (`maintenanceModeEnabled`): non-owner events must not reach the LLM — gate in `handlers.ts` before `isMessageAddressedToBot` and in `history-record.ts` for passive history/vision/compression triggers.

### Response format

Model replies use `[REPLY]…[/REPLY]` (Telegram HTML subset). Parser: `server/src/response-format.ts` — accepts closed blocks, unclosed `[REPLY]` (Gemma often omits `[/REPLY]`), or spoken text before a trailing empty `[REPLY]` tag when the model echoes `[assistant said]`.

**LLM response fields:** User-facing text comes from the API `content` field. Chain-of-thought / reasoning comes from the separate `reasoning` (or `reasoning_content`) field — sent to Telegram only when `thinkingEnabled` and `sendThinkingEnabled` are on. Never merge reasoning into the reply body.

## Code conventions

- **ESM** throughout; server imports use `.js` extensions (`"type": "module"`).
- **Minimal diffs** — match existing style, naming, and patterns in the file you edit.
- **No migrations / backward compatibility** — do not create migrations or worry about backward compatibility unless explicitly requested; data loss is acceptable, but warn the user in such cases.
- **No drive-by refactors** or unrelated changes.
- **Do not commit** unless the user asks. Do not put secrets in git (`.env`, tokens).
- **No vendor-specific LLM naming** — say “OpenAI-compatible API / provider / backend”, not product names (e.g. Ollama). Optional metadata routes (`/api/show`, `/api/tags`) are provider extensions, not the primary contract.
- **SQLite settings** — add new keys to `DEFAULT_SETTINGS` in `server/src/db/database.ts`, validation in `settings-limits.ts`, allowed PATCH keys in `server/src/api/routes.ts`, and dashboard `Settings` in `dashboard/src/api.ts`.

## Dashboard pages

| Route | Purpose |
|-------|---------|
| `/` | Overview, stats, error log |
| `/character` | Default + custom system prompts |
| `/settings` | LLM, model, owner, maintenance mode, performance, vision |
| `/memories` | User / group / general facts |
| `/mood` | Mood state and defaults |
| `/debug` | Per-message processing traces (chat → message → step detail) |
| `/data` | Raw SQLite table browser |

State: `dashboard/src/context/DashboardContext.tsx`. API client: `dashboard/src/api.ts`.

## Telegram specifics

- Entity offsets are **UTF-16 code units** (same as JS strings) — see `sliceEntity` in `server/src/bot/addressed.ts`.
- Group commands often need `/cmd@BotUsername` when privacy mode is on.
- Mention handling: `server/src/bot/mentions.ts` (skip self-mentions and bot mention for address detection).

## Key files

| Area | Files |
|------|-------|
| Bot entry | `server/src/bot/index.ts`, `handlers.ts` |
| Maintenance | `server/src/bot/maintenance.ts`, `owner.ts` |
| Settings DB | `server/src/db/database.ts`, `server/src/api/routes.ts` |
| History | `server/src/db/history.ts` |
| Vision | `server/src/bot/message-media.ts`, `server/src/llm/images.ts` |
| Search | `server/src/bot/search-analyze.ts`, `server/src/tavily/client.ts` |
| Link fetch | `server/src/bot/link-extract.ts`, `server/src/bot/link-fetch.ts`, `server/src/playwright/client.ts` |
| HTML replies | `server/src/telegram/html.ts` |

## Testing
- **Always run tests after completing a task.**
- **Maintain test coverage continuously for all new features and bug fixes.**

[Vitest](https://vitest.dev) drives two suites (server workspace):

- **Mocked unit suite (committable, default):** `npm test` (root) or `npm run test -w server`. Pure logic only — no network, LLM, or Telegram. Lives in `server/test/unit/**`; shared `Settings` fixture in `server/test/helpers/settings.ts`. Config: `server/vitest.config.ts`. Run `npm run test:watch -w server` while developing.
- **Live LLM suite (opt-in):** `npm run test:llm` (root) or `npm run test:llm -w server`. Hits a real OpenAI-compatible backend through the production prompt-builders and parsers. Covers chat round-trip plus every LLM-backed side pass: address detection (`address-analyze-prompt.ts`), web-search decision (`search-analyze-prompt.ts`), memory extract/dedup/merge (`memory-prompt.ts`), and mood (`mood-prompt.ts`). Requires `LLM_BASE_URL` and `LLM_MODEL` (optional `OPENAI_API_KEY`); self-skips when they are absent. Lives in `server/test/live/**`. Config: `server/vitest.live.config.ts`. `TAVILY_API_KEY` is force-cleared in `test/live/setup-env.ts` so no run can hit Tavily.
- **Side-pass prompts are DB-free modules:** each LLM-backed side pass keeps its system prompt + `build*Messages()` builder + parser in a pure `*-prompt.ts` module (no DB/LLM imports); the orchestrator module (`address-analyze.ts`, `search-analyze.ts`, `memory-extract.ts`, `mood-evaluate.ts`) re-exports them. Import from the `*-prompt` module in tests so the committable suite never loads `node:sqlite`.
- **Auxiliary generation budget:** reasoning backends spend tokens on hidden chain-of-thought before emitting the structured block, so side passes need a generous `max_completion_tokens`. The floor is `AUXILIARY_NUM_PREDICT` (settings-limits); memory merge raises its own budget (`MEMORY_MERGE_NUM_PREDICT`). Too low a budget makes a pass return empty `content` and silently fail.

After server changes: `npm run build -w server`. After dashboard changes: `npm run build -w dashboard`. Manually verify bot commands (`/start`, `/id`, `/reset`) and dashboard save/load.

## Common pitfalls

1. Registering `bot.on("message")` **before** `bot.command(...)` breaks slash commands.
2. Duplicating history limit math — use `getHistoryLimits()` on server only; mirror in dashboard for UI preview only.
3. Assuming `@username` resolves without the user having messaged the bot at least once.
4. Editing only server or only dashboard types when adding a setting — update both + PATCH allowlist.
5. New LLM entry points must respect maintenance mode (`isMaintenanceBlocked`) — not only the main message handler.
6. Naming LLM integration after a single vendor (especially Ollama) — the codebase and docs must stay provider-neutral; chat goes through OpenAI-compatible endpoints.
