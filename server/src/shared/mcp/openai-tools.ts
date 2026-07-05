import type { ChatCompletionTool } from "openai/resources/chat/completions";

export interface McpListedTool {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

export function mcpToolToOpenAi(tool: McpListedTool): ChatCompletionTool {
  const schema = tool.inputSchema ?? { type: "object", properties: {} };
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description ?? tool.name,
      parameters: schema,
    },
  };
}

export function callToolResultToText(result: unknown): string {
  const payload = result as {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  const parts =
    payload.content
      ?.filter((item) => item.type === "text" && item.text)
      .map((item) => item.text!.trim())
      .filter(Boolean) ?? [];

  if (parts.length === 0) {
    return payload.isError ? "Tool returned an error." : "Tool returned no content.";
  }

  return parts.join("\n\n");
}

/** Extract base64 image payloads from an MCP tool result's image content blocks. */
export function callToolResultToImages(result: unknown): string[] {
  const payload = result as {
    content?: Array<{ type: string; data?: string }>;
  };
  return (
    payload.content
      ?.filter((item) => item.type === "image" && item.data)
      .map((item) => item.data!)
      .filter(Boolean) ?? []
  );
}
