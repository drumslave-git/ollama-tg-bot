# AGENTS.md

Guidance for AI agents working in this repository.

## Project summary

Telegram bot backed by **OpenAI-compatible API**, with a **React dashboard** for configuration. One Node process runs the Grammy bot, Express API, and (in production) serves the built dashboard.

| Workspace | Role |
|-----------|------|
| `server/` | Bot, LLM client, SQLite, REST API |
| `modules/*` | Feature packages (`server/`, optional `ui/`, `db/`, `manifest.json`) |
| `dashboard/` | Vite + React admin UI |

## Commands

```bash
npm install
cp .env.example .env          # BOT_TOKEN required
npm run dev                   # server :3000 + dashboard :5173 (modules watched from src)
npm run build                 # modules + dashboard dist + server tsc
npm run build:modules         # compile feature packages (production / start only)
npm run start                 # production server only
```

Per-workspace:

```bash
npm run dev -w server
npm run build -w server
npm run build -w dashboard
npm run test -w @llm-tg-bot/modules-addressing-detection
```

Docker: `docker compose up -d --build` (see `README.md`).

### Feature modules

LLM-backed bot features live in **npm workspace packages** under `modules/<name>/`. Each feature module has:

| Subfolder | Package | Role |
|-----------|---------|------|
| `server/` | `@llm-tg-bot/modules-<name>` | Stateless runtime logic (`run`, prompts, parsers) |
| `db/` | `@llm-tg-bot/modules-<name>-db` | SQLite tables + REST routes (optional) |
| `ui/` | `@llm-tg-bot/modules-<name>-ui` | Dashboard React page(s) (optional) |
| `manifest.json` | — | Discovery metadata for server + dashboard |

Shared infrastructure: `@llm-tg-bot/modules-utils` in `modules/utils/server/`, registry in `@llm-tg-bot/modules-registry` (`modules/registry/`).

| Package | Purpose |
|---------|---------|
| `@llm-tg-bot/modules-utils` | Shared `ModuleDefinition` contract, structured-output helpers, stateless auxiliary LLM client |
| `@llm-tg-bot/modules-addressing-detection` | Group name-variant address detection (LLM side pass) |
| `@llm-tg-bot/modules-search-decision` | Whether a message needs web search + query extraction (LLM side pass) |
| `@llm-tg-bot/modules-vision` | Telegram media download, sticker previews, and vision-model image description |
| `@llm-tg-bot/modules-completions` | System prompt assembly and main LLM reply (pipeline hosts); owner `/explain` bot command |
| `@llm-tg-bot/modules-history` | Turn setup, passive history, history inject/record (pipeline hosts) |
| `@llm-tg-bot/modules-mood-evaluation` | Personality + mood injection; `/mood` bot command |

**Contract** — every module defines typed `input`, `config`, and `output`, and exposes a `run(input, config)` function (plus a `ModuleDefinition` object with `id`):

```typescript
// addressing-detection
input:  { message: string; sender?: string; chatType?: string }
config: { baseUrl: string; model: string; botAliases: string[]; apiKey?: string; chatComplete?: … }
output: { result: boolean; reason: string }

// search-decision
input:  { message: string; replyContext?: string }
config: { baseUrl: string; model: string; apiKey?: string; chatComplete?: … }
output: { needsSearch: boolean; query: string | null; reason: string }

// web-search
input:  { query: string }
config: { apiKey: string; maxResults?: number }
output: { ok: boolean; results: …; sources: …; context: string; answer: string | null; reason: string }
```

Rules:

- **Stateless** — no SQLite, no Grammy `Context`, no global mutable state inside the package.
- **Own tests** — unit tests in `<module>/test/`; optional live LLM tests in `<module>/test/live/`.
- **Host adapter** — Telegram routing, settings, debug traces, and maintenance gates stay in `server/src/bot/*`; the host builds `config` from dashboard settings and may inject `chatComplete` for tracing.
- **Shared code** — cross-module helpers live in `@llm-tg-bot/modules-utils`, not in `server/src`.
- **Prompt-first output** — modules define strict `ANALYZER_SYSTEM` / `build*Messages()` specs; parsers stay strict (see **Structured LLM output**).

To add a module: create `modules/<name>/` with `manifest.json`, implement `server/` (`package.json` name `@llm-tg-bot/modules-<name>`), optionally `db/` and `ui/`, register workspaces in root `package.json`, add to `build:modules`, declare server deps in `server/package.json`, add dev `paths` in `server/tsconfig.json`, implement `run`, and cover with tests. The server discovers manifests at startup; the dashboard globs `modules/*/ui/src/index.tsx` for UI pages.


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
Telegram → Grammy handlers → message pipeline (module hosts) → delivery
                ↓
         SQLite (settings, history, memories, stats)
                ↑
         Express /api ← dashboard (Vite dev proxy)
```

### Message flow

1. **`server/src/bot/handlers/index.ts`** — Register **commands before** the catch-all `bot.on("message")`. Module commands via `registerModuleCommands()` from `server/src/runtime/module-hosts.ts`.
2. **`server/src/bot/handlers/message.ts`** — Intake filters, maintenance gate, then `runMessagePipeline()`; delivery via `server/src/pipeline/deliver.ts`.
3. **`server/src/pipeline/runner.ts`** — Runs phased module hosts (`preprocess` → `gate` → `not-addressed` → `pre-reply` → `reply` → `post-reply` → `background`). Server does not hard-code which modules run — hosts are discovered from manifests.
4. **`server/src/runtime/module-hosts.ts`** — Loads `pipelineHosts` and optional `botHost` from each module package at startup.
5. **`server/src/pipeline/adapters/callbacks.ts`** — Wires SQLite, Telegram helpers, and LLM adapters into `PipelineHostCallbacks` for modules.
6. **`server/src/bot/maintenance/maintenance.ts`** — When `maintenanceModeEnabled` is on, non-owner messages are dropped before the pipeline. History module gates passive recording the same way.

### LLM

- Client: `server/src/llm/client.ts` (OpenAI SDK → `/v1/chat/completions`; optional `showModel` / catalog fetch for context-budget metadata)
- OpenAI-compatible parsing: `server/src/llm/openai-compat.ts` (`content` vs `reasoning` / `reasoning_content`, request `options`)
- Debug traces: `server/src/debug-trace.ts`, `server/src/db/debug-traces.ts` — per-message processing stored in SQLite (50 per chat); LLM I/O recorded when a trace session is active
- Chat options: `server/src/settings-limits.ts` (`temperature`, `topP`, `topK`, `repeatPenalty`, `numCtx` via `getProviderExtensions()`)
- **Chat history limits are derived** from `numCtx` and `numPredict` via `getHistoryLimits()` — not separate settings. Dashboard preview: `dashboard/src/derivedHistoryLimits.ts` (keep in sync with server).

**OpenAI-compatible backends:** Chat requests send provider-specific `options` plus `reasoning_effort` (`"medium"` when `thinkingEnabled` is on, `"none"` when off). Some models/backends mis-split when thinking is enabled via API (`content` empty, answer in `reasoning`); JSON replies require the full answer in `message.content`. Parse **`message.content`** as JSON for the Telegram reply (`reply` field). Parse **`message.reasoning_content`** / **`reasoning`** as chain-of-thought only — never for replies. Extensions: `providerChatExtensions()` in `openai-compat.ts`. All structured passes also send `response_format: { type: "json_schema", json_schema: { strict: true, ... } }` via `@llm-tg-bot/modules-utils` (`strictObjectSchema`, `toOpenAiResponseFormat`).

**Terminology — OpenAI-compatible only:** This project targets **any OpenAI-compatible API** (LocalAI, vLLM, llama.cpp server, cloud providers, etc.). Do **not** use vendor-specific names in code, comments, docs, or agent replies — especially **“Ollama”**. Describe behavior in neutral terms: “OpenAI-compatible API”, “provider”, “backend”, “optional model metadata endpoints”. Some servers expose non-standard routes such as `POST /api/show` or `GET /api/tags` for context length and model size; treat these as **optional provider extensions** (best-effort, fail silently if absent). Primary integration is always `/v1/models` and `/v1/chat/completions`.

### Memory

Three layers, extracted in a **background pass** by the memory module's pipeline host (`modules/memory/server/`), not in the main reply:

- Per-user, per-group, general — see `server/src/db/*-memory.ts`
- User/group memories are merged into one entity document during persistence.

### Group behavior

- Bot responds when @mentioned, replied to, named (regex or LLM name-variant module), or on random/image toggles.
- Per-member history in groups (`conversationKey` includes `userId`).
- Owner account: `ownerUsername` in settings; id resolved via Telegram API + `known_users` table. Owner-only commands: `/mood`, `/explain` (completions module), `/remember`.
- **Maintenance mode** (`maintenanceModeEnabled`): non-owner events must not reach the pipeline — gate in `handlers/message.ts` and in the history module's passive-record host.

### Structured LLM output (JSON schema)

Side passes and the main reply use **strict JSON schemas** enforced via OpenAI-compatible `response_format`. Each module exports a `*_RESPONSE_FORMAT` constant; prompts describe the same fields in prose. Parsers in `*-prompt.ts`, `response-format.ts`, and feature modules validate JSON only — they must not be loosened to accept model mistakes.

**When the model misbehaves, fix the prompt or schema — not the parser.**

| Do | Don't |
|----|-------|
| Tighten system/user prompts so the model fills every required JSON field | Add fallbacks for alternate shapes (tags, bare yes/no, reasoning text) |
| State mandatory output rules and forbidden extras | Fall back to `reasoning` when `content` is malformed |
| Keep schema field names aligned with prompt prose | Invent new fields outside the schema |
| Repeat the required JSON shape in the user message tail when helpful | “Helpfully” accept partial or non-JSON output |

If output is unparseable after a prompt fix, treat it as a failed pass (ignore, error, or retry) — do not silently guess from reasoning or alternate formats.

Reference implementations:

- **Schema helpers:** `@llm-tg-bot/modules-utils` (`json-schema.ts`: `strictObjectSchema`, `parseJsonContent`, typed readers)
- **Address detection:** `@llm-tg-bot/modules-addressing-detection` (`ADDRESS_RESPONSE_FORMAT`, `{ addressed: boolean }`)
- **Search decision:** `@llm-tg-bot/modules-search-decision` (`SEARCH_RESPONSE_FORMAT`, `{ needs_search, query }`)
- **Main reply:** `MAIN_REPLY_RESPONSE_FORMAT` + `buildReplyFormatSpec()` in `server/src/response-format.ts` (`{ reply: string }`)

### Response format

Model replies use `{ "reply": "…" }` (Telegram HTML subset inside `reply`). Parser: `server/src/response-format.ts` — see **Structured LLM output (JSON schema)** above; do not expand the parser for new model quirks.

**LLM response fields:** User-facing text comes from the API `content` field (JSON). Chain-of-thought / reasoning comes from the separate `reasoning` (or `reasoning_content`) field — sent to Telegram only when `thinkingEnabled` and `sendThinkingEnabled` are on. Never merge reasoning into the reply body or use it to recover malformed JSON.

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
| `/modules` | Discovered feature modules list |
| `/modules/:id` | Per-module config/data UI (from module `ui/`) |
| `/debug` | Per-message processing traces (chat → message → step detail) |
| `/data` | Raw SQLite table browser |

State: `dashboard/src/context/DashboardContext.tsx`. API client: `dashboard/src/api.ts`.

## Telegram specifics

- Entity offsets are **UTF-16 code units** (same as JS strings) — see `sliceEntity` in `@llm-tg-bot/modules-addressing-detection`.
- Group commands often need `/cmd@BotUsername` when privacy mode is on.
- Mention handling: `server/src/bot/messages/mentions.ts` (skip self-mentions and bot mention for address detection).

## Key files

| Area | Files |
|------|-------|
| Bot entry | `server/src/bot/index.ts`, `handlers/index.ts`, `handlers/message.ts` |
| Pipeline | `server/src/pipeline/runner.ts`, `services.ts`, `deliver.ts`, `context.ts`, `runtime/module-hosts.ts` |
| Address detection | `modules/addressing-detection/server/` (pipeline hosts + `bot-identity.ts`) |
| Maintenance | `server/src/bot/maintenance/maintenance.ts`, `owner/owner.ts` |
| Settings DB | `server/src/db/database.ts`, `server/src/api/routes.ts` |
| History | `modules/history/server/` (pipeline hosts); SQLite in `server/src/db/history/` |
| Vision | `modules/vision/server/`; adapter `server/src/pipeline/vision-adapter.ts`; image resize `server/src/llm/images.js` |
| Completions | `modules/completions/server/` (system-prompt + LLM reply pipeline hosts, `/explain` bot host) |
| Search decision | `modules/search-decision/server/` |
| Web search | `modules/web-search/server/`; Tavily adapter in pipeline callbacks |
| Memory | `modules/memory/server/` (pipeline hosts); extract logic in module |
| Link fetch | `modules/link-fetch/server/` |
| Sticker selection | `modules/sticker-selection/server/` |
| Mood evaluation | `modules/mood-evaluation/server/` (personality + mood pipeline hosts, `/mood` bot host) |
| HTML replies | `server/src/telegram/html.ts`, `server/src/bot/replies/delivery.ts` |

## Testing
- **Always run tests after completing a task.**
- **Maintain test coverage continuously for all new features and bug fixes.**

[Vitest](https://vitest.dev) drives three areas:

- **Feature module suites:** `npm test` runs each `@llm-tg-bot/modules-*` package (unit tests in `<module>/test/`). Live LLM tests: `npm run test:llm -w @llm-tg-bot/modules-addressing-detection` (and search-decision, memory, mood-evaluation; requires `LLM_BASE_URL`, `LLM_MODEL`).
- **Mocked server suite (committable, default):** `npm run test -w server`. Pure logic only — no network, LLM, or Telegram. Lives in `server/test/unit/**`; shared `Settings` fixture in `server/test/helpers/settings.ts`. Config: `server/vitest.config.ts`.
- **Live LLM server suite (opt-in):** `npm run test:llm -w server`. Hits a real OpenAI-compatible backend for chat. Address, search-decision, memory, and mood-evaluation live tests live in their modules. Requires `LLM_BASE_URL` and `LLM_MODEL` (optional `OPENAI_API_KEY`); self-skips when absent. Config: `server/vitest.live.config.ts`. `TAVILY_API_KEY` is force-cleared in `test/live/setup-env.ts`.
- **Legacy side-pass prompts:** non-modular LLM side passes (if any remain) still keep system prompt + `build*Messages()` + parser in pure `*-prompt.ts` files until migrated to `server/src/modules/`.
- **Auxiliary generation budget:** reasoning backends spend tokens on hidden chain-of-thought before emitting the structured block, so side passes need a generous `max_completion_tokens`. The floor is `AUXILIARY_NUM_PREDICT` (`settings-limits` on server, `@llm-tg-bot/modules-utils` for packages); memory merge raises its own budget (`MEMORY_MERGE_NUM_PREDICT`). Too low a budget makes a pass return empty `content` and silently fail.

After server or module changes: `npm run build:modules` then `npm run build -w server`. After dashboard changes: `npm run build -w dashboard`. Manually verify bot commands (`/start`, `/id`, `/reset`) and dashboard save/load.

## Common pitfalls

1. Registering `bot.on("message")` **before** `bot.command(...)` breaks slash commands.
2. Duplicating history limit math — use `getHistoryLimits()` on server only; mirror in dashboard for UI preview only.
3. Assuming `@username` resolves without the user having messaged the bot at least once.
4. Editing only server or only dashboard types when adding a setting — update both + PATCH allowlist.
5. New LLM entry points must respect maintenance mode (`isMaintenanceBlocked`) — not only the main message handler.
6. Naming LLM integration after a single vendor (especially Ollama) — the codebase and docs must stay provider-neutral; chat goes through OpenAI-compatible endpoints.
7. **Loosening JSON parsers** when a model returns the wrong shape or puts the answer in `reasoning` — improve the prompt/schema instead (see **Structured LLM output (JSON schema)**).
