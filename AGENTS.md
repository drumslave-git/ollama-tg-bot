# AGENTS.md

Guidance for AI agents working in this repository.

**Maintain this file.** Treat `AGENTS.md` as living documentation: update it in the same task whenever you change workflows, commands, architecture, conventions, testing gates, or other agent expectations. Remove or rewrite stale sections when behavior changes — never leave contradictory leftovers for the next agent.

## Project summary

Telegram bot backed by **OpenAI-compatible API**, with a **React dashboard** for configuration. One Node process runs the Grammy bot, Express API, and (in production) serves the built dashboard.

| Workspace | Role |
|-----------|------|
| `server/` | Bot, LLM client, Postgres/pgvector, REST API, and **all feature logic** under `src/features/*` |
| `dashboard/` | Vite + React admin UI (per-feature pages under `src/features/*`) |

There are only **two workspaces** (`server`, `dashboard`). Features are plain folders inside `server/src/features/<name>` — not separate npm packages. (`modules/yt-dlp` is an unwired placeholder for a planned MCP tool.)

## Commands

```bash
npm install
cp .env.example .env          # BOT_TOKEN required
npm run dev                   # server :3000 + dashboard :5173
npm test                      # post-task gate: server unit/integration suite
npm run typecheck             # post-task gate: server + dashboard
npm run build                 # production compile (dashboard + server)
npm run start                 # production server only
```

Per-workspace commands (debugging during development — **not** the post-task gate):

```bash
npm run dev -w server
npm run build -w server
npm run build -w dashboard
npm run test -w server
```

Docker: `docker compose up -d --build` (see `README.md`).

### Feature modules

LLM-backed bot features live as **plain folders** in `server/src/features/<name>/`. A feature may contain:

| Path | Role |
|------|------|
| `server/src/features/<name>/*.ts` | Runtime logic — pipeline hosts (`run`, `shouldRun`), prompts, parsers |
| `server/src/features/<name>/db/*.ts` | Postgres tables (async, via the `SqlDatabase` handle) + REST routes (optional; exports a `ModuleDbExports` object) |
| `server/src/features/<name>/register-mcp-tools.ts` | MCP tool registrar (optional) |
| `dashboard/src/features/<name>/*.tsx` | Dashboard React page(s) (optional; routed directly in `dashboard/src/App.tsx`) |

Shared infrastructure: `server/src/shared/` (structured-output helpers, auxiliary LLM client, `BotMcpRegistry`); pipeline contracts/types in `server/src/contracts/`. Features import server code (db, bot, llm, pipeline helpers) **directly** — there is no callback wall.

| Feature folder | Purpose |
|----------------|---------|
| `features/addressing` | Group address detection (@mention, reply, display name + LLM) |
| `features/web-search` | Tavily web search via `search_web` MCP tool during the main reply |
| `features/link-fetch` | Playwright page fetch via `fetch_link` MCP tool |
| `features/vision` | Telegram media download, sticker previews, vision-model image description |
| `features/completions` | System prompt assembly and main LLM reply (pipeline hosts); owner `/explain` command |
| `features/history` | Turn setup, history intake/inject/record; LLM compression |
| `features/mood` | Personality + mood injection; `/mood` command |
| `features/sticker` | Sticker selection pass; `/explain`-style picks |
| `features/memory` | Per-user/group/general memory via always-on MCP tools (get/search/save) + debounced background cleanup job |
| `features/tasks` | Owner-managed scheduled jobs (once/daily/weekly) that fire an in-character message into a chat at a wall-clock time; always-on `tasks_*` MCP tools + an independent wall-clock scheduler |

The static module registry (`server/src/runtime/module-registry.ts`) lists each feature's metadata, db exports, and MCP registrar. Pipeline order is declared explicitly in `server/src/runtime/module-hosts.ts`.

Rules:

- **Pipeline host shape** — a host is a `PipelineModuleHost` (`id`, `stepId`, optional `shouldRun`, `run(state, services)`) returning a `PipelineStepResult`. Hosts read/write the shared `PipelineTurnState` and call server functions directly (imported, e.g. from `server/src/pipeline/turn-services.ts`).
- **Tests** — co-located under `server/test/features/<name>/`; optional live LLM tests in `server/test/features/<name>/live/`.
- **Shared code** — cross-feature helpers live in `server/src/shared/`.
- **No dead code** — when a feature is removed, delete its `features/<name>` folder, `module-registry.ts` entry, `module-hosts.ts` host(s), dashboard page, tests, and docs in the same task.
- **MCP tools are LLM-only** — MCP tools (`fetch_link`, `search_web`, etc.) are invoked **only** when the main-reply model calls them in the tool loop. The host registers tools, exposes them to the LLM with `tool_choice: auto`, and executes `callTool` when the model requests it. **Never** prefetch URLs, auto-run MCP tools, force a specific tool based on message content, or inject tool results into prompts/history without an LLM `tool_calls` round.
- **Prompt-first output** — features define strict `ANALYZER_SYSTEM` / `build*Messages()` specs; parsers stay strict (see **Structured LLM output**).

**MCP tools:** Features expose OpenAI-compatible tools via `@modelcontextprotocol/sdk` + Zod. Shared registry: `BotMcpRegistry` in `server/src/shared/`. A feature with tools exports `registerMcpTools(server, context)` and is listed in `module-registry.ts` with `mcpTools: { workflowStepId, toolNames, registrar }`. Host loads them in `server/src/runtime/mcp-tools.ts`; the main reply runs them through `server/src/llm/tool-loop.ts` (generic tool rounds with `tool_choice: auto` and `buildToolRoundSystemPrompt()` — no personality/mood/reply-format on tool passes; thinking off + auxiliary temperature; then always a structured JSON final pass). Tools: **link-fetch** → `fetch_link(url)`; **web-search** → `search_web(query)` (explicit user request only). System prompt adds usage guidance via `buildMcpToolsPromptSection` in `server/src/pipeline/adapters/system-prompt.ts`.

To add a feature: create `server/src/features/<name>/`, implement the pipeline host(s), add them to the order in `server/src/runtime/module-hosts.ts`, register metadata/db/MCP in `server/src/runtime/module-registry.ts`, add any new external deps to `server/package.json`, add a dashboard page under `dashboard/src/features/<name>/` and route it in `dashboard/src/App.tsx` if needed, and cover with tests in `server/test/features/<name>/`.


**Node:** `>=22.13.0` (see `.nvmrc`).

## Environment

| Variable | Purpose |
|----------|---------|
| `BOT_TOKEN` | Telegram bot token (required) |
| `LLM_BASE_URL` | OpenAI-compatible API base URL (required) |
| `VRAM_AVAILABLE` | GPU VRAM in GB (required); derives context window budget |
| `LLM_API_KEY` | Optional API key for authenticated OpenAI-compatible endpoints |
| `LOGGING_LEVEL` | `ERROR` (default), `DEBUG` (lifecycle events to console) |
| `TAVILY_API_KEY` | Optional web search via Tavily |
| `PORT` | Docker/production listen port only — not for local dev |
| `DATABASE_URL` | Postgres connection string (required); needs the `pgvector` extension |
| `TZ` | Optional IANA timezone for scheduled tasks + daily summaries (default `UTC`); jobs fire at wall-clock times in this zone |

Model, prompts, owner, maintenance mode, and performance limits live in **dashboard settings** (Postgres), not `.env`. The embedding model (history-summary RAG) is a dashboard setting too — no default; pick one from the provider's models (it must produce `EMBEDDING_DIM`-length vectors, see `server/src/llm/embeddings.ts`).

## Architecture

```
Telegram → Grammy handlers → message pipeline (module hosts) → delivery
                ↓
   Postgres + pgvector (settings, history, summaries, memories, stats)
                ↑
         Express /api ← dashboard (Vite dev proxy)
```

**Storage is Postgres** (with the `pgvector` extension), accessed through an async
`SqlDatabase` handle (`server/src/db/pool.ts`) bound into each module's `db/*.ts`.
Raw `chat_messages` carry a `tsvector` for full-text search; `chat_summaries`
(daily LLM topic summaries) carry a `vector(1024)` embedding for hybrid
vector + FTS recall. All db access is `async`/awaited end-to-end.

### Message flow

1. **`server/src/bot/handlers/index.ts`** — Register **commands before** the catch-all `bot.on("message")`. Module commands via `registerModuleCommands()` from `server/src/runtime/module-hosts.ts`.
2. **`server/src/bot/handlers/message.ts`** — Intake filters, maintenance gate, then **intake pipeline** (`runIntakePipeline` in `server/src/pipeline/queue-runner.ts`). Addressed messages are **enqueued** (`server/src/runtime/message-queue.ts`) and processed **one at a time**.
3. **Intake (every message)** — `preprocess` (turn setup + history intake with base64 media) → `gate` (reply triggers + address check). Not addressed → done. Addressed → queue.
4. **Queue processing (addressed only)** — synchronous order: vision (media) → system + personality → history inject → mood → main reply (optional MCP tool rounds) → sticker selection → history record → delivery (`server/src/pipeline/deliver.ts`). The vision step downloads + normalizes the turn's images and stashes the base64 on `state.images`; the main reply attaches them to the latest user message so a vision-capable model reads text + images in one pass (no separate describe request per turn). Each queued item carries a history pointer `{convKey}:{telegramMessageId}`; injection uses rows before that message; assistant replies are inserted immediately after the anchored user rows.
5. **Debounced background jobs** — each module owns its scheduler and config (`memory_module_config`, `vision_module_config`; dashboard under Modules → Memory / Vision). When the queue has been idle for the module debounce (default 60s): memory maintenance cleans each stored memory document via an LLM pass (skips records whose content fingerprint is unchanged since the last run); vision backfill replaces base64 media rows. New queue activity resets timers; vision backfill finishes the current image then reschedules.
6. **`server/src/runtime/module-hosts.ts`** — Explicitly imports the feature pipeline and bot command hosts from `server/src/features/*`. Intake and queue host arrays define the processing order directly. Static feature metadata/db/MCP wiring is in `server/src/runtime/module-registry.ts`. Background schedulers are wired in `server/src/runtime/queue-schedulers.ts` via `initQueueSchedulers()` (called at startup — the module has no import-time side effects).
7. **`server/src/runtime/mcp-tools.ts`** — Loads in-process MCP tools from the static `module-registry.ts` (`mcpTools.registrar`). Enabled tools are gated by `workflowSteps` (e.g. `links` → `fetch_link`, `search` → `search_web`). The main reply tool loop (`server/src/llm/tool-loop.ts`) exposes them to the LLM only — optional tool-call rounds (no `response_format`), then **always** a structured JSON final pass. The host executes tools when the model calls them; it never runs them proactively.
8. **`server/src/pipeline/turn-services.ts`** — Concrete, typed functions (Postgres, Telegram helpers, vision, LLM adapters) that pipeline hosts import directly. Replaces the former `PipelineHostCallbacks` indirection.
9. **`server/src/bot/maintenance/maintenance.ts`** — When `maintenanceModeEnabled` is on, only the owner can proceed; in groups the owner must also include a direct @mention of the bot.

### LLM

- Client: `server/src/llm/client.ts` (OpenAI SDK → `/v1/chat/completions`; optional `showModel` / catalog fetch for context-budget metadata)
- OpenAI-compatible parsing: `server/src/llm/openai-compat.ts` (`content` vs `reasoning` / `reasoning_content`, request `options`)
- Debug (shared processing recorder): one append-only entries model used by every domain — a unit of work has a `<domain>_processings` row + `<domain>_processing_entries` (`{title, type: 'text'|'json', content}`, FK `ON DELETE CASCADE`, ordered by id). Shared core: `server/src/debug/processing-recorder.ts` (`ProcessingRecorder` — buffers entries until the owner row exists, serializes writes so they persist in emission order, and exposes the shared LLM vocabulary: `beginLlmWait`/`recordLlmCall` → **LLM request** json → **Waiting** → **LLM response** json → **LLM result**) and `server/src/db/debug/processing-entries.ts` (entries table DDL + CRUD). A process-wide recorder registry keyed by `traceId` lets the LLM client (`getRecorder(traceId)`) capture request/response for ANY domain. Terminal status `processing`→`processed`/`ignored`/`error` + `total_time_spent` via `complete(status)`.
  - **Messages** (`debug/message-report.ts`, `db/debug/message-processing.ts`): `message_processings` 1:1 with `chat_messages` (`chat_message_id`, FK CASCADE), 50/chat. `MessageProcessingReport` keyed by ephemeral `turnId` (== its trace id), linked via `linkProcessingMessage`. Public primitive `reportMessageProcessing(id=chat_messages.id, …)`. Dashboard nav chats → processings → entries. `/explain` resolves by bot reply id (`reply_message_ids`).
  - **Tasks** (`debug/task-report.ts`, `db/debug/task-processing.ts`): one processing per fire; `task_processings.task_id` FK→`tasks` `ON DELETE SET NULL` (survives one-shot deletion), 20/task. `beginTaskProcessing(taskId)` wraps a fire in `fire.ts`. Dashboard: Task debug page → tasks → fires → entries.
  - **Scheduled jobs** (`debug/job-report.ts`, `db/debug/job-processing.ts`): one processing per backfill run; `job_processings.module_id` ('memory'/'vision'), no owner FK, 25/module. `beginJobProcessing(module)` in the memory/vision queue-schedulers (which keep their in-memory idle/scheduled/running status for the sidebar). Dashboard memory/vision run list/detail render entries via shared `JobRunList`/`JobRunEntries`.
  - Shared dashboard renderer: `dashboard/src/pages/debug/DebugProcessingEntries.tsx` (`EntryRow`; json entries collapsed by default). Live refresh via `dashboard:data` table ids (`message_processings`/`task_processings`/`job_processings`). Sidebar job status/countdown still flows via `dashboard:stats` (`memoryJobRunAt`/`visionJobRunAt`).
- Chat options: `server/src/settings/limits.ts` (`temperature`, `topP`, `topK`, `repeatPenalty`, `numCtx` via `getProviderExtensions()`)
- **Chat history limits are derived** from `numCtx` and `numPredict` via `getHistoryLimits()` — not separate settings. Dashboard preview: `dashboard/src/derivedHistoryLimits.ts` (keep in sync with server).

**OpenAI-compatible backends:** Chat requests send provider-specific `options` plus `reasoning_effort` (dashboard `reasoningEffort` on the main reply when `thinkingEnabled` is on; **`"low"` on all auxiliary side passes**; `"none"` when thinking is off). JSON replies require the full answer in `message.content`. When thinking is on, every pass keeps `response_format: json_schema` with an extra required **`reasoning`** string field in the schema; chain-of-thought is read from that JSON field (API `reasoning` / `reasoning_content` is a fallback). Parse decision/reply fields from `content` JSON only — never merge `reasoning` into user-facing text. Extensions: `providerChatExtensions()` and `responseFormatForThinking()` in `server/src/shared/`.

**Terminology — OpenAI-compatible only:** This project targets **any OpenAI-compatible API** (LocalAI, vLLM, llama.cpp server, cloud providers, etc.). Do **not** use vendor-specific names in code, comments, docs, or agent replies — especially **“Ollama”**. Describe behavior in neutral terms: “OpenAI-compatible API”, “provider”, “backend”, “optional model metadata endpoints”. Some servers expose non-standard routes such as `POST /api/show` or `GET /api/tags` for context length and model size; treat these as **optional provider extensions** (best-effort, fail silently if absent). Primary integration is always `/v1/models` and `/v1/chat/completions`.

### Memory

Three layers (per-user, per-group, general — see `server/src/db/*-memory.ts`), driven by **always-on MCP tools** (`server/src/features/memory/mcp-tools.ts`), not by automatic extraction. The model reads and writes memory on demand, the same way it uses the history tools:

- `memory_get(type, id)` — read the stored document for a `user`/`group`/`general` scope. `id` is the user id or group id (surfaced in the `[SESSION]` block and `[user:name:id]` history tags); ignored for `general`.
- `memory_search(query)` — case-insensitive substring search across all three scopes.
- `memory_save(type, id, content)` — append one durable fact (deduped on insert via `addUserFacts`/`addGroupFacts`/`addGeneralFacts`).
- Memory is **not** injected into the main reply prompt — retrieval is fully tool-driven. The explain/debug view still reads memory from the DB for analysis.

A **debounced background maintenance job** (`server/src/features/memory/queue-scheduler.ts`, wired from `server/src/runtime/queue-schedulers.ts`) runs when the message queue is idle. It does not extract from history; it validates each existing memory document via an LLM cleanup pass (reusing the merge prompt with no new input) to dedupe, drop stale/contradicted lines, and compact. Per-record content fingerprints in `memory_job_chat_state` skip unchanged records.

### Tasks (scheduled jobs)

Owner-managed scheduled jobs that post an in-character message into a chat at a wall-clock time — `once` (date + time), `daily` (time), or `weekly` (weekday mask + time), like calendar events. Created/changed/cancelled **fully verbally** by the owner through always-on MCP tools (the LLM decides — no commands), and via the dashboard Tasks page.

- **MCP tools** (`server/src/features/tasks/mcp-tools.ts`, always-on like memory): `tasks_create`, `tasks_update`, `tasks_delete`, `tasks_get`, `tasks_list`, `tasks_search`. **Owner-gated and chat-bound** via per-turn context (`turn-context.ts`): `systemPromptHost` calls `captureTaskTurnContext(state)` before the main-reply tool loop, so the tools read the current chat/owner/replied-task from a module-level variable (safe — the queue processes one addressed turn at a time). Non-owner calls are rejected in the tool; chat id and creator are taken from context, never from model-passed args.
- **Schedule math** (`schedule.ts`): dependency-free via `Intl`. `computeNextRun(schedule, from, timezone)` returns the next UTC instant (or `null` for a spent `once` task). Timezone comes from the `TZ` env (`config.timezone`) — a single global zone. Each task stores the `timezone` it was created under; on startup `startTaskScheduler` reconciles any enabled task whose stored timezone differs from the current `TZ` (recompute `next_run_at`, re-pin `timezone`), so changing `TZ` re-homes existing tasks without recreating them.
- **Wall-clock scheduler** (`scheduler.ts`, wired in `server/src/runtime/task-scheduler.ts`, started from `server/src/index.ts`): polls every ~30s (independent of the message queue — unlike the debounced memory/vision jobs), fires due tasks, then advances `next_run_at`. When `computeNextRun` returns `null` (a spent `once` task), the task is **deleted**, not disabled. Paused while maintenance mode is on.
- **Removal vs disable**: stopping/cancelling a task **deletes** it (`tasks_delete` / spent one-shots / dashboard Delete). `enabled:false` is only a manual pause for recurring tasks (dashboard toggle / `tasks_update`). The prompt and tool descriptions steer the model to `tasks_delete` for "stop/cancel". Startup reconciliation also clears any leftover disabled/`null`-next `once` rows.
- **Debug log** (`db/task-events.ts`): a 50-row ring buffer of lifecycle events (`created`, `updated`, `deleted`, `fired`, `fire_failed`) recorded from `service.ts` (create/update/delete) and `fire.ts` (fire outcomes, with the generated text or error in `detail`). Served at `GET /api/tasks/debug` (`DELETE` clears it); dashboard debug page `dashboard/src/features/tasks/TasksDebugPage.tsx`, reachable at `/tasks/debug`.
- **Fire path** (`fire.ts`): runs a short in-character LLM pass (personality + mood, like the maintenance announce) to produce a fresh variation each time, sends it via `getBot()`, appends to history, and records the sent `message_id → task_id` in `task_messages`.
- **Reply to edit/cancel**: when an addressed message replies to one of a task's fired messages, `getTaskIdByMessage` resolves the task and a `[SESSION]` line names it so the model can `tasks_update`/`tasks_delete` it verbally (mirrors the reply→trace link used by `/explain`).
- **DB** (`server/src/features/tasks/db/`): tables `tasks`, `task_messages`, and `task_events`; REST CRUD under `/api/tasks`. Schedule validation + next-run computation live in `service.ts` (shared by routes and MCP tools). Dashboard page + debug page: `dashboard/src/features/tasks/`.

### Group behavior

- Bot responds when @mentioned, replied to, display name is spoken (regex or LLM for other languages), or on random/image toggles.
- Per-member history in groups (`conversationKey` includes `userId`).
- The `[SESSION]` block surfaces the current speaker's id **plus** their `[user:name:id]` tag and friendly label in **all** chats (DMs included), so the model can mention them properly instead of falling back to a bare id (`buildSessionBlock` in `server/src/pipeline/adapters/system-prompt.ts`). The group-only `[CURRENT SPEAKER]` turn block is separate from this.
- Owner account: `ownerUsername` in settings; id resolved via Telegram API + `known_users` table. Owner-only commands: `/mood`, `/explain` (completions module), `/remember`.
- **Maintenance mode** (`maintenanceModeEnabled`): only the owner can reach the pipeline; in groups the owner must also include a direct @mention of the bot — gate in `handlers/message.ts`. Toggling maintenance mode from the dashboard triggers an LLM-generated in-character announcement broadcast to every distinct `chat_history` chat key.

### Structured LLM output (JSON schema)

Side passes and the main reply use **strict JSON schemas** enforced via OpenAI-compatible `response_format`. Each module exports a `*_RESPONSE_FORMAT` constant describing only the actual output fields (`reply`, `addressed`, mood traits, etc.). Chain-of-thought is **never** a JSON field — reasoning models return it on the separate API channel (`reasoning` / `reasoning_content`), so the schema and prompts stay reasoning-free regardless of `thinkingEnabled`. Prompts describe the same fields in prose. Parsers validate decision/reply fields only — they must not be loosened to accept model mistakes.

**When the model misbehaves, fix the prompt or schema — not the parser.**

| Do | Don't |
|----|-------|
| Tighten system/user prompts so the model fills every required JSON field | Add fallbacks for alternate shapes (tags, bare yes/no, reasoning text) |
| State mandatory output rules and forbidden extras | Fall back to `reasoning` when `content` is malformed |
| Keep schema field names aligned with prompt prose | Invent new fields outside the schema |
| Repeat the required JSON shape in the user message tail when helpful | “Helpfully” accept partial or non-JSON output |

If output is unparseable after a prompt fix, treat it as a failed pass (ignore, error, or retry) — do not silently guess from reasoning or alternate formats.

Reference implementations:

- **Schema helpers:** `server/src/shared/json-schema.ts` (`strictObjectSchema`, `parseJsonContent`, typed readers)
- **Address detection:** `server/src/features/addressing/` (`ADDRESS_RESPONSE_FORMAT`, `{ addressed: boolean }`)
- **Main reply:** plain text, no JSON schema — `buildReplyFormatSpec()` in `server/src/features/completions/response-format.ts`. (`MAIN_REPLY_RESPONSE_FORMAT` is retained for the explain/announce passes and as a defensive parse fallback.)

### Response format

The main reply is **plain text** — no `response_format` is sent (grammar-constrained decoding can push weaker models into repetition loops). `extractTelegramReply()` still parses a `{ "reply": "…" }` wrapper defensively if a model emits one, then cleans the text. Parser: `server/src/features/completions/response-format.ts`; do not expand the parser for new model quirks. Other structured passes (mood, sticker, address, explain) keep their JSON schemas.

**LLM response fields:** User-facing text comes from the API `content` JSON (`reply`, `addressed`, etc.). Chain-of-thought comes solely from the separate API `reasoning` / `reasoning_content` channel (`parseAssistantMessage()` in `server/src/llm/openai-compat.ts`) — never from a JSON field. Reasoning is captured in debug traces only; it is never sent to Telegram. Never merge reasoning into the reply body or use it to recover malformed JSON.

## Code conventions

- **Keep `AGENTS.md` current** — part of every task that touches documented behavior; see the intro.
- **ESM** throughout; server imports use `.js` extensions (`"type": "module"`).
- **Minimal diffs** — match existing style, naming, and patterns in the file you edit.
- **No migrations / backward compatibility** — do not create migrations or worry about backward compatibility unless explicitly requested; data loss is acceptable, but warn the user in such cases.
- **No drive-by refactors** or unrelated changes.
- **Do not commit** unless the user asks. Do not put secrets in git (`.env`, tokens).
- **NEVER use real or user-provided data in committed code** — do not copy Telegram user IDs, usernames, chat IDs, display names, message text, conversation excerpts, `.env` values, API keys, or any other personal or environment-specific data from bug reports, traces, dashboards, ACP context, or chat into source, tests, fixtures, prompts, or comments. Always invent clearly fictional placeholders (e.g. `user:alice:424242`, `testuser`, `-100999001`).
- **English-only source** — tests, prompts, comments, and code must be written in proper English. No Cyrillic and no transliteration of foreign words.
- **No vendor-specific LLM naming** — say “OpenAI-compatible API / provider / backend”, not product names (e.g. Ollama). Optional metadata routes (`/api/show`, `/api/tags`) are provider extensions, not the primary contract.
- **Settings** (stored in Postgres) — add new keys to `DEFAULT_SETTINGS` in `server/src/db/index.ts`, validation in `server/src/settings/limits.ts`, allowed PATCH keys in `server/src/api/routes/settings.ts`, and dashboard `Settings` in `dashboard/src/api.ts`.

## Dashboard pages

| Route | Purpose |
|-------|---------|
| `/` | Overview, stats, error log |
| `/character` | Default + custom system prompts |
| `/settings` | LLM, model, owner, maintenance mode, performance, vision, stickers, background maintenance, vision backfill |
| `/history` | Stored chat transcripts per Telegram chat |
| `/memory` | User/group/general facts; `/memory/debug` for the maintenance job run list + phase/LLM detail |
| `/mood` | Global mood state and cooldown (per-character mood defaults live on `/character`) |
| `/tasks` | Scheduled tasks per chat; `/tasks/debug` for the event log |
| `/vision` | Vision backfill job run list + phase/LLM detail (live countdown when scheduled) |
| `/debug` | Per-message processing traces (chat → message → step detail) |
| `/data` | Raw Postgres table browser |
| `/workflow` | Live pipeline diagram from `GET /api/workflow` (core pipeline hosts + queue order) |

State: `dashboard/src/context/DashboardContext.tsx`. API client: `dashboard/src/api.ts`.

**Styling** — Tailwind CSS v4 (`@tailwindcss/vite`). Theme tokens in `dashboard/src/index.css` (`@theme`: `bg-bg`, `bg-surface`, `text-muted`, `text-accent`, etc.). Shared primitives in `dashboard/src/components/ui/` (`Badge`, `Button`, `ButtonLink`, `Card`, `Page`, `PageHeader`, …) and `cn()` in `dashboard/src/lib/cn.ts`. Module UI packages use the same Tailwind tokens via the dashboard Vite build (no separate CSS files). Layout: sidebar is `sticky` on mobile and `fixed` (`md:w-60`) on desktop; main content uses `md:ml-60`.

## Telegram specifics

- Entity offsets are **UTF-16 code units** (same as JS strings) — see `sliceEntity` in `server/src/features/addressing/`.
- Group commands often need `/cmd@BotUsername` when privacy mode is on.
- Mention handling: `server/src/bot/messages/mentions.ts` (skip self-mentions and bot mention for address detection).

## Key files

| Area | Files |
|------|-------|
| Bot entry | `server/src/bot/index.ts`, `handlers/index.ts`, `handlers/message.ts` |
| Pipeline | `server/src/pipeline/queue-runner.ts`, `deliver.ts`, `context.ts`, `turn-services.ts`; `runtime/message-queue.ts`, `runtime/background-jobs.ts`, `runtime/module-hosts.ts`, `runtime/module-registry.ts` |
| Shared / contracts | `server/src/shared/` (LLM helpers, MCP registry), `server/src/contracts/` (pipeline + db + bot types) |
| Address detection | `server/src/features/addressing/` (pipeline hosts + `bot-identity.ts`) |
| Maintenance | `server/src/bot/maintenance/maintenance.ts`, `server/src/bot/maintenance/announce.ts`, `owner/owner.ts` |
| Settings DB | `server/src/db/index.ts`, `server/src/api/routes.ts` |
| History | `server/src/features/history/` (pipeline hosts) + `server/src/features/history/db/`; runtime accessors in `server/src/db/history/` |
| Vision | `server/src/features/vision/` (+ `db/`); per-turn images attached in `server/src/features/vision/pipeline.ts`, history backfill describe in `server/src/features/vision/queue-scheduler.ts` |
| Completions | `server/src/features/completions/` (system prompt + LLM reply hosts, `/explain` bot host, reply JSON schema); prompt assembly `server/src/pipeline/adapters/system-prompt.ts` |
| Web search | `server/src/features/web-search/` (`search_web` MCP tool; Tavily) |
| Link fetch | `server/src/features/link-fetch/` (`fetch_link` MCP tool; Playwright) |
| Sticker selection | `server/src/features/sticker/` |
| Mood evaluation | `server/src/features/mood/` (+ `db/`; personality + mood hosts, `/mood` bot host) |
| Tasks | `server/src/features/tasks/` (`schedule.ts`, `scheduler.ts`, `fire.ts`, `turn-context.ts`, `service.ts`, `mcp-tools.ts`, `db/`); scheduler wiring `server/src/runtime/task-scheduler.ts` |
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

[Vitest](https://vitest.dev) runs the single server suite — every `server/test/**/*.test.ts` (feature suites in `server/test/features/<name>/`, shared in `server/test/shared/`, server units in `server/test/unit/**`; fixture in `server/test/helpers/settings.ts`; config `server/vitest.config.ts`). Live tests (`**/live/**`) are excluded. Postgres-backed db tests are opt-in: they skip unless `TEST_DATABASE_URL` points at a `pgvector` server (they exercise FTS + vector features no in-memory fake reproduces) — see `server/test/helpers/pg.ts`. They share one database, so run them serially: `TEST_DATABASE_URL=… npx vitest run --no-file-parallelism -w server`.

### Opt-in live LLM suites

Not part of the post-task gate unless the user asks. Root: `npm run test:llm`. Requires `LLM_BASE_URL` and `LLM_MODEL` (optional `LLM_API_KEY`); suites self-skip when unset.

**Every feature that calls an LLM** (pipeline host or server path) should ship live coverage:

| Script | When it runs | Config (globs) |
|--------|----------------|----------------|
| `test:llm` | Thinking **off** | `vitest.live.config.ts` → `test/live/**` + `test/features/**/live/**/*.live.test.ts` |
| `test:llm:reasoning` | Thinking **on** (`LLM_THINKING_ENABLED=1`) | `vitest.live.reasoning.config.ts` → `test/live/reasoning.test.ts` + `test/features/**/live/**/*.reasoning.live.test.ts` |

Split files with `describe.skipIf(!cfg \|\| liveReasoningMode())` vs `describe.skipIf(!cfg \|\| !liveReasoningMode())` so the two commands never double-run the same cases. `TAVILY_API_KEY` is force-cleared in `test/live/setup-env.ts`.

### Auxiliary generation budget

Reasoning backends spend tokens on hidden chain-of-thought before emitting the structured block, so side passes need a generous `max_completion_tokens`. The floor is `AUXILIARY_NUM_PREDICT` when thinking is off and `AUXILIARY_REASONING_NUM_PREDICT` when it is on (`server/src/settings/limits.ts` and `server/src/shared/`); memory merge raises its own budget (`MEMORY_MERGE_NUM_PREDICT`). Too low a budget makes a pass return empty `content` and silently fail.

## Common pitfalls

1. Registering `bot.on("message")` **before** `bot.command(...)` breaks slash commands.
2. Duplicating history limit math — use `getHistoryLimits()` on server only; mirror in dashboard for UI preview only.
3. Assuming `@username` resolves without the user having messaged the bot at least once.
4. Editing only server or only dashboard types when adding a setting — update both + PATCH allowlist.
5. **Dashboard `tsconfig.app.json` drift** — root `npm run typecheck` uses `tsconfig.app.json`, not `tsconfig.json`. Keep `noUnusedLocals` / `noUnusedParameters` (and other strict flags) aligned between them or unused-code errors will only show in the IDE.
6. New LLM entry points must respect maintenance mode (`isMaintenanceBlocked`) — not only the main message handler.
7. Naming LLM integration after a single vendor — the codebase and docs must stay provider-neutral; chat goes through OpenAI-compatible endpoints (see **Code conventions**).
8. **Loosening JSON parsers** when a model returns the wrong shape or puts the answer in `reasoning` — improve the prompt/schema instead (see **Structured LLM output (JSON schema)**).
9. **Copying user-provided data into code** — bug reports and live traces are not test fixtures; never commit real IDs, usernames, names, or message content (see **Code conventions**).
