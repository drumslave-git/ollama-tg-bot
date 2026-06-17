# AGENTS.md

Guidance for AI agents working in this repository.

**Maintain this file.** Treat `AGENTS.md` as living documentation: update it in the same task whenever you change workflows, commands, architecture, conventions, testing gates, or other agent expectations. Remove or rewrite stale sections when behavior changes — never leave contradictory leftovers for the next agent.

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
npm test                      # post-task gate: all module + server unit tests
npm run typecheck             # post-task gate: server, dashboard, and all modules
npm run build                 # production compile (modules + dashboard + server)
npm run build:modules         # compile feature packages only (production / start)
npm run start                 # production server only
```

Per-workspace commands (debugging during development — **not** the post-task gate):

```bash
npm run dev -w server
npm run build -w server
npm run build -w dashboard
npm run test -w server
npm run typecheck -w @llm-tg-bot/modules-addressing-detection
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
| `@llm-tg-bot/modules-addressing-detection` | Group address detection (@mention, reply, display name + LLM) |
| `@llm-tg-bot/modules-search-decision` | Whether a message needs web search + query extraction (LLM side pass) |
| `@llm-tg-bot/modules-vision` | Telegram media download, sticker previews, and vision-model image description |
| `@llm-tg-bot/modules-completions` | System prompt assembly and main LLM reply (pipeline hosts); owner `/explain` bot command |
| `@llm-tg-bot/modules-history` | Turn setup, passive history, history inject/record (pipeline hosts) |
| `@llm-tg-bot/modules-mood-evaluation` | Personality + mood injection; `/mood` bot command |

**Contract** — every module defines typed `input`, `config`, and `output`, and exposes a `run(input, config)` function (plus a `ModuleDefinition` object with `id`):

```typescript
// addressing-detection
input:  { message: string; sender?: string; chatType?: string }
config: { baseUrl: string; model: string; botUsername: string; botDisplayName: string; apiKey?: string; chatComplete?: … }
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
6. **`server/src/bot/maintenance/maintenance.ts`** — When `maintenanceModeEnabled` is on, only the owner can proceed; in groups the owner must also include a direct @mention of the bot.

### LLM

- Client: `server/src/llm/client.ts` (OpenAI SDK → `/v1/chat/completions`; optional `showModel` / catalog fetch for context-budget metadata)
- OpenAI-compatible parsing: `server/src/llm/openai-compat.ts` (`content` vs `reasoning` / `reasoning_content`, request `options`)
- Debug traces: `server/src/debug/message-report.ts`, `server/src/db/debug/traces.ts` — per-message processing stored in SQLite (50 per chat); traces persist as **processing** as soon as the bot **receives** a message (Socket.IO `dashboard:debug` pushes list + detail updates); routing starts as **pending** until accept/ignore; a 2s heartbeat re-persists in-flight traces for live duration; phase updates stream while the turn runs; in-flight LLM calls add a **waiting** phase (`Waiting for LLM · {model} · up to {timeout}s`) until the provider responds or times out; LLM I/O recorded when a trace session is active; memory extraction shows one **Memory extraction** row (runs after reply on addressed turns; passive extraction only on ignored turns); pipeline hosts may omit expected no-op steps from the trace via `shouldRun: { run: false, omitFromReport: true }`
- Chat options: `server/src/settings/limits.ts` (`temperature`, `topP`, `topK`, `repeatPenalty`, `numCtx` via `getProviderExtensions()`)
- **Chat history limits are derived** from `numCtx` and `numPredict` via `getHistoryLimits()` — not separate settings. Dashboard preview: `dashboard/src/derivedHistoryLimits.ts` (keep in sync with server).

**OpenAI-compatible backends:** Chat requests send provider-specific `options` plus `reasoning_effort` (dashboard `reasoningEffort` on the main reply when `thinkingEnabled` is on; **`"low"` on all auxiliary side passes**; `"none"` when thinking is off). JSON replies require the full answer in `message.content`. When thinking is on, every pass keeps `response_format: json_schema` with an extra required **`reasoning`** string field in the schema; chain-of-thought is read from that JSON field (API `reasoning` / `reasoning_content` is a fallback). Parse decision/reply fields from `content` JSON only — never merge `reasoning` into user-facing text. Extensions: `providerChatExtensions()` and `responseFormatForThinking()` in `@llm-tg-bot/modules-utils`.

**Terminology — OpenAI-compatible only:** This project targets **any OpenAI-compatible API** (LocalAI, vLLM, llama.cpp server, cloud providers, etc.). Do **not** use vendor-specific names in code, comments, docs, or agent replies — especially **“Ollama”**. Describe behavior in neutral terms: “OpenAI-compatible API”, “provider”, “backend”, “optional model metadata endpoints”. Some servers expose non-standard routes such as `POST /api/show` or `GET /api/tags` for context length and model size; treat these as **optional provider extensions** (best-effort, fail silently if absent). Primary integration is always `/v1/models` and `/v1/chat/completions`.

### Memory

Three layers, extracted in a **background pass** by the memory module's pipeline host (`modules/memory/server/`), not in the main reply:

- Per-user, per-group, general — see `server/src/db/*-memory.ts`
- User/group memories are merged into one entity document during persistence.
- Extraction learns **personality, preferences, boundaries, and bot-feedback** (what users appreciate vs find annoying), not just encyclopedic facts. In group chats, `observed_user_facts` can update other known participants' user memories when the turn reveals durable traits about them.
- Injected memories include a **usage preamble** (`MEMORY_USAGE_PREAMBLE`) so the main reply adapts tone and behavior over time — not only factual recall.

### Group behavior

- Bot responds when @mentioned, replied to, display name is spoken (regex or LLM for other languages), or on random/image toggles.
- Per-member history in groups (`conversationKey` includes `userId`).
- Owner account: `ownerUsername` in settings; id resolved via Telegram API + `known_users` table. Owner-only commands: `/mood`, `/explain` (completions module), `/remember`.
- **Maintenance mode** (`maintenanceModeEnabled`): only the owner can reach the pipeline; in groups the owner must also include a direct @mention of the bot — gate in `handlers/message.ts`.

### Structured LLM output (JSON schema)

Side passes and the main reply use **strict JSON schemas** enforced via OpenAI-compatible `response_format`. Each module exports a `*_RESPONSE_FORMAT` constant; when `thinkingEnabled` is on, `responseFormatForThinking()` adds a required **`reasoning`** string field. Prompts describe the same fields in prose. Parsers validate decision/reply fields only — they must not be loosened to accept model mistakes.

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
- **Main reply:** `MAIN_REPLY_RESPONSE_FORMAT` + `buildReplyFormatSpec()` in `modules/completions/server/src/response-format.ts` (`{ reply: string }`)

### Response format

Model replies use `{ "reply": "…" }` (Telegram HTML subset inside `reply`). Parser: `modules/completions/server/src/response-format.ts` — see **Structured LLM output (JSON schema)** above; do not expand the parser for new model quirks.

**LLM response fields:** User-facing text comes from the API `content` JSON (`reply`, `addressed`, etc.). Chain-of-thought comes from the JSON `reasoning` field when thinking is on (`mergeAssistantReasoning()` prefers JSON, then API `reasoning` / `reasoning_content`) — sent to Telegram only when `thinkingEnabled` and `sendThinkingEnabled` are on. Never merge reasoning into the reply body or use it to recover malformed JSON.

## Code conventions

- **Keep `AGENTS.md` current** — part of every task that touches documented behavior; see the intro.
- **ESM** throughout; server imports use `.js` extensions (`"type": "module"`).
- **Minimal diffs** — match existing style, naming, and patterns in the file you edit.
- **No migrations / backward compatibility** — do not create migrations or worry about backward compatibility unless explicitly requested; data loss is acceptable, but warn the user in such cases.
- **No drive-by refactors** or unrelated changes.
- **Do not commit** unless the user asks. Do not put secrets in git (`.env`, tokens).
- **English-only source** — tests, prompts, comments, and code must be written in proper English. No Cyrillic and no transliteration of foreign words.
- **No vendor-specific LLM naming** — say “OpenAI-compatible API / provider / backend”, not product names (e.g. Ollama). Optional metadata routes (`/api/show`, `/api/tags`) are provider extensions, not the primary contract.
- **SQLite settings** — add new keys to `DEFAULT_SETTINGS` in `server/src/db/database.ts`, validation in `server/src/settings/limits.ts`, allowed PATCH keys in `server/src/api/routes/settings.ts`, and dashboard `Settings` in `dashboard/src/api.ts`.

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
| Vision | `modules/vision/server/`; vision describe wired in `server/src/pipeline/adapters/callbacks.ts` |
| Completions | `modules/completions/server/` (system prompt + LLM reply pipeline hosts, `/explain` bot host, reply JSON schema); host adapter `server/src/pipeline/adapters/system-prompt.ts` |
| Search decision | `modules/search-decision/server/` |
| Web search | `modules/web-search/server/`; Tavily adapter in pipeline callbacks |
| Memory | `modules/memory/server/` (pipeline hosts); extract logic in module |
| Link fetch | `modules/link-fetch/server/` |
| Sticker selection | `modules/sticker-selection/server/` |
| Mood evaluation | `modules/mood-evaluation/server/` (personality + mood pipeline hosts, `/mood` bot host) |
| HTML replies | `server/src/telegram/html.ts`, `server/src/bot/replies/delivery.ts` |

## Testing

**Post-task gate — required after every task, no exceptions:**

```bash
npm test
npm run typecheck
```

Run both from the repo root. Do not substitute `npm run test -w …` or `npm run typecheck -w …` unless the user explicitly asks for a scoped run.

Maintain test coverage for all new features and bug fixes. Update `AGENTS.md` when your changes affect anything documented there (see intro).

### What `npm test` covers

[Vitest](https://vitest.dev) runs every `@llm-tg-bot/modules-*` unit suite (`<module>/test/`) plus the mocked server suite (`server/test/unit/**`; fixture in `server/test/helpers/settings.ts`; config `server/vitest.config.ts`).

### Opt-in live LLM suites

Not part of the post-task gate unless the user asks. Root: `npm run test:llm`. Requires `LLM_BASE_URL` and `LLM_MODEL` (optional `OPENAI_API_KEY`); suites self-skip when unset. Module live tests: addressing-detection, search-decision, memory, mood-evaluation. Server live config: `server/vitest.live.config.ts`; `TAVILY_API_KEY` is force-cleared in `test/live/setup-env.ts`.

### Auxiliary generation budget

Reasoning backends spend tokens on hidden chain-of-thought before emitting the structured block, so side passes need a generous `max_completion_tokens`. The floor is `AUXILIARY_NUM_PREDICT` when thinking is off and `AUXILIARY_REASONING_NUM_PREDICT` when it is on (`server/src/settings/limits.ts` on server, `@llm-tg-bot/modules-utils` for packages); memory merge raises its own budget (`MEMORY_MERGE_NUM_PREDICT`). Too low a budget makes a pass return empty `content` and silently fail.

## Common pitfalls

1. Registering `bot.on("message")` **before** `bot.command(...)` breaks slash commands.
2. Duplicating history limit math — use `getHistoryLimits()` on server only; mirror in dashboard for UI preview only.
3. Assuming `@username` resolves without the user having messaged the bot at least once.
4. Editing only server or only dashboard types when adding a setting — update both + PATCH allowlist.
5. New LLM entry points must respect maintenance mode (`isMaintenanceBlocked`) — not only the main message handler.
6. Naming LLM integration after a single vendor — the codebase and docs must stay provider-neutral; chat goes through OpenAI-compatible endpoints (see **Code conventions**).
7. **Loosening JSON parsers** when a model returns the wrong shape or puts the answer in `reasoning` — improve the prompt/schema instead (see **Structured LLM output (JSON schema)**).
