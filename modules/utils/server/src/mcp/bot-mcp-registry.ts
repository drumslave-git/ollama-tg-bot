import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { InProcessTransport } from "./in-process-transport.js";
import { callToolResultToText, mcpToolToOpenAi } from "./openai-tools.js";

export type McpToolRegistrar = (server: McpServer) => void;

export class BotMcpRegistry {
  readonly server: McpServer;
  private client: Client | null = null;
  private connectPromise: Promise<void> | null = null;
  private enabledToolNames = new Set<string>();

  constructor() {
    this.server = new McpServer({ name: "llm-tg-bot", version: "1.0.0" });
  }

  registerTools(registrar: McpToolRegistrar): void {
    registrar(this.server);
  }

  async finishRegistration(): Promise<void> {
    await this.ensureConnected();
  }

  private async ensureConnected(): Promise<Client> {
    if (this.client) return this.client;
    if (!this.connectPromise) {
      this.connectPromise = (async () => {
        const [serverTransport, clientTransport] =
          InProcessTransport.createLinkedPair();
        const client = new Client({
          name: "llm-tg-bot-host",
          version: "1.0.0",
        });
        await this.server.connect(serverTransport);
        await client.connect(clientTransport);
        this.client = client;
      })();
    }
    await this.connectPromise;
    return this.client!;
  }

  setEnabledToolNames(names: string[]): void {
    this.enabledToolNames = new Set(names);
  }

  async listOpenAiTools(): Promise<ChatCompletionTool[]> {
    const client = await this.ensureConnected();
    const { tools } = await client.listTools();
    return tools
      .filter((tool) => this.enabledToolNames.has(tool.name))
      .map((tool) => mcpToolToOpenAi(tool));
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const client = await this.ensureConnected();
    if (!this.enabledToolNames.has(name)) {
      throw new Error(`MCP tool "${name}" is not enabled for this turn`);
    }
    const result = await client.callTool({
      name,
      arguments: args,
    });
    return callToolResultToText(result);
  }
}
