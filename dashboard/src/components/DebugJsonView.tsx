import ReactJson from "react-json-view";

function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function isJsonObject(value: unknown): value is object {
  return value != null && typeof value === "object";
}

const preClasses =
  "m-0 max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/25 p-3 font-mono text-[0.78rem] leading-snug";

export function DebugJsonView({
  value,
  collapsed = 2,
}: {
  value: unknown;
  /** react-json-view collapse depth: `true` collapses to the root, or a depth number. */
  collapsed?: boolean | number;
}) {
  if (value == null) {
    return (
      <span className="block p-3 text-sm text-muted">(empty)</span>
    );
  }

  let src: unknown = value;
  if (typeof value === "string") {
    const parsed = tryParseJson(value);
    if (parsed != null && isJsonObject(parsed)) {
      src = parsed;
    } else {
      return <pre className={preClasses}>{value || "(empty)"}</pre>;
    }
  }

  if (!isJsonObject(src)) {
    return <pre className={preClasses}>{String(value)}</pre>;
  }

  return (
    <div className="max-h-[480px] overflow-auto border-t border-border p-2.5 px-3 pb-3 text-[0.78rem] [&_.react-json-view]:!bg-transparent">
      <ReactJson
        src={src}
        name={false}
        collapsed={collapsed}
        enableClipboard
        displayDataTypes={false}
        displayObjectSize={false}
        theme="twilight"
      />
    </div>
  );
}
