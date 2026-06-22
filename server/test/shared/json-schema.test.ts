import { describe, expect, it } from "vitest";
import {
  asObject,
  parseJsonContent,
  readBoolean,
  readInt,
  readNullableString,
  readString,
  readStringArray,
  strictObjectSchema,
  withReasoningInSchema,
} from "../../src/shared/json-schema.js";

describe("parseJsonContent", () => {
  it("parses a raw JSON object", () => {
    expect(parseJsonContent('{"addressed":true}')).toEqual({ addressed: true });
  });

  it("extracts JSON from a fenced block", () => {
    expect(parseJsonContent('```json\n{"addressed":false}\n```')).toEqual({
      addressed: false,
    });
  });

  it("returns null for invalid JSON", () => {
    expect(parseJsonContent("not json")).toBeNull();
  });
});

describe("strictObjectSchema", () => {
  it("marks additionalProperties false", () => {
    const format = strictObjectSchema(
      "test",
      { ok: { type: "boolean" } },
      ["ok"],
    );
    expect(format.schema.additionalProperties).toBe(false);
    expect(format.name).toBe("test");
  });
});

describe("withReasoningInSchema", () => {
  it("prepends a required reasoning field", () => {
    const base = strictObjectSchema("test", { ok: { type: "boolean" } }, [
      "ok",
    ]);
    const withReasoning = withReasoningInSchema(base);
    expect(withReasoning.schema.required).toEqual(["reasoning", "ok"]);
    expect(withReasoning.schema.properties).toHaveProperty("reasoning");
  });
});

describe("read helpers", () => {
  const obj = {
    flag: true,
    name: "  hello ",
    empty: "",
    nullName: null,
    nums: [" one ", "two"],
    count: 3.7,
  };

  it("reads typed fields", () => {
    expect(readBoolean(obj, "flag")).toBe(true);
    expect(readString(obj, "name")).toBe("hello");
    expect(readString(obj, "empty")).toBeNull();
    expect(readNullableString(obj, "nullName")).toBeNull();
    expect(readStringArray(obj, "nums")).toEqual(["one", "two"]);
    expect(readInt(obj, "count", 0, 5)).toBe(4);
  });

  it("returns null for missing object", () => {
    expect(asObject(null)).toBeNull();
  });
});
