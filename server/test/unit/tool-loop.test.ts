import { describe, expect, it, vi, beforeEach } from "vitest";
import { chatCompleteWithTools } from "../../src/llm/tool-loop.js";

vi.mock("../../src/llm/client.js", () => ({
  chatCompleteDetailed: vi.fn(),
}));

import { chatCompleteDetailed } from "../../src/llm/client.js";

const mockedChatCompleteDetailed = vi.mocked(chatCompleteDetailed);

const replyFormat = {
  name: "reply",
  schema: {
    type: "object",
    properties: { reply: { type: "string" } },
    required: ["reply"],
  },
};

describe("chatCompleteWithTools", () => {
  beforeEach(() => {
    mockedChatCompleteDetailed.mockReset();
  });

  it("continues to the JSON final pass when the tool round returns text without tool calls", async () => {
    mockedChatCompleteDetailed
      .mockResolvedValueOnce({
        raw: "premature plain-text reply",
        thinking: "tool-round thinking",
      })
      .mockResolvedValueOnce({
        raw: '{"reply":"final json reply"}',
        thinking: "final thinking",
      });

    const result = await chatCompleteWithTools(
      [{ role: "user", content: "hello without a link" }],
      {
        tools: [{ type: "function", function: { name: "fetch_link", parameters: {} } }],
        callTool: vi.fn(),
        responseFormat: replyFormat,
        think: true,
        toolRoundNumPredict: 2048,
      },
    );

    expect(mockedChatCompleteDetailed).toHaveBeenCalledTimes(2);
    expect(mockedChatCompleteDetailed.mock.calls[0]?.[1]).toMatchObject({
      allowToolCalls: true,
      responseFormat: undefined,
      think: true,
      numPredict: 2048,
      auxiliary: true,
      traceLabel: "main reply tools 1",
    });
    expect(mockedChatCompleteDetailed.mock.calls[1]?.[1]).toMatchObject({
      responseFormat: replyFormat,
      traceLabel: "main reply",
    });
    expect(result.raw).toBe('{"reply":"final json reply"}');
    expect(result.thinking).toContain("tool-round thinking");
    expect(result.thinking).toContain("final thinking");
  });

  it("runs tools then finishes with the JSON pass", async () => {
    const callTool = vi.fn().mockResolvedValue({ text: "page content" });

    mockedChatCompleteDetailed
      .mockResolvedValueOnce({
        raw: "",
        thinking: "",
        toolCalls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "fetch_link",
              arguments: '{"url":"https://example.com/repo"}',
            },
          },
        ],
        conversationMessages: [
          { role: "user", content: "https://example.com/repo" },
          {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "fetch_link",
                  arguments: '{"url":"https://example.com/repo"}',
                },
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        raw: "",
        thinking: "",
      })
      .mockResolvedValueOnce({
        raw: '{"reply":"based on page content"}',
        thinking: "",
      });

    const result = await chatCompleteWithTools(
      [{ role: "user", content: "https://example.com/repo" }],
      {
        tools: [{ type: "function", function: { name: "fetch_link", parameters: {} } }],
        callTool,
        responseFormat: replyFormat,
      },
    );

    expect(callTool).toHaveBeenCalledWith("fetch_link", {
      url: "https://example.com/repo",
    });
    expect(mockedChatCompleteDetailed).toHaveBeenCalledTimes(3);
    expect(result.raw).toBe('{"reply":"based on page content"}');
  });

  it("uses tool-round system instructions without the JSON reply spec", async () => {
    mockedChatCompleteDetailed
      .mockResolvedValueOnce({
        raw: "",
        thinking: "",
        toolCalls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "fetch_link",
              arguments: '{"url":"https://example.com/repo"}',
            },
          },
        ],
        conversationMessages: [
          { role: "user", content: "https://example.com/repo" },
          {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "fetch_link",
                  arguments: '{"url":"https://example.com/repo"}',
                },
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({ raw: "", thinking: "" })
      .mockResolvedValueOnce({ raw: '{"reply":"ok"}', thinking: "" });

    await chatCompleteWithTools(
      [
        {
          role: "system",
          content:
            "Base prompt\n\nRespond with JSON only, matching the provided schema.",
        },
        { role: "user", content: "https://example.com/repo" },
      ],
      {
        tools: [{ type: "function", function: { name: "fetch_link", parameters: {} } }],
        callTool: vi.fn().mockResolvedValue({ text: "page text" }),
        responseFormat: replyFormat,
        traceLabel: "main reply",
      },
    );

    const toolRoundMessages = mockedChatCompleteDetailed.mock.calls[0]?.[0];
    const toolRoundSystem = toolRoundMessages?.[0];
    expect(toolRoundSystem?.role).toBe("system");
    expect(String(toolRoundSystem?.content)).toContain("MCP tool-selection pass");
    expect(String(toolRoundSystem?.content)).toContain("fetch_link");
    expect(String(toolRoundSystem?.content)).not.toContain("Respond with JSON only");
    expect(String(toolRoundSystem?.content)).not.toContain("You are Igor");

    const finalMessages = mockedChatCompleteDetailed.mock.calls[2]?.[0];
    const finalSystem = finalMessages?.[0];
    expect(String(finalSystem?.content)).toContain("Respond with JSON only");
  });
});
