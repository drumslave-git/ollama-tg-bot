import type { ChatMessage } from "../../llm/client.js";
import { chatCompleteWithTools } from "../../llm/tool-loop.js";
import { getSettings } from "../../db/index.js";
import { getResolvedSettings } from "../../settings/runtime.js";
import { getAuxiliaryNumPredict } from "../../settings/limits.js";
import { extractTelegramReply } from "../completions/index.js";
import type { ProcessingRecorder } from "../../debug/processing-recorder.js";
import type { BrowserSession } from "./session.js";
import {
  BROWSER_AGENT_TOOLS,
  makeBrowserToolDispatcher,
  type AgentToolContext,
  type CollectedFile,
  type DownloadRecord,
} from "./tools.js";

/**
 * Strip tool-call special tokens that leaked into the model's prose. When the
 * loop takes tools away for the forced final answer, a model still "wanting" to
 * act sometimes emits its raw tool-call syntax as literal text
 * (e.g. `<|tool_call>call:browser_navigate{url:<|"|>…<|"|>}<tool_call|>`). That
 * must never reach the chat: remove any angle-bracket token carrying a pipe and
 * any leftover `call:name{…}` body. If nothing readable remains, return "" so
 * the caller falls back to a plain message instead of shipping fragments.
 */
export function sanitizeAgentReport(text: string): string {
  return text
    .replace(/<[^<>]*\|[^<>]*>/g, "")
    .replace(/\bcall:\w+\s*\{[^{}]*\}/gi, "")
    .trim();
}

export interface AgentRunResult {
  report: string;
  /** Every file downloaded this run, for the deterministic end-of-run recap. */
  downloads: DownloadRecord[];
  steps: number;
  /** The run was stopped because the model looped on the same steps (see tool-loop). */
  loopDetected: boolean;
}

function buildAgentSystemPrompt(isOwner: boolean): string {
  return (
    `You are a web-browsing agent working in the background for a chat bot. ` +
    `You are given a goal and a set of browser tools. Accomplish the goal by ` +
    `navigating the web step by step, then write a final report.\n\n` +
    `Rules:\n` +
    `- Start with browser_navigate. After each action you get the page text plus a ` +
    `numbered list of interactive elements — each shows its destination URL after "->". ` +
    `Click or type using the ref numbers.\n` +
    `- Use browser_screenshot when the text snapshot is not enough to understand the page; ` +
    `the image is shown to you.\n` +
    `- To download a video/audio/file, do exactly this: (1) call browser_extract_media ONCE — it ` +
    `returns the video file URL. (2) In your NEXT step call browser_download with that url. Do NOT ` +
    `call browser_extract_media again, and do NOT click "download" links (they are usually ads). ` +
    `(3) browser_download delivers the file or returns a direct link — report that to the user. ` +
    `If browser_extract_media returns nothing, say the video could not be extracted.\n` +
    `- Check an element's "-> URL" before clicking: avoid links that leave the site's domain unless ` +
    `they are the actual media file.\n` +
    `- Take the fewest steps needed. Do not loop or repeat the same action.\n` +
    (isOwner
      ? `- Use browser_download with a real file URL to fetch what the user asked for; it is delivered to the chat.\n`
      : `- Downloads are disabled for this run (only the owner can download files).\n`) +
    `- When you have achieved the goal (or determined it cannot be done), STOP calling tools ` +
    `and reply with a clear, concise report of what you found, in the same language as the goal. ` +
    `That reply is sent to the chat. Do not include raw HTML or tool syntax.`
  );
}

/**
 * Run one browsing goal to completion in the given session. The run is NOT
 * step- or time-capped — it takes as many tool rounds as the goal needs — and
 * is stopped only when the model reports back or the tool loop detects it is
 * looping (see {@link chatCompleteWithTools}). Returns the model's final report
 * text, any files collected for delivery, and whether it was cut off by a loop.
 */
export async function runBrowserAgent(params: {
  goal: string;
  isOwner: boolean;
  recorder: ProcessingRecorder | null;
  session: BrowserSession;
  onProgress: (step: number, action: string, url: string | null) => void;
  onDownload: (
    record: DownloadRecord,
    file: CollectedFile | null,
  ) => Promise<void>;
  /** Live download speed/progress line for the status card (null when done). */
  onDownloadProgress?: (progress: string | null) => void;
}): Promise<AgentRunResult> {
  const settings = getResolvedSettings(await getSettings());
  const downloads: DownloadRecord[] = [];
  let steps = 0;

  const ctx: AgentToolContext = {
    session: params.session,
    isOwner: params.isOwner,
    downloadMaxMb: settings.browserDownloadMaxMb,
    recorder: params.recorder,
    downloads,
    onAction: (action, url) => {
      steps += 1;
      params.onProgress(steps, action, url);
    },
    onDownload: params.onDownload,
    onDownloadProgress: params.onDownloadProgress,
  };

  const messages: ChatMessage[] = [
    { role: "system", content: buildAgentSystemPrompt(params.isOwner) },
    { role: "user", content: `Goal: ${params.goal}` },
  ];

  params.recorder?.okPhase("agent-start", "Agent start", params.goal);

  const result = await chatCompleteWithTools(messages, {
    model: settings.model,
    think: settings.thinkingEnabled,
    numPredict: getAuxiliaryNumPredict(settings),
    tools: BROWSER_AGENT_TOOLS,
    callTool: makeBrowserToolDispatcher(ctx),
    traceTurnId: params.recorder?.traceId,
    traceLabel: "browser agent",
  });

  return {
    report: sanitizeAgentReport(extractTelegramReply(result.raw)),
    downloads,
    steps,
    loopDetected: result.loopDetected ?? false,
  };
}
