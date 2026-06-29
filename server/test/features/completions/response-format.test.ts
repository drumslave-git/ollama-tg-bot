import { describe, expect, it } from "vitest";
import {
  buildReplyFormatSpec,
  extractTelegramReply,
  getMainReplyResponseFormat,
  MAIN_REPLY_RESPONSE_FORMAT,
  stripStructuredMarkup,
} from "../../../src/features/completions/response-format.js";

describe("extractTelegramReply", () => {
  const cases: { name: string; in: string; want: string }[] = [
    {
      name: "JSON reply field",
      in: '{"reply":"hello"}',
      want: "hello",
    },
    {
      name: "JSON with multiline reply",
      in: '{"reply":"line one\\nline two"}',
      want: "line one\nline two",
    },
    {
      name: "JSON with sticker tail stripped",
      in: '{"reply":"<b>Hi</b>\\n[sticker: * Analyze the user"}',
      want: "<b>Hi</b>",
    },
    {
      name: "empty reply field",
      in: '{"reply":""}',
      want: "",
    },
    {
      name: "plain text fallback when JSON is invalid",
      in: "just some random text",
      want: "just some random text",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(extractTelegramReply(c.in)).toBe(c.want);
    });
  }

  it("strips echoed history metadata tags from the reply body", () => {
    const raw = '{"reply":"[user:bob:42 said]: hi there"}';
    expect(extractTelegramReply(raw)).toBe("hi there");
  });
});

describe("stripStructuredMarkup", () => {
  it("removes closed blocks", () => {
    expect(stripStructuredMarkup("a [FOO]b[/FOO] c")).toBe("a  c");
  });

  it("treats an opening tag with no close as an unclosed block to end", () => {
    expect(stripStructuredMarkup("keep [BAR] drop this")).toBe("keep");
  });

  it("removes a stray closing tag", () => {
    expect(stripStructuredMarkup("hello [/FOO] world")).toBe("hello  world");
  });
});

describe("buildReplyFormatSpec", () => {
  it("asks for plain text, not a JSON wrapper, and includes the format hint", () => {
    const spec = buildReplyFormatSpec("HINT-TEXT");
    expect(spec).toContain("plain text");
    expect(spec).toContain("HINT-TEXT");
    expect(spec).not.toContain("Respond with JSON only");
    expect(spec).not.toContain("reply (string)");
  });

  it("never asks for a reasoning field", () => {
    const spec = buildReplyFormatSpec("HINT-TEXT");
    expect(spec).not.toContain("reasoning");
  });
});

describe("MAIN_REPLY_RESPONSE_FORMAT", () => {
  it("defines a strict reply object schema", () => {
    expect(MAIN_REPLY_RESPONSE_FORMAT.name).toBe("telegram_reply");
    expect(MAIN_REPLY_RESPONSE_FORMAT.schema).toMatchObject({
      type: "object",
      required: ["reply"],
    });
  });

  it("never adds a reasoning field to the schema", () => {
    const format = getMainReplyResponseFormat();
    expect(format.schema.required).toEqual(["reply"]);
    expect(format.schema.properties).not.toHaveProperty("reasoning");
  });
});
