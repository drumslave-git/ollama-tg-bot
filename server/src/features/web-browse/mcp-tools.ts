import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FeatureLogging } from "../../shared/index.js";
import { getBrowserTurnContext } from "./turn-context.js";
import { createBrowserAgentRun } from "./db/browser-agent-runs.js";
import { emitRunEnqueued } from "./signal.js";

export const BROWSER_AGENT_START_TOOL_NAME = "browser_agent_start";
export const WEB_BROWSE_TOOL_NAMES = [BROWSER_AGENT_START_TOOL_NAME];

export interface WebBrowseMcpConfig {
  log?: FeatureLogging;
}

export function registerWebBrowseMcpTools(
  server: McpServer,
  config: WebBrowseMcpConfig = {},
): void {
  server.registerTool(
    BROWSER_AGENT_START_TOOL_NAME,
    {
      title: "Start web browsing agent",
      description:
        "Start a background agent that browses the web to accomplish a goal, then reports back " +
        "into THIS chat when done. Use when the owner asks you to research, look up, find, or " +
        "gather something online that needs opening pages, clicking, or downloading a file — not " +
        "for a single known URL (use fetch_link) or a quick search (use search_web). You may pass " +
        "MULTIPLE links in the goal — the agent processes them one by one and reports on each. " +
        "The agent runs on its own; after calling this, tell the user you're on it and will report " +
        "back. Owner only.",
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
