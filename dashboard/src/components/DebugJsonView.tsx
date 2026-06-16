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

export function DebugJsonView({ value }: { value: unknown }) {
  if (value == null) {
    return <span className="report-empty">(empty)</span>;
  }

  let src: unknown = value;
  if (typeof value === "string") {
    const parsed = tryParseJson(value);
    if (parsed != null && isJsonObject(parsed)) {
      src = parsed;
    } else {
      return <pre className="report-pre">{value || "(empty)"}</pre>;
    }
  }

  if (!isJsonObject(src)) {
    return <pre className="report-pre">{String(value)}</pre>;
  }

  return (
    <div className="report-json-view">
      <ReactJson
        src={src}
        name={false}
        collapsed={2}
        enableClipboard
        displayDataTypes={false}
        displayObjectSize={false}
        theme="twilight"
      />
    </div>
  );
}
