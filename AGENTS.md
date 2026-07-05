# AGENTS.md

Guidance for AI agents working in this repository.

**Maintain this file.** Treat `AGENTS.md` as living documentation: update it in the same task whenever you change workflows, commands, architecture, conventions, testing gates, or other agent expectations. Remove or rewrite stale sections when behavior changes — never leave contradictory leftovers for the next agent.

## Project summary

Telegram bot backed by **OpenAI-compatible API**, with a **React dashboard** for configuration. One Node process runs the Grammy bot, Express API, and (in production) serves the built dashboard.

| Workspace | Role |
|-----------|------|
| `server/` | Bot, LLM client, Postgres/pgvector, REST API, and **all feature logic** under `src/features/*` |
| `dashboard/` | Vite + React admin UI (per-feature pages under `src/features/*`) |

There are only **two workspaces** (`server`, `dashboard`). Features are plain folders inside `server/src/features/<name>` — not separate npm packages.

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

### Features

LLM-backed bot features live as **plain folders** in `server/src/features/<name>/`. A feature may contain:

| Path | Role |
|------|------|
| `server/src/features/<name>/*.ts` | Runtime logic — pipeline hosts (`run`, `shouldRun`), prompts, parsers |
| `server/src/features/<name>/db/*.ts` | Postgres tables (async, via the `SqlDatabase` handle) + REST routes (optional; exports a `FeatureDbExports` object) |
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
| `features/web-browse` | Owner-triggered **background** web-browsing agent (navigate/click/type/read/screenshot + owner-only download). The `browser_agent_start` tool enqueues a run; a runtime worker drives an autonomous Playwright + LLM loop off the reply path and reports back out-of-band. Its own `browser_agent_runs` debug domain + `/browser` dashboard page |

The static feature registry (`server/src/runtime/feature-registry.ts`) lists each feature's metadata, db exports, and MCP registrar. Pipeline order is declared explicitly in `server/src/runtime/feature-hosts.ts`.

Rules:

- **Pipeline host shape** — a host is a `PipelineFeatureHost` (`id`, `stepId`, optional `shouldRun`, `run(state, services)`) returning a `PipelineStepResult`. Hosts read/write the shared `PipelineTurnState` and call server functions directly (imported, e.g. from `server/src/pipeline/turn-services.ts`).
- **Tests** — co-located under `server/test/features/<name>/`; optional live LLM tests in `server/test/features/<name>/live/`.
- **Shared code** — cross-feature helpers live in `server/src/shared/`.
- **No dead code** — when a feature is removed, delete its `features/<name>` folder, `feature-registry.ts` entry, `feature-hosts.ts` host(s), dashboard page, tests, and docs in the same task.
- **MCP tools are LLM-only** — MCP tools (`fetch_link`, `search_web`, etc.) are invoked **only** when the main-reply model calls them in the tool loop. The host registers tools, exposes them to the LLM with `tool_choice: auto`, and executes `callTool` when the model requests it. **Never** prefetch URLs, auto-run MCP tools, force a specific tool based on message content, or inject tool results into prompts/history without an LLM `tool_calls` round.
- **Prompt-first output** — features define strict `ANALYZER_SYSTEM` / `build*Messages()` specs; parsers stay strict (see **Structured LLM output**).

**MCP tools:** Features expose OpenAI-compatible tools via `@modelcontextprotocol/sdk` + Zod. Shared registry: `BotMcpRegistry` in `server/src/shared/`. A feature with tools exports `registerMcpTools(server, context)` and is listed in `feature-registry.ts` with `mcpTools: { workflowStepId, toolNames, registrar }`. Host loads them in `server/src/runtime/mcp-tools.ts`; the main reply runs them through `server/src/llm/tool-loop.ts` as **one conversation**: every round carries the full system prompt (personality, reply format, and its `## Tools` section) with `tool_choice: auto`, and the first response without tool calls IS the reply — a no-tool message costs a single inference and the prompt-cache prefix survives between rounds. A stalled model (a round that only repeats already-executed calls) OR a slow loop (the same call+args recurring `MAX_TOOL_CALL_REPEATS` times across rounds) trips the loop guard: it gets one forced final call without tools and the result carries `loopDetected: true` for the caller to fail the task. Tools: **link-fetch** → `fetch_link(url)`; **web-search** → `search_web(query)` (explicit user request only); **web-browse** → `browser_agent_start(goal)` (owner-only) which only **enqueues** a background run and returns immediately. The browser tools themselves (`browser_navigate`/`click`/`type`/`read`/`screenshot`/`extract_media`/`download`) are **not** main-reply MCP tools — they live inside the background agent's own tool loop (`features/web-browse/tools.ts`), driven by `runtime/browser-agent-runner.ts`. Tool usage guidance is the `## Tools` section of `buildSystemPrompt` (gated by `enabledToolNames`) in `server/src/pipeline/adapters/system-prompt.ts`.

To add a feature: create `server/src/features/<name>/`, implement the pipeline host(s), add them to the order in `server/src/runtime/feature-hosts.ts`, register metadata/db/MCP in `server/src/runtime/feature-registry.ts`, add any new external deps to `server/package.json`, add a dashboard page under `dashboard/src/features/<name>/` and route it in `dashboard/src/App.tsx` if needed, and cover with tests in `server/test/features/<name>/`.


**Node:** `>=22.13.0` (see `.nvmrc`).

## Environment

| Variable | Purpose |
|----------|---------|
| `BOT_TOKEN` | Telegram bot token (required) |
| `LLM_BASE_URL` | OpenAI-compatible API base URL (required) |
| `LLM_API_KEY` | Optional API key for authenticated OpenAI-compatible endpoints |
| `EMBEDDING_BASE_URL` | Optional base URL for the embedding model; falls back to `LLM_BASE_URL` when unset |
| `EMBEDDING_API_KEY` | Optional API key for the embedding host; falls back to `LLM_API_KEY` when unset |
| `LOGGING_LEVEL` | `ERROR` (default), `DEBUG` (lifecycle events to console) |
| `TAVILY_API_KEY` | Optional web search via Tavily |
| `PORT` | Docker/production listen port only — not for local dev |
| `DATABASE_URL` | Postgres connection string (required); needs the `pgvector` extension |
| `TZ` | Optional IANA timezone for scheduled tasks + daily summaries (default `UTC`); jobs fire at wall-clock times in this zone |
| `PUBLIC_URL` | Optional base URL of the live/prod deployment, for agents to inspect live state via its REST API (see below). Read-only debugging aid; not used by the app itself |

Every variable also accepts a `<NAME>_FILE` variant (Docker secrets): when set, the file's trimmed contents are used instead of the literal value. `readEnv()` in `server/src/config/index.ts` handles this for all vars; `PG_PASSWORD`/`PG_PASSWORD_FILE` is special-cased to override the password embedded in `DATABASE_URL`.

Model, prompts, owner, maintenance mode, and performance limits live in **dashboard settings** (Postgres), not `.env`. The embedding model (history-summary RAG) is a dashboard setting too — no default; pick one from the provider's models (it must produce `EMBEDDING_DIM`-length vectors, see `server/src/llm/embeddings.ts`).

### Inspecting the live deployment (`PUBLIC_URL`)

When `PUBLIC_URL` is set, it points at a running (usually prod) instance whose Express API is mounted at `PUBLIC_URL/api` (see `server/src/index.ts` → `createApiRouter`). Use it to diagnose real behavior against real data — e.g. to see exactly what a message produced end to end — instead of guessing. Fetch with `curl`/`WebFetch`; responses are JSON.

**Treat it as read-only.** Use `GET` only. Do not `PATCH`/`DELETE` (some routes mutate or clear prod state, e.g. `DELETE /api/tasks/debug`), and never copy the real IDs, usernames, chat text, or other data you see into committed code, tests, or fixtures — invent placeholders (see **Code conventions**).

Most useful read endpoints (full list in `server/src/api/routes/*.ts` and each feature's `db/routes.ts`):

- `GET /api/health` — liveness (`{ ok: true }`).
- **Message processing traces** — the per-message execution log (system prompt, every LLM request/response, mood, retrieved memory/history, tool calls) behind the dashboard's processing view and the exported `processing-<id>` files:
  - `GET /api/debug/chats` — chats that have recorded processings.
  - `GET /api/debug/chat/:entityId` — recent processings for one chat.
  - `GET /api/debug/processing/:id` — the full trace for one processing (this is the JSON an exported `processing-<id>` file is rendered from).
- **Scheduled task fires** — `GET /api/debug/tasks`, `GET /api/debug/task/:taskId`, `GET /api/debug/task-processing/:id`.
- **Background job runs** (memory consolidation, summaries, …) — `GET /api/debug/job/:featureId`, `GET /api/debug/job-processing/:id`.
- **State** — `GET /api/settings`, `GET /api/stats`, and feature reads under `/api/tasks`, `/api/memories`, `/api/mood`, `/api/summaries`, `/api/vision`.

Example: `curl "$PUBLIC_URL/api/debug/processing/6019"` returns the same trace a user might hand you as an exported log.

## Architecture

```
Telegram → Grammy handlers → message pipeline (feature hosts) → delivery
                ↓
   Postgres + pgvector (settings, history, summaries, memories, stats)
                ↑
         Express /api ← dashboard (Vite dev proxy)
```

**Storage is Postgres** (with the `pgvector` extension), accessed through an async
`SqlDatabase` handle (`server/src/db/pool.ts`) bound into each feature's `db/*.ts`.
Raw `chat_messages` carry a `tsvector` for full-text search; `chat_summaries`
(daily LLM topic summaries) carry a `vector(1024)` embedding for hybrid
vector + FTS recall. All db access is `async`/awaited end-to-end.

### Message flow

1. **`server/src/bot/handlers/index.ts`** — Register **commands before** the catch-all `bot.on("message")`. Feature commands via `registerFeatureCommands()` from `server/src/runtime/feature-hosts.ts`.
2. **`server/src/bot/handlers/message.ts`** — Intake filters, maintenance gate, then **intake pipeline** (`runIntakePipeline` in `server/src/pipeline/queue-runner.ts`). Addressed messages are **enqueued** (`server/src/runtime/message-queue.ts`) and processed **one at a time**.
3. **Intake (every message)** — `preprocess` (turn setup + history intake with base64 media) → `gate` (reply triggers + address check). Not addressed → done. Addressed → queue.
4. **Queue processing (addressed only)** — synchronous order: vision (media) → system + personality → history inject → mood → main reply (optional MCP tool rounds) → sticker selection → history record → delivery (`server/src/pipeline/deliver.ts`). The vision step downloads + normalizes the turn's images and stashes the base64 on `state.images`; the main reply attaches them to the latest user message so a vision-capable model reads text + images in one pass (no separate describe request per turn). Each queued item carries a history pointer `{convKey}:{telegramMessageId}`; injection uses rows before that message; assistant replies are inserted immediately after the anchored user rows.
5. **Debounced background jobs** — each feature owns its scheduler and config (`memory_config`, `vision_config`; dashboard Memory / Vision pages). When the queue has been idle for the feature debounce (default 60s): memory maintenance cleans each stored memory document via an LLM pass (skips records whose content fingerprint is unchanged since the last run); vision backfill replaces base64 media rows. New queue activity resets timers; vision backfill finishes the current image then reschedules.
6. **`server/src/runtime/feature-hosts.ts`** — Explicitly imports the feature pipeline and bot command hosts from `server/src/features/*`. Intake and queue host arrays define the processing order directly. Static feature metadata/db/MCP wiring is in `server/src/runtime/feature-registry.ts`. Background schedulers are wired in `server/src/runtime/queue-schedulers.ts` via `initQueueSchedulers()` (called at startup — the file has no import-time side effects).
7. **`server/src/runtime/mcp-tools.ts`** — Loads in-process MCP tools from the static `feature-registry.ts` (`mcpTools.registrar`). Enabled tools are gated by `workflowSteps` (e.g. `links` → `fetch_link`, `search` → `search_web`). The main reply tool loop (`server/src/llm/tool-loop.ts`) exposes them to the LLM only — one conversation in which the model either answers or emits tool calls; the first tool-free response is the reply. The host executes tools when the model calls them; it never runs them proactively.
8. **`server/src/pipeline/turn-services.ts`** — Concrete, typed functions (Postgres, Telegram helpers, vision, LLM adapters) that pipeline hosts import directly. Replaces the former `PipelineHostCallbacks` indirection.
9. **`server/src/bot/maintenance/maintenance.ts`** — When `maintenanceModeEnabled` is on, only the owner can proceed; in groups the owner must also include a direct @mention of the bot.

### LLM

- Client: `server/src/llm/client.ts` (OpenAI SDK → `/v1/chat/completions`; optional `showModel` / catalog fetch for context-budget metadata)
- OpenAI-compatible parsing: `server/src/llm/openai-compat.ts` (`content` vs `reasoning` / `reasoning_content`, `reasoning_effort`)
- Debug (shared processing recorder): one append-only entries model used by every domain — a unit of work has a `<domain>_processings` row + `<domain>_processing_entries` (`{title, type: 'text'|'json'|'image', content}`, FK `ON DELETE CASCADE`, ordered by id; `image` content is base64 rendered inline by the dashboard, used by the web-browse agent for screenshots). Shared core: `server/src/debug/processing-recorder.ts` (`ProcessingRecorder` — buffers entries until the owner row exists, serializes writes so they persist in emission order, and exposes the shared LLM vocabulary: `beginLlmWait`/`recordLlmCall` → **LLM request** json → **Waiting** → **LLM response** json → **LLM result**) and `server/src/db/debug/processing-entries.ts` (entries table DDL + CRUD). A process-wide recorder registry keyed by `traceId` lets the LLM client (`getRecorder(traceId)`) capture request/response for ANY domain. Terminal status `processing`→`processed`/`ignored`/`error` + `total_time_spent` via `complete(status)`.
  - **Messages** (`debug/message-report.ts`, `db/debug/message-processing.ts`): `message_processings` 1:1 with `chat_messages` (`chat_message_id`, FK CASCADE), 50/chat. `MessageProcessingReport` keyed by ephemeral `turnId` (== its trace id), linked via `linkProcessingMessage`. Public primitive `reportMessageProcessing(id=chat_messages.id, …)`. Dashboard nav chats → processings → entries. `/explain` resolves by bot reply id (`reply_message_ids`).
  - **Tasks** (`debug/task-report.ts`, `db/debug/task-processing.ts`): one processing per fire; `task_processings.task_id` FK→`tasks` `ON DELETE SET NULL` (survives one-shot deletion), 20/task. `beginTaskProcessing(taskId)` wraps a fire in `fire.ts`. Dashboard: Task debug page → tasks → fires → entries.
  - **Scheduled jobs** (`debug/job-report.ts`, `db/debug/job-processing.ts`): one processing per backfill run; `job_processings.feature_id` ('memory'/'vision'), no owner FK, 25/feature. `beginJobProcessing(feature)` in the memory/vision queue-schedulers (which keep their in-memory idle/scheduled/running status for the sidebar). Dashboard memory/vision run list/detail render entries via shared `JobRunList`/`JobRunEntries`.
  - Shared dashboard renderer: `dashboard/src/pages/debug/DebugProcessingEntries.tsx` (`EntryRow`; json entries collapsed by default). Live refresh via `dashboard:data` table ids (`message_processings`/`task_processings`/`job_processings`). Sidebar job status/countdown still flows via `dashboard:stats` (`memoryJobRunAt`/`visionJobRunAt`).
  - **Per-phase latency samples** (`server/src/db/debug/phase-timings.ts`): every pipeline host run is timed in `runPipelineHost`, plus `queue-wait` and `turn-total` from `runtime/message-queue.ts`, into the `phase_timings` table (30-day retention, insert is fire-and-forget). `GET /api/debug/phase-timings?days=N` returns count/p50/p95/avg/max per phase; rendered by `dashboard/src/components/LatencyCard.tsx` on the Overview page.
- Chat options: only standard OpenAI-compatible fields are sent — `model`, `messages`, `stream`, `max_tokens`, `temperature`, `top_p`, `reasoning_effort` (when thinking is on), and optional `response_format`/`tools`/`stop`. The generation cap is `max_tokens`. There is **no** provider `options` bag (the Ollama-native `num_ctx`/`skip_special_tokens`/`top_k`/`repeat_penalty`/`chat_template_kwargs` were dropped). `numCtx` is a local budgeting value only (sizes prompt/history in `server/src/settings/limits.ts`); context size itself is fixed at model-load time by the backend and never sent per request.
- **Chat history limits are derived** from `numCtx` and `numPredict` via `getHistoryLimits()` — not separate settings. Dashboard preview: `dashboard/src/derivedHistoryLimits.ts` (keep in sync with server).

**OpenAI-compatible backends:** Chat requests send the standard `reasoning_effort` field **only when thinking is on** (dashboard `reasoningEffort` — `"low"`/`"medium"`/`"high"` — on the main reply; **`"low"` on all auxiliary side passes**). When thinking is off the field is **omitted entirely** — the standard way to request no reasoning. Exception: the **address gate** passes `think: false` (`server/src/features/addressing/pipeline.ts`) — it runs on every unaddressed group message, so it always omits `reasoning_effort` and uses the lower non-reasoning token floor, regardless of `thinkingEnabled`. JSON replies require the full answer in `message.content`. When thinking is on, every pass keeps `response_format: json_schema` with an extra required **`reasoning`** string field in the schema; chain-of-thought is read from that JSON field (API `reasoning` / `reasoning_content` is a fallback). Parse decision/reply fields from `content` JSON only — never merge `reasoning` into user-facing text. Extensions: `providerChatExtensions()` and `responseFormatForThinking()` in `server/src/shared/`.

**Terminology — OpenAI-compatible only:** This project targets **any OpenAI-compatible API** (Docker Model Runner, LocalAI, vLLM, llama.cpp server, cloud providers, etc.). Do **not** use vendor-specific names in code, comments, docs, or agent replies — especially **“Ollama”**. Describe behavior in neutral terms: “OpenAI-compatible API”, “provider”, “backend”. Integration uses **only** standard OpenAI routes — `GET /v1/models` and `POST /v1/chat/completions`. Non-standard provider routes (e.g. Ollama's `POST /api/show` for native context length) are **not** used; `numCtx` is set manually in Settings and context size is fixed at model-load time by the backend.

### Memory

Three layers (per-user, per-group, general — see `server/src/db/*-memory.ts`), driven by **always-on MCP tools** (`server/src/features/memory/mcp-tools.ts`), not by automatic extraction. The model reads and writes memory on demand, the same way it uses the history tools:

- `memory_get(type, id)` — read the stored document for a `user`/`group`/`general` scope. `id` is the user id or group id (surfaced in the `[SESSION]` block and `[user:name:id]` history tags); ignored for `general`.
- `memory_search(query)` — case-insensitive substring search across all three scopes.
- `memory_save(type, id, content)` — append one durable fact (deduped on insert via `addUserFacts`/`addGroupFacts`/`addGeneralFacts`).
- Memory is **not** injected into the main reply prompt — retrieval is fully tool-driven. The explain/debug view still reads memory from the DB for analysis.

A **debounced background maintenance job** (`server/src/features/memory/queue-scheduler.ts`, wired from `server/src/runtime/queue-schedulers.ts`) runs when the message queue is idle. It does not extract from history; it validates each existing memory document via an LLM cleanup pass (reusing the merge prompt with no new input) to dedupe, drop stale/contradicted lines, and compact. Per-record content fingerprints in `memory_job_chat_state` skip unchanged records.

### Tasks (scheduled jobs)

Owner-managed scheduled jobs that post an in-character message into a chat at a wall-clock time — `once` (date + time), `daily` (time), or `weekly` (weekday mask + time), like calendar events. Created/changed/cancelled **fully verbally** by the owner through always-on MCP tools (the LLM decides — no commands), and via the dashboard Tasks page.

- **MCP tools** (`server/src/features/tasks/mcp-tools.ts`, always-on like memory): `tasks_create`, `tasks_update`, `tasks_delete`, `tasks_get`, `tasks_list`, `tasks_search`. **Owner-gated and chat-bound** via per-turn context (`turn-context.ts`): `systemPromptHost` calls `captureTaskTurnContext(state)` before the main-reply tool loop, so the tools read the current chat/owner/replied-task from a file-level variable (safe — the queue processes one addressed turn at a time). Non-owner calls are rejected in the tool; chat id and creator are taken from context, never from model-passed args.
- **Schedule math** (`schedule.ts`): dependency-free via `Intl`. `computeNextRun(schedule, from, timezone)` returns the next UTC instant (or `null` for a spent `once` task). Timezone comes from the `TZ` env (`config.timezone`) — a single global zone. Each task stores the `timezone` it was created under; on startup `startTaskScheduler` reconciles any enabled task whose stored timezone differs from the current `TZ` (recompute `next_run_at`, re-pin `timezone`), so changing `TZ` re-homes existing tasks without recreating them.
- **Wall-clock scheduler** (`scheduler.ts`, wired in `server/src/runtime/task-scheduler.ts`, started from `server/src/index.ts`): polls every ~30s (independent of the message queue — unlike the debounced memory/vision jobs), fires due tasks, then advances `next_run_at`. When `computeNextRun` returns `null` (a spent `once` task), the task is **deleted**, not disabled. Paused while maintenance mode is on.
- **Removal vs disable**: stopping/cancelling a task **deletes** it (`tasks_delete` / spent one-shots / dashboard Delete). `enabled:false` is only a manual pause for recurring tasks (dashboard toggle / `tasks_update`). The prompt and tool descriptions steer the model to `tasks_delete` for "stop/cancel". Startup reconciliation also clears any leftover disabled/`null`-next `once` rows.
- **Debug log** (`db/task-events.ts`): a 50-row ring buffer of lifecycle events (`created`, `updated`, `deleted`, `fired`, `fire_failed`) recorded from `service.ts` (create/update/delete) and `fire.ts` (fire outcomes, with the generated text or error in `detail`). Served at `GET /api/tasks/debug` (`DELETE` clears it); dashboard debug page `dashboard/src/features/tasks/TasksDebugPage.tsx`, reachable at `/tasks/debug`.
- **Fire path** (`fire.ts`): runs a short in-character LLM pass (personality + mood, like the maintenance announce) to produce a fresh variation each time, sends it via `getBot()`, appends to history (the assistant row stores the first chunk's Telegram `message_id`), and records the sent `message_id → task_id` in `task_messages`. For **recurring** tasks (not `once`) it feeds the last up-to-5 delivered texts back into the fire prompt so the model varies wording instead of repeating itself; one-shots skip this. `getRecentTaskMessageTexts(taskId, entityId, limit)` reads those texts by **joining** `task_messages` → `chat_messages` on `message_id` (the reply content already lives in history — no duplicated copy). The fire is wrapped in a `ProcessingRecorder` (`beginTaskProcessing`) that records a message-processing-style phase trace — **Prompt assembly** (emitted from `out-of-band-reply.ts` via the recorder registry, keyed by `traceTurnId`) → LLM request/waiting/response/result (label `task fire`) → **Reply parsed** → **Formatted for Telegram** → **Delivered** (with sent-message detail) → **History recorded**; failures use `failPhase` (`LLM generation` / `Reply parsed` / `Delivery`). Covered by `server/test/features/tasks/fire.test.ts`.
- **Reply to edit/cancel**: when an addressed message replies to one of a task's fired messages, `getTaskIdByMessage` resolves the task and a `[SESSION]` line names it so the model can `tasks_update`/`tasks_delete` it verbally (mirrors the reply→trace link used by `/explain`).
- **DB** (`server/src/features/tasks/db/`): tables `tasks`, `task_messages`, and `task_events`; REST CRUD under `/api/tasks`. Schedule validation + next-run computation live in `service.ts` (shared by routes and MCP tools). Dashboard page + debug page: `dashboard/src/features/tasks/`.

### Web browsing agent (background)

Owner-triggered agent that navigates the web, extracts info, and downloads files **off the reply path**, then reports back into the chat. It does **not** run inside the main-reply tool loop (unlike `fetch_link`/`search_web`).

- **Trigger** (`server/src/features/web-browse/mcp-tools.ts`): the always-on `browser_agent_start(goal)` MCP tool (no on/off setting; owner-gated at call time via `turn-context.ts` — same pattern as tasks). It only inserts a `browser_agent_runs` row and signals the runner (`signal.ts`), then returns immediately so the reply is never blocked. The prompt tells the model to acknowledge and say it will report back.
- **Runner** (`server/src/runtime/browser-agent-runner.ts`, started from `server/src/index.ts`, paused in maintenance mode): a concurrency-limited (`browserAgentConcurrency`) worker. A goal with **multiple links** is split into per-link sub-tasks (`goal-links.ts` `planGoalLinks` — reuses `link-fetch`'s `extractUrls`) and processed **one by one**, each getting a **fresh** `BrowserSession`. One/zero links = a single task (unchanged). Each sub-task runs an autonomous agent loop (`agent.ts` → `chatCompleteWithTools` with the browser tools) via `runOneLink` (never throws; closes its session in `finally`) — there is **no** step or wall-clock cap; a sub-task runs to completion and is stopped only when the agent reports back or the tool loop detects it is looping (`loopDetected`, which fails that link). Sub-tasks do **not** deliver individually: `runOne` **collects** every link's files + `DownloadRecord`s (`{sourceUrl, filename, sizeBytes, inline}`) + notes, then delivers **ONE** final report when the whole task is done, through `getBot()` + `appendAssistantMessage` (mirrors `features/tasks/fire.ts`). The report is built **deterministically in code** (`report.ts` `formatDownloadReport` — no LLM): a `source url / filename / size` line per download, plus any research/failure notes from links that produced no download. The run row's status/summary reflects `ok/total` links.
- **Browser tools** (`tools.ts`): `browser_navigate`/`browser_click`/`browser_type`/`browser_read` return a text **accessibility snapshot** with numbered element refs (`snapshot.ts` tags `data-agent-ref`) — link elements also expose their `href` so the model sees destinations and avoids ad/redirect links. `browser_extract_media` returns the real media URLs on the page. It **scans the raw page source** (inline player-config scripts hold the tokenized direct file URL — e.g. KVS `get_file/…/5943.mp4/?v-acctoken=…` — before any `<video>` exists), plus `<video>`/`<source>` tags, `og:video` meta, media-file anchors, resource-timing entries, and **network traffic** (`page.on("response")` listener). Extension matching drops the query + trailing slash and checks the path ending — so `preview.mp4.jpg` is excluded and `.mp4/?token` is included (`media.ts`). Results are **filtered** to the requested video (URLs whose path contains a numeric id from the page URL, dropping unrelated preview clips) and ordered **biggest-first** — real byte sizes are probed with a ranged request (`probeSize`) so the highest-quality variant (HD over SD) is the top URL; playlists last. The tool result is concise and directive ("Video file URL: … / Next, call browser_download with url …") — the model does the extract→download chaining itself; there is **no** code that auto-downloads or parses text tool-calls (fixing model tool-use is a prompt/tool-design job, not a code hack). Fast path needs no click; only if nothing is found does it do **one** real user-gesture play click (pop-ups auto-closed via `context.on("page")`, same-tab ad redirects recovered by navigating back) and re-scan. `browser_download` **streams the file to the project-root `downloads/` folder** (Docker-mountable), **always** named from the page title (`session.getPageMetadata()` → `og:title`/`<title>`, reduced to its core segment before an SEO separator — "Foo — full HD film" → "Foo"; extension from the URL/content-type; `download-store.ts` keeps Unicode, strips reserved chars, de-dupes with " (n)"). The tool takes **only** a `url` — there is **no** model-supplied `filename` param (the model would inconsistently pass the raw URL basename, e.g. "6810.mp4", overriding the good title). It **bakes the page data into the file's own container tags** (`metadata.ts` runs `ffmpeg -c copy -metadata …` — a lossless remux, no re-encode — setting `title`, `comment` = description + source, `date`, `source`). ffmpeg is installed in the Docker image; if it is missing locally the download still succeeds untagged (`embedMetadata` returns false). Files within `browserDownloadMaxMb` are **also** attached to the chat; larger ones are marked "(in downloads folder)" in the final report — the `downloads/` folder is Docker-mounted, there is **no** HTTP serving of downloads (the report shows the source page url, never the tokenized `get_file` download URL). It streams to disk with a 6 GB safety cap, so multi-GB videos finish (there is no run-level timeout to race). It sends a browser UA + same-origin `Referer` (tube `get_file` endpoints require them). The tool is named `browser_download` (not `download_file`) for consistency with the other `browser_*` tools — the model naturally reaches for the prefixed name. `browser_screenshot` returns the PNG both to the debug trace (image entry) and **back into the agent loop as an image** (the tool loop injects a follow-up user `image_url` message from `McpToolCallResult.images`, since the tool role can't carry images — `server/src/llm/tool-loop.ts`). `browser_download` is **owner-only** and SSRF-guarded (`ssrf.ts` blocks private/loopback/link-local/reserved IPs on navigate + download); `downloads/` is gitignored and never served over HTTP.
- **Debug/observability**: each run is a first-class processing (`server/src/debug/browser-agent-report.ts` + `server/src/db/debug/browser-agent-processing.ts`, cloning the task domain) — every action is an entry, screenshots are **`image` entries**. Live status (running/idle, goal, step, URL, running/queued counts) flows through `runtime/pipeline-status.ts` → `dashboard:stats` to the sidebar badge + Overview card. The `/browser` dashboard page lists runs and their step timelines (`dashboard/src/features/web-browse/BrowserPage.tsx`).

### Group behavior

- Bot responds when @mentioned, replied to, display name is spoken (regex or LLM for other languages), or on random/image toggles.
- Per-member history in groups (`conversationKey` includes `userId`).
- The `[SESSION]` block surfaces the current speaker's id **plus** their `[user:name:id]` tag and friendly label in **all** chats (DMs included), so the model can mention them properly instead of falling back to a bare id (`buildSessionBlock` in `server/src/pipeline/adapters/system-prompt.ts`). The group-only `[CURRENT SPEAKER]` turn block is separate from this.
- **Cache-stable system prompt** — the system prompt (`buildSystemPrompt`) contains only slow-changing content (base rules, length hints, personality, known-user directory, `## Tools`, owner, reply format) and must stay **byte-identical between turns** of a chat so the backend's prompt/KV cache reuses the prefix. All volatile per-turn context — the `[SESSION]` block and `[CURRENT MOOD]` — is assembled by `buildTurnContextBlocks` and carried at the **top of the latest user message**. Never add timestamps, mood, speaker identity, or other per-turn values to the system prompt.
- **Current time is given in two forms** in the `[SESSION]` block: `utc now:` (ISO-8601 UTC — for history tools' `from`/`to` date ranges) and `current time:` (the local wall clock in `config.timezone`, named). Scheduled-task times (`tasks_*` `time`, HH:MM) are interpreted in the bot timezone, so the model **must** compute relative times ("in 5 min", "at 18:00") from the local `current time:`, not the UTC value — feeding only UTC made it miscompute and create junk past-dated tasks.
- The latest-turn user message is assembled as **strict, ordered blocks** in `buildLatestTurnMessage` (`server/src/pipeline/chat-messages.ts`): `[SESSION]`/`[CURRENT MOOD]` (via `turnContextBlocks`) → `[RECENT CHAT]` (background window, excludes the current message) → `[CURRENT SPEAKER]` → `[MENTIONED USERS]` → `[REPLY CONTEXT]`/`[REPLY THREAD]` → `[CURRENT MESSAGE]`. `[CURRENT MESSAGE]` always carries the literal body as the single thing to answer — without it the model answers the tail of the window when a reply jumps back to an earlier topic. Every tool round of the main reply shares this same user content. Keep these labels in sync with the guidance in `BASE_SYSTEM_PROMPT_CORE` and the `## Tools` section if you rename a block.
- Owner account: `ownerUsername` in settings; id resolved via Telegram API + `known_users` table. Owner-only commands: `/mood`, `/explain` (completions feature), `/remember`.
- **Maintenance mode** (`maintenanceModeEnabled`): only the owner can reach the pipeline; in groups the owner must also include a direct @mention of the bot — gate in `handlers/message.ts`. Toggling maintenance mode from the dashboard triggers an LLM-generated in-character announcement broadcast to every distinct `chat_history` chat key.

### Structured LLM output (JSON schema)

Side passes and the main reply use **strict JSON schemas** enforced via OpenAI-compatible `response_format`. Each feature exports a `*_RESPONSE_FORMAT` constant describing only the actual output fields (`reply`, `addressed`, mood traits, etc.). Chain-of-thought is **never** a JSON field — reasoning models return it on the separate API channel (`reasoning` / `reasoning_content`), so the schema and prompts stay reasoning-free regardless of `thinkingEnabled`. Prompts describe the same fields in prose. Parsers validate decision/reply fields only — they must not be loosened to accept model mistakes.

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
- **English-only source — never use Cyrillic anywhere in code.** All source — including prompt strings, system-prompt/tool descriptions, in-prompt examples, tests, comments, and identifiers — must be proper English. No Cyrillic characters and no transliteration of foreign words, even inside example snippets shown to the model (write "my name is …", not a Ukrainian/Russian phrase). The bot still *replies* in the user's language at runtime via the language policy in the prompt — that is data, not source.
- **No vendor-specific LLM naming** — say “OpenAI-compatible API / provider / backend”, not product names (e.g. Ollama). Optional metadata routes (`/api/show`, `/api/tags`) are provider extensions, not the primary contract.
- **Settings** (stored in Postgres) — add new keys to `DEFAULT_SETTINGS` in `server/src/db/index.ts`, validation in `server/src/settings/limits.ts`, allowed PATCH keys in `server/src/api/routes/settings.ts`, and dashboard `Settings` in `dashboard/src/api.ts`.

## Dashboard pages

| Route | Purpose |
|-------|---------|
| `/` | Overview, stats, error log, per-phase reply latency (p50/p95) |
| `/character` | Default + custom system prompts |
| `/settings` | LLM, model, owner, maintenance mode, performance, vision, stickers, background maintenance, vision backfill |
| `/history` | Stored chat transcripts per Telegram chat |
| `/memory` | User/group/general facts; `/memory/debug` for the maintenance job run list + phase/LLM detail |
| `/mood` | Global mood state and cooldown (per-character mood defaults live on `/character`) |
| `/tasks` | Scheduled tasks per chat; `/tasks/debug` for the event log |
| `/browser` | Web browsing agent: live run status + recent runs with per-step timeline and screenshots |
| `/vision` | Vision backfill job run list + phase/LLM detail (live countdown when scheduled) |
| `/debug` | Per-message processing traces (chat → message → step detail) |
| `/data` | Raw Postgres table browser |
| `/workflow` | Live pipeline diagram from `GET /api/workflow` (core pipeline hosts + queue order) |

State: `dashboard/src/context/DashboardContext.tsx`. API client: `dashboard/src/api.ts`.

**Styling** — Tailwind CSS v4 (`@tailwindcss/vite`). Theme tokens in `dashboard/src/index.css` (`@theme`: `bg-bg`, `bg-surface`, `text-muted`, `text-accent`, etc.). Shared primitives in `dashboard/src/components/ui/` (`Badge`, `Button`, `ButtonLink`, `Card`, `Page`, `PageHeader`, …) and `cn()` in `dashboard/src/lib/cn.ts`. Feature UI uses the same Tailwind tokens via the dashboard Vite build (no separate CSS files). Layout: sidebar is `sticky` on mobile and `fixed` (`md:w-60`) on desktop; main content uses `md:ml-60`.

## Telegram specifics

- Entity offsets are **UTF-16 code units** (same as JS strings) — see `sliceEntity` in `server/src/features/addressing/`.
- Group commands often need `/cmd@BotUsername` when privacy mode is on.
- Mention handling: `server/src/bot/messages/mentions.ts` (skip self-mentions and bot mention for address detection).

## Key files

| Area | Files |
|------|-------|
| Bot entry | `server/src/bot/index.ts`, `handlers/index.ts`, `handlers/message.ts` |
| Pipeline | `server/src/pipeline/queue-runner.ts`, `deliver.ts`, `context.ts`, `turn-services.ts`; `runtime/message-queue.ts`, `runtime/background-jobs.ts`, `runtime/feature-hosts.ts`, `runtime/feature-registry.ts` |
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
| Web browse | `server/src/features/web-browse/` (`session.ts`, `snapshot.ts`, `media.ts`, `ssrf.ts`, `download.ts`, `download-store.ts`, `metadata.ts`, `tools.ts`, `agent.ts`, `turn-context.ts`, `signal.ts`, `mcp-tools.ts`, `db/`); worker `server/src/runtime/browser-agent-runner.ts`; debug `server/src/debug/browser-agent-report.ts` + `server/src/db/debug/browser-agent-processing.ts`; page `dashboard/src/features/web-browse/BrowserPage.tsx` |
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

[Vitest](https://vitest.dev) runs the single server suite — every `server/test/**/*.test.ts` (feature suites in `server/test/features/<name>/`, shared in `server/test/shared/`, server units in `server/test/unit/**`; fixture in `server/test/helpers/settings.ts`; config `server/vitest.config.ts`). Live tests (`**/live/**`) are excluded. Postgres-backed db tests run against the local dev database (`DATABASE_URL` from `.env`) and skip when it is unset — they exercise FTS + vector features no in-memory fake reproduces (see `server/test/helpers/pg.ts`). They share that one database, so the suite runs files serially (`fileParallelism: false`); a plain `npm test` is enough.

### Opt-in live LLM suites

Not part of the post-task gate unless the user asks. Root: `npm run test:llm`. Requires `LLM_BASE_URL` and `LLM_MODEL` (optional `LLM_API_KEY`); suites self-skip when unset.

**Every feature that calls an LLM** (pipeline host or server path) should ship live coverage:

| Script | When it runs | Config (globs) |
|--------|----------------|----------------|
| `test:llm` | Thinking **off** | `vitest.live.config.ts` → `test/live/**` + `test/features/**/live/**/*.live.test.ts` |
| `test:llm:reasoning` | Thinking **on** (`LLM_THINKING_ENABLED=1`) | `vitest.live.reasoning.config.ts` → `test/live/reasoning.test.ts` + `test/features/**/live/**/*.reasoning.live.test.ts` |

Split files with `describe.skipIf(!cfg \|\| liveReasoningMode())` vs `describe.skipIf(!cfg \|\| !liveReasoningMode())` so the two commands never double-run the same cases. `TAVILY_API_KEY` is force-cleared in `test/live/setup-env.ts`.

### Auxiliary generation budget

Reasoning backends spend tokens on hidden chain-of-thought before emitting the structured block, so side passes need a generous `max_tokens`. The floor is `AUXILIARY_NUM_PREDICT` when thinking is off and `AUXILIARY_REASONING_NUM_PREDICT` when it is on (`server/src/settings/limits.ts` and `server/src/shared/`); memory merge raises its own budget (`MEMORY_MERGE_NUM_PREDICT`). Too low a budget makes a pass return empty `content` and silently fail.

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
10. **Cyrillic in source** — easy to slip into prompt strings or in-prompt examples when debugging a non-English chat. Source is English-only; use English example phrases (see **Code conventions**). Grep before finishing: `grep -rnP "[\x{0400}-\x{04FF}]" server/src dashboard/src`.
