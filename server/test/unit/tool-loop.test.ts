import { describe, expect, it, vi, beforeEach } from "vitest";
import { chatCompleteWithTools } from "../../src/llm/tool-loop.js";

vi.mock("../../src/llm/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/llm/client.js")>();
  return {
    ...actual,
    chatCompleteDetailed: vi.fn(),
  };
});

import { chatCompleteDetailed } from "../../src/llm/client.js";

const mockedChatCompleteDetailed = vi.mocked(chatCompleteDetailed);

describe("chatCompleteWithTools", () => {
  beforeEach(() => {
    mockedChatCompleteDetailed.mockReset();
  });

  it("answers in a single call when the model needs no tools", async () => {
    // The collapsed loop: the first response without tool calls IS the reply —
    // no separate tool-selection pass, no extra final pass.
    mockedChatCompleteDetailed.mockResolvedValueOnce({
      raw: "direct reply",
      thinking: "some thinking",
    });

    const result = await chatCompleteWithTools(
      [{ role: "user", content: "hello without a link" }],
      {
        tools: [{ type: "function", function: { name: "fetch_link", parameters: {} } }],
        callTool: vi.fn(),
        think: true,
        numPredict: 512,
      },
    );

    expect(mockedChatCompleteDetailed).toHaveBeenCalledTimes(1);
    expect(mockedChatCompleteDetailed.mock.calls[0]?.[1]).toMatchObject({
      allowToolCalls: true,
      think: true,
      numPredict: 512,
      traceLabel: "main reply",
    });
    expect(result.raw).toBe("direct reply");
    expect(result.thinking).toBe("some thinking");
  });

  it("keeps the same system prompt on every round (no tool-round swap)", async () => {
    const systemContent = "Stable system prompt with ## Tools section";
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
          { role: "system", content: systemContent },
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
      .mockResolvedValueOnce({ raw: "answer from page", thinking: "" });

    const result = await chatCompleteWithTools(
      [
        { role: "system", content: systemContent },
        { role: "user", content: "https://example.com/repo" },
      ],
      {
        tools: [{ type: "function", function: { name: "fetch_link", parameters: {} } }],
        callTool: vi.fn().mockResolvedValue({ text: "page text" }),
        traceLabel: "main reply",
      },
    );

    // Both rounds carry the original system message untouched.
    for (const call of mockedChatCompleteDetailed.mock.calls) {
      const messages = call[0];
      expect(messages?.[0]).toMatchObject({
        role: "system",
        content: systemContent,
      });
    }
    expect(mockedChatCompleteDetailed.mock.calls[1]?.[1]).toMatchObject({
      traceLabel: "main reply · after tools 1",
      allowToolCalls: true,
    });
    expect(result.raw).toBe("answer from page");
  });

  it("runs tools then answers on the next round", async () => {
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
        raw: "based on page content",
        thinking: "",
      });

    const result = await chatCompleteWithTools(
      [{ role: "user", content: "https://example.com/repo" }],
      {
        tools: [{ type: "function", function: { name: "fetch_link", parameters: {} } }],
        callTool,
      },
    );

    expect(callTool).toHaveBeenCalledWith("fetch_link", {
      url: "https://example.com/repo",
    });
    expect(mockedChatCompleteDetailed).toHaveBeenCalledTimes(2);
    expect(result.raw).toBe("based on page content");
  });

  function toolRoundResponse(name: string, args: string) {
    const call = {
      id: `call_${name}_${args}`,
      type: "function" as const,
      function: { name, arguments: args },
    };
    return {
      raw: "",
      thinking: "",
      toolCalls: [call],
      conversationMessages: [
        { role: "user" as const, content: "q" },
        { role: "assistant" as const, content: "", tool_calls: [call] },
      ],
    };
  }

  it("keeps calling tools while the model makes progress", async () => {
    const callTool = vi.fn().mockResolvedValue({ text: "result" });
    // 8 distinct tool rounds (no fixed round cap).
    for (let i = 0; i < 8; i += 1) {
      mockedChatCompleteDetailed.mockResolvedValueOnce(
        toolRoundResponse("search", `{"q":"${i}"}`),
      );
    }
    // The model then answers, which ends the loop with that reply.
    mockedChatCompleteDetailed.mockResolvedValueOnce({
      raw: "done",
      thinking: "",
    });

    const result = await chatCompleteWithTools([{ role: "user", content: "q" }], {
      tools: [{ type: "function", function: { name: "search", parameters: {} } }],
      callTool,
    });

    expect(callTool).toHaveBeenCalledTimes(8);
    // 8 tool rounds + 1 answering round — no extra final pass.
    expect(mockedChatCompleteDetailed).toHaveBeenCalledTimes(9);
    expect(result.raw).toBe("done");
  });

  it("forces a no-tools answer when a round only repeats an executed tool call", async () => {
    const callTool = vi.fn().mockResolvedValue({ text: "result" });
    mockedChatCompleteDetailed
      .mockResolvedValueOnce(toolRoundResponse("search", '{"q":"a"}'))
      // Same call again — no progress, so the loop must break to a forced
      // final call without tools.
      .mockResolvedValueOnce(toolRoundResponse("search", '{"q":"a"}'))
      .mockResolvedValueOnce({ raw: "answer", thinking: "" });

    const result = await chatCompleteWithTools([{ role: "user", content: "q" }], {
      tools: [{ type: "function", function: { name: "search", parameters: {} } }],
      callTool,
      traceLabel: "main reply",
    });

    // The duplicate round was detected before executing, so the tool ran once.
    expect(callTool).toHaveBeenCalledTimes(1);
    // round 1 + duplicate round (detected) + forced final.
    expect(mockedChatCompleteDetailed).toHaveBeenCalledTimes(3);
    // The forced final call must not offer tools again.
    const finalOptions = mockedChatCompleteDetailed.mock.calls[2]?.[1];
    expect(finalOptions?.tools).toBeUndefined();
    expect(finalOptions?.traceLabel).toBe("main reply · final");
    expect(result.raw).toBe("answer");
  });

  it("feeds tool result images back as a user image message", async () => {
    const callTool = vi
      .fn()
      .mockResolvedValue({ text: "screenshot taken", images: ["QUJD"] });
    mockedChatCompleteDetailed
      .mockResolvedValueOnce(toolRoundResponse("browser_screenshot", "{}"))
      .mockResolvedValueOnce({ raw: "I can see the page", thinking: "" });

    await chatCompleteWithTools([{ role: "user", content: "look" }], {
      tools: [
        { type: "function", function: { name: "browser_screenshot", parameters: {} } },
      ],
      callTool,
    });

    // The second round's conversation must contain a user message carrying the
    // screenshot as image_url content.
    const secondRoundMessages = mockedChatCompleteDetailed.mock.calls[1]?.[0] ?? [];
    const imageMessage = secondRoundMessages.find(
      (m) =>
        m.role === "user" &&
        Array.isArray((m as { content?: unknown }).content) &&
        ((m as { content: { type: string }[] }).content).some(
          (part) => part.type === "image_url",
        ),
    );
    expect(imageMessage).toBeTruthy();
  });

  it("stops at maxRounds and forces a tool-free final answer", async () => {
    const callTool = vi.fn().mockResolvedValue({ text: "result" });
    mockedChatCompleteDetailed
      .mockResolvedValueOnce(toolRoundResponse("search", '{"q":"a"}'))
      .mockResolvedValueOnce(toolRoundResponse("search", '{"q":"b"}'))
      .mockResolvedValueOnce({ raw: "final", thinking: "" });

    const result = await chatCompleteWithTools([{ role: "user", content: "q" }], {
      tools: [{ type: "function", function: { name: "search", parameters: {} } }],
      callTool,
      maxRounds: 2,
    });

    // Two tool rounds ran, then the cap forced a final tool-free call.
    expect(callTool).toHaveBeenCalledTimes(2);
    const finalOptions = mockedChatCompleteDetailed.mock.calls[2]?.[1];
    expect(finalOptions?.tools).toBeUndefined();
    expect(result.raw).toBe("final");
  });

  it("accumulates thinking across rounds", async () => {
    mockedChatCompleteDetailed
      .mockResolvedValueOnce({
        ...toolRoundResponse("search", '{"q":"a"}'),
        thinking: "round thinking",
      })
      .mockResolvedValueOnce({ raw: "answer", thinking: "final thinking" });

    const result = await chatCompleteWithTools([{ role: "user", content: "q" }], {
      tools: [{ type: "function", function: { name: "search", parameters: {} } }],
      callTool: vi.fn().mockResolvedValue({ text: "result" }),
    });

    expect(result.thinking).toContain("round thinking");
    expect(result.thinking).toContain("final thinking");
  });
});
