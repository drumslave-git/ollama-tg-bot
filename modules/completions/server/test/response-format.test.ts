import { describe, expect, it } from "vitest";
import {
  buildReplyFormatSpec,
  extractTelegramReply,
  MAIN_REPLY_RESPONSE_FORMAT,
  stripStructuredMarkup,
} from "../src/response-format.js";

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
  it("describes the JSON reply field", () => {
    const spec = buildReplyFormatSpec("HINT-TEXT");
    expect(spec).toContain("reply (string)");
    expect(spec).toContain("HINT-TEXT");
    expect(spec).toContain("Respond with JSON only");
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
});
