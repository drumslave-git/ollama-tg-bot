export interface JsonSchemaResponseFormat {
  name: string;
  schema: Record<string, unknown>;
}

/** JSON field name for chain-of-thought when thinking is enabled. */
export const REASONING_JSON_FIELD = "reasoning";

const REASONING_SCHEMA_PROPERTY = {
  type: "string",
  description:
    "Brief chain-of-thought for this pass. Put analysis only — never duplicate output field values as prose.",
};

/** Append the reasoning field to a strict object schema (thinking-enabled passes). */
export function withReasoningInSchema(
  format: JsonSchemaResponseFormat,
): JsonSchemaResponseFormat {
  const schema = format.schema as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  return {
    name: format.name,
    schema: {
      ...format.schema,
      properties: {
        [REASONING_JSON_FIELD]: REASONING_SCHEMA_PROPERTY,
        ...schema.properties,
      },
      required: [REASONING_JSON_FIELD, ...(schema.required ?? [])],
    },
  };
}

/** Base schema when thinking is off; includes reasoning when thinking is on. */
export function responseFormatForThinking(
  base: JsonSchemaResponseFormat,
  thinkingEnabled: boolean,
): JsonSchemaResponseFormat {
  return thinkingEnabled ? withReasoningInSchema(base) : base;
}

/** Read chain-of-thought from a structured JSON content string. */
export function readReasoningFromContent(raw: string): string | null {
  const parsed = asObject(parseJsonContent(raw));
  if (!parsed) return null;
  const value = parsed[REASONING_JSON_FIELD];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Prefer JSON `reasoning`; fall back to a separate API reasoning field. */
export function mergeAssistantReasoning(
  content: string,
  apiReasoning: string,
): string {
  return readReasoningFromContent(content) ?? apiReasoning.trim();
}

/** Extra system-prompt line listing the reasoning schema field. */
export function reasoningSchemaSystemSuffix(thinkingEnabled: boolean): string {
  if (!thinkingEnabled) return "";
  return (
    "\n- reasoning (string): brief chain-of-thought for your decision; " +
    "analysis only — never repeat output field values as prose"
  );
}

/** User-message tail reminding the model to return reasoning in JSON. */
export function reasoningJsonUserTail(
  fieldsDescription: string,
  thinkingEnabled: boolean,
): string {
  if (!thinkingEnabled) {
    return `Return JSON with ${fieldsDescription}.`;
  }
  return `Return JSON with reasoning and ${fieldsDescription}.`;
}

/** Build a strict OpenAI-compatible JSON schema object. */
export function strictObjectSchema(
  name: string,
  properties: Record<string, unknown>,
  required: string[],
): JsonSchemaResponseFormat {
  return {
    name,
    schema: {
      type: "object",
      additionalProperties: false,
      properties,
      required,
    },
  };
}

export function toOpenAiResponseFormat(format: JsonSchemaResponseFormat) {
  return {
    type: "json_schema" as const,
    json_schema: {
      name: format.name,
      strict: true,
      schema: format.schema,
    },
  };
}

/** Extract and parse a JSON object from assistant content. */
export function parseJsonContent(raw: string): unknown | null {
  let text = raw.trim();
  if (!text) return null;

  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    text = text.slice(start, end + 1);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function readBoolean(
  obj: Record<string, unknown>,
  key: string,
): boolean | null {
  const value = obj[key];
  return typeof value === "boolean" ? value : null;
}

export function readString(
  obj: Record<string, unknown>,
  key: string,
): string | null {
  const value = obj[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readNullableString(
  obj: Record<string, unknown>,
  key: string,
): string | null {
  const value = obj[key];
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readStringArray(
  obj: Record<string, unknown>,
  key: string,
): string[] | null {
  const value = obj[key];
  if (!Array.isArray(value)) return null;
  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items;
}

export function readInt(
  obj: Record<string, unknown>,
  key: string,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
): number | null {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) return null;
  return rounded;
}
