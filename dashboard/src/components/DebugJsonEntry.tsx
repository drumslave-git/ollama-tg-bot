import { DebugJsonView } from "./DebugJsonView";

/** Message, reasoning and tool calls pulled out of an LLM response body. */
interface LlmResponseView {
  message: string;
  reasoning: string;
  toolCalls: Array<{ name: string; arguments: string }>;
}

const preClass =
  "m-0 max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/25 p-3 font-mono text-[0.78rem] leading-snug";

const sectionLabel =
  "text-[0.68rem] font-semibold uppercase tracking-wide text-muted";

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

/** Normalise tool calls from either the raw API shape or the fallback shape. */
function readToolCalls(raw: unknown): LlmResponseView["toolCalls"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((call) => {
      // Raw API: { function: { name, arguments } }; fallback: { name, arguments }.
      const fn = isObject(call) && isObject(call.function) ? call.function : call;
      const args = isObject(fn) ? fn.arguments : undefined;
      return {
        name: isObject(fn) ? asString(fn.name) : "",
        arguments:
          typeof args === "string" ? args : args == null ? "" : JSON.stringify(args),
      };
    })
    .filter((call) => call.name || call.arguments);
}

/**
 * Detect an LLM response by its data shape and pull the fields worth surfacing.
 * Handles both the raw chat-completion body (`choices[0].message.*`) and the
 * `{ content, reasoning, toolCalls }` fallback the recorder stores when no raw
 * body is available. Returns null for any other JSON so it renders as a tree.
 */
function detectLlmResponse(value: unknown): LlmResponseView | null {
  if (!isObject(value)) return null;

  // Raw chat-completion response body.
  const choices = value.choices;
  if (Array.isArray(choices) && isObject(choices[0]) && isObject(choices[0].message)) {
    const message = choices[0].message as Record<string, unknown>;
    return {
      message: asString(message.content),
      reasoning: asString(message.reasoning) || asString(message.reasoning_content),
      toolCalls: readToolCalls(message.tool_calls),
    };
  }

  // Fallback shape written when the provider gave us no raw body.
  if ("content" in value && "reasoning" in value && "toolCalls" in value) {
    return {
      message: asString(value.content),
      reasoning: asString(value.reasoning),
      toolCalls: readToolCalls(value.toolCalls),
    };
  }

  return null;
}

/** True when a `json` entry's content is an LLM response the UI upgrades. */
export function isLlmResponse(content: string): boolean {
  return detectLlmResponse(tryParseJson(content)) != null;
}

/** Pretty-print tool-call arguments, which arrive as a JSON string. */
function formatArgs(args: string): string {
  try {
    return JSON.stringify(JSON.parse(args), null, 2);
  } catch {
    return args;
  }
}

function LlmResponseBlocks({
  view,
  raw,
}: {
  view: LlmResponseView;
  raw: unknown;
}) {
  const { message, reasoning, toolCalls } = view;
  const hasTools = toolCalls.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-1.5">
        <span className={sectionLabel}>JSON</span>
        <div className="overflow-hidden rounded-lg border border-border bg-black/12">
          <DebugJsonView value={raw} collapsed={true} />
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <span className={sectionLabel}>{hasTools ? "Tool calls" : "Message"}</span>
        {hasTools ? (
          <div className="flex flex-col gap-2">
            {toolCalls.map((call, i) => (
              <div key={i} className="overflow-hidden rounded-lg border border-border">
                <div className="bg-black/20 px-3 py-1.5 font-mono text-[0.78rem] font-semibold">
                  {call.name || "(unnamed)"}
                </div>
                <pre className={`${preClass} rounded-none`}>
                  {formatArgs(call.arguments)}
                </pre>
              </div>
            ))}
            {message ? <pre className={preClass}>{message}</pre> : null}
          </div>
        ) : (
          <pre className={preClass}>{message || "(empty)"}</pre>
        )}
      </section>

      {reasoning ? (
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer select-none px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-muted">
            Reasoning · {reasoning.length} chars
          </summary>
          <pre className={`${preClass} rounded-t-none border-t border-border`}>
            {reasoning}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

/**
 * Renders a `json` debug entry. If the payload looks like an LLM response it is
 * broken into block-level sections — the raw JSON (collapsed), the message or
 * tool calls, and the reasoning (collapsed by default) — so the message and
 * reasoning are readable without drilling the JSON tree. Any other JSON renders
 * as the usual collapsed tree.
 */
export function DebugJsonEntry({ content }: { content: string }) {
  const parsed = tryParseJson(content);
  const view = detectLlmResponse(parsed);
  if (view == null) {
    return <DebugJsonView value={content} collapsed={true} />;
  }
  return <LlmResponseBlocks view={view} raw={parsed} />;
}
