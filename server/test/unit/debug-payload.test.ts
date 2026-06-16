import { describe, expect, it } from "vitest";
import { sanitizeLlmPayloadForDebug } from "../../src/llm/debug-payload.js";

describe("sanitizeLlmPayloadForDebug", () => {
  it("replaces embedded image data URLs with length placeholders", () => {
    const payload = {
      model: "vision-model",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "describe" },
            {
              type: "image_url",
              image_url: {
                url: "data:image/jpeg;base64,QUJDREVGR0hJSktMTU5P",
              },
            },
          ],
        },
      ],
    };

    const sanitized = sanitizeLlmPayloadForDebug(payload) as typeof payload;
    const url = sanitized.messages[0].content[1].image_url.url;
    expect(url).toMatch(/^data:image\/jpeg;base64,<base64 \d+ chars>$/);
  });

  it("leaves non-image payloads unchanged", () => {
    const payload = {
      model: "chat",
      messages: [{ role: "user", content: "hello" }],
      temperature: 0.7,
    };

    expect(sanitizeLlmPayloadForDebug(payload)).toEqual(payload);
  });
});
