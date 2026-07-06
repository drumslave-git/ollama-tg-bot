import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FeatureLogging } from "../../shared/index.js";
import { getBrowserTurnContext } from "./turn-context.js";
import { createBrowserAgentRun } from "./db/browser-agent-runs.js";
import { emitRunEnqueued } from "./signal.js";

export const BROWSE_WEB_TOOL_NAME = "browse_web";
export const WEB_BROWSE_TOOL_NAMES = [BROWSE_WEB_TOOL_NAME];

export interface WebBrowseMcpConfig {
  log?: FeatureLogging;
}

export function registerWebBrowseMcpTools(
  server: McpServer,
  config: WebBrowseMcpConfig = {},
): void {
  server.registerTool(
    BROWSE_WEB_TOOL_NAME,
    {
      title: "Browse the web",
      description:
        "Start a background agent that browses the web and DOWNLOADS files, then reports back " +
        "into THIS chat when done. This is the tool for downloading files or processing a batch " +
        "of links: whenever the owner gives one or more links (even a long list) with a " +
        "download/save/grab-style request, or asks to research, look up, find, or gather " +
        "something that needs opening pages and clicking, call this with ALL the links in the " +
        "goal — the agent processes them one by one and reports on each. Do not refuse with " +
        "\"I can't download files\"; this tool can. NOT for a single page you only need to read " +
        "(use read_page) or a quick factual search (use search_web). The agent runs on its own; " +
        "after calling this, tell the user you're on it and will report back. Owner only.",
      inputSchema: z.object({
        goal: z
          .string()
          .min(4)
          .describe(
            "A clear, self-contained description of what to find or do on the web. Include ALL links the user gave (the agent handles each).",
          ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ goal }) => {
      const ctx = getBrowserTurnContext();
      if (!ctx?.isOwner) {
        return {
          content: [
            { type: "text" as const, text: "Only the owner can start the web browsing agent." },
          ],
          isError: true as const,
        };
      }
      const run = await createBrowserAgentRun({
        goal,
        chatId: ctx.chatId,
        entityId: ctx.entityId,
        messageThreadId: ctx.messageThreadId,
        createdByUserId: ctx.userId ?? "",
        isOwner: ctx.isOwner,
      });
      emitRunEnqueued();
      config.log?.logEvent?.("browser_agent_started", {
        runId: run.id,
        chatId: ctx.chatId,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Browsing run #${run.id} started in the background. Tell the user you're on it and will report back with what you find.`,
          },
        ],
        structuredContent: { ok: true, runId: run.id },
      };
    },
  );
}
