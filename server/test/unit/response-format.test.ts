import { describe, expect, it } from "vitest";
import {
  buildReplyFormatSpec,
  extractClosedBlock,
  extractLastClosedBlock,
  extractTelegramReply,
  parseStructuredResponse,
  stripStructuredMarkup,
} from "../../src/response-format.js";

describe("extractTelegramReply", () => {
  const cases: { name: string; in: string; want: string }[] = [
    { name: "closed block", in: "[REPLY]hello[/REPLY]", want: "hello" },
    { name: "unclosed block", in: "[REPLY]\nпривет", want: "привет" },
    {
      name: "unclosed with sticker tail",
      in: "[REPLY]\n<b>Hi</b>\n[sticker: * Analyze the user",
      want: "<b>Hi</b>",
    },
    {
      name: "assistant said echo with trailing REPLY tag",
      in: "[assistant said] Hey! How can I help you today? [REPLY]",
      want: "Hey! How can I help you today?",
    },
    { name: "empty closed block", in: "[REPLY][/REPLY]", want: "" },
    {
      name: "first closed block wins (not last)",
      in: "[REPLY]one[/REPLY] [REPLY]two[/REPLY]",
      want: "one",
    },
    {
      name: "text before and after REPLY block",
      in: "before [REPLY]inside[/REPLY] after",
      want: "inside",
    },
    {
      name: "plain text without REPLY tag falls through",
      in: "just some random text",
      want: "just some random text",
    },
    {
      name: "whitespace-only closed block",
      in: "[REPLY]   \n [/REPLY]",
      want: "",
    },
    {
      name: "multi-line closed block",
      in: "[REPLY]\nline one\nline two\n[/REPLY]",
      want: "line one\nline two",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(extractTelegramReply(c.in)).toBe(c.want);
    });
  }

  it("strips echoed history metadata tags from the reply body", () => {
    const raw = "[REPLY][user:bob:42 said]: hi there[/REPLY]";
    expect(extractTelegramReply(raw)).toBe("hi there");
  });
});

describe("parseStructuredResponse", () => {
  it("collects memory facts from each memory block", () => {
    const raw = [
      "[REPLY]ok[/REPLY]",
      "[MEMORY]",
      "- likes tea",
      "- lives in Berlin",
      "[/MEMORY]",
      "[GROUP_MEMORY]",
      "* the group is about chess",
      "[/GROUP_MEMORY]",
      "[GENERAL_MEMORY]none[/GENERAL_MEMORY]",
    ].join("\n");

    const parsed = parseStructuredResponse(raw);
    expect(parsed.reply).toBe("ok");
    expect(parsed.memoryFacts).toEqual(["likes tea", "lives in Berlin"]);
    expect(parsed.groupMemoryFacts).toEqual(["the group is about chess"]);
    expect(parsed.generalMemoryFacts).toEqual([]);
  });

  it("treats a bare 'none' memory block as empty", () => {
    const parsed = parseStructuredResponse("[REPLY]hi[/REPLY][MEMORY]None[/MEMORY]");
    expect(parsed.memoryFacts).toEqual([]);
  });
});

describe("stripStructuredMarkup", () => {
  it("removes closed blocks", () => {
    expect(stripStructuredMarkup("a [FOO]b[/FOO] c")).toBe("a  c");
  });

  it("treats an opening tag with no close as an unclosed block to end", () => {
    // UNCLOSED_BLOCK strips from the opening tag to the end of the text.
    expect(stripStructuredMarkup("keep [BAR] drop this")).toBe("keep");
  });

  it("removes a stray closing tag", () => {
    expect(stripStructuredMarkup("hello [/FOO] world")).toBe("hello  world");
  });
});

describe("extractClosedBlock / extractLastClosedBlock", () => {
  it("extractClosedBlock returns the first block", () => {
    expect(extractClosedBlock("[X]first[/X] [X]second[/X]", "X")).toBe("first");
  });

  it("extractLastClosedBlock returns the last block", () => {
    expect(extractLastClosedBlock("[X]first[/X] [X]second[/X]", "X")).toBe(
      "second",
    );
  });

  it("returns null when no closed block is present", () => {
    expect(extractClosedBlock("[X]unclosed", "X")).toBeNull();
  });
});

describe("buildReplyFormatSpec", () => {
  it("describes the REPLY block without nesting the hint inside an example block", () => {
    const spec = buildReplyFormatSpec("HINT-TEXT");
    expect(spec).toContain("[REPLY]");
    expect(spec).toContain("[/REPLY]");
    expect(spec).toContain("HINT-TEXT");
    expect(spec).toContain("do not output a second [REPLY] tag");
    expect(spec).not.toMatch(/\[REPLY\]\s*\nHINT-TEXT\s*\n\[\/REPLY\]/);
  });
});
