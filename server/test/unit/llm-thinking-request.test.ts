import { describe, expect, it } from "vitest";
import {
  providerChatExtensions,
  shouldUseResponseFormat,
} from "../../src/llm/openai-compat.js";
import { strictObjectSchema } from "../../src/shared/index.js";
import { makeSettings } from "../helpers/settings.js";

// A neutral structured-output format standing in for any JSON pass (reply,
// mood, memory, search, …). The response_format and reasoning_effort request
// policy is generic — nothing below is specific to the main reply.
const SAMPLE_FORMAT = strictObjectSchema(
  "sample",
  { value: { type: "string", description: "any structured field" } },
  ["value"],
);

describe("json response_format request policy", () => {
  const thinkingSettings = makeSettings({
    thinkingEnabled: true,
    reasoningEffort: "medium",
    numCtx: 32768,
  });

  it("attaches a supplied response_format when thinking is on", () => {
    expect(
      shouldUseResponseFormat(thinkingSettings, false, SAMPLE_FORMAT),
    ).toBe(true);
  });

  it("attaches a supplied response_format when thinking is off", () => {
    const settings = makeSettings({ thinkingEnabled: false });
    expect(shouldUseResponseFormat(settings, false, SAMPLE_FORMAT)).toBe(true);
  });

  it("attaches a supplied response_format on auxiliary passes", () => {
    expect(
      shouldUseResponseFormat(thinkingSettings, true, SAMPLE_FORMAT),
    ).toBe(true);
  });

  it("omits response_format when none is supplied", () => {
    expect(shouldUseResponseFormat(thinkingSettings, false, undefined)).toBe(
      false,
    );
  });
});

describe("reasoning_effort request policy", () => {
  const thinkingSettings = makeSettings({
    thinkingEnabled: true,
    reasoningEffort: "medium",
    numCtx: 32768,
  });

  it("sends reasoning_effort on main and auxiliary passes when thinking is on", () => {
    expect(providerChatExtensions(thinkingSettings, false).reasoning_effort).toBe(
      "medium",
    );
    expect(providerChatExtensions(thinkingSettings, true).reasoning_effort).toBe(
      "low",
    );
  });

  it("omits reasoning_effort when thinking is off", () => {
    const ext = providerChatExtensions(
      { ...thinkingSettings, thinkingEnabled: false },
      false,
    );
    expect(ext.reasoning_effort).toBeUndefined();
  });
});
