/** Deep-clone LLM API payloads for debug storage; shrink embedded image data URLs. */
export function sanitizeLlmPayloadForDebug(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, replacer));
}

function replacer(_key: string, val: unknown): unknown {
  if (typeof val !== "string") return val;

  if (val.startsWith("data:image/")) {
    const comma = val.indexOf(",");
    if (comma > 0) {
      const header = val.slice(0, comma + 1);
      const dataLen = val.length - comma - 1;
      return `${header}<base64 ${dataLen} chars>`;
    }
  }

  if (
    val.startsWith("data:") &&
    val.includes(";base64,") &&
    val.length > 256
  ) {
    const comma = val.indexOf(",");
    const header = val.slice(0, comma + 1);
    const dataLen = val.length - comma - 1;
    return `${header}<base64 ${dataLen} chars>`;
  }

  return val;
}
