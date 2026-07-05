import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { McpToolCallResult } from "../../shared/index.js";
import type { ProcessingRecorder } from "../../debug/processing-recorder.js";
import type { BrowserSession } from "./session.js";
import { readFile } from "node:fs/promises";
import { formatSnapshot, type PageSnapshot } from "./snapshot.js";
import { downloadToDisk } from "./download.js";
import { embedMetadata } from "./metadata.js";
import { UnsafeUrlError } from "./ssrf.js";

/** A file collected during a run, delivered to the chat when the run reports. */
export interface CollectedFile {
  buffer: Buffer;
  filename: string;
  mime: string;
}

/**
 * One completed download, used to build the deterministic end-of-run report
 * (source url / filename / size) without asking the model to phrase it.
 */
export interface DownloadRecord {
  /** The page the file came from — i.e. the link the user gave. */
  sourceUrl: string;
  filename: string;
  sizeBytes: number;
  /** True when the file was small enough to also attach to the chat. */
  inline: boolean;
}

export interface AgentToolContext {
  session: BrowserSession;
  /** Whether the run was started by the owner — gates browser_download. */
  isOwner: boolean;
  downloadMaxMb: number;
  recorder: ProcessingRecorder | null;
  /** Inline files gathered for delivery when the run reports back. */
  files: CollectedFile[];
  /** Every completed download, for the deterministic end-of-run report. */
  downloads: DownloadRecord[];
  /** Called before each action to bump the step counter and live status. */
  onAction: (action: string, url: string | null) => void;
}

function fn(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
): ChatCompletionTool {
  return { type: "function", function: { name, description, parameters } };
}

/** OpenAI tool definitions for the browser agent loop. */
export const BROWSER_AGENT_TOOLS: ChatCompletionTool[] = [
  fn(
    "browser_navigate",
    "Open a URL in the browser and return the page's text and interactive elements. Start here.",
    {
      type: "object",
      properties: {
        url: { type: "string", description: "Public http(s) URL to open" },
      },
      required: ["url"],
    },
  ),
  fn(
    "browser_click",
    "Click an interactive element by its ref number (from the last snapshot's INTERACTIVE ELEMENTS list). Returns the new page state.",
    {
      type: "object",
      properties: {
        ref: { type: "number", description: "The [N] ref of the element to click" },
      },
      required: ["ref"],
    },
  ),
  fn(
    "browser_type",
    "Type text into an input/textarea by its ref number, optionally submitting (Enter). Returns the new page state.",
    {
      type: "object",
      properties: {
        ref: { type: "number", description: "The [N] ref of the input element" },
        text: { type: "string", description: "Text to type" },
        submit: {
          type: "boolean",
          description: "Press Enter after typing (e.g. to run a search)",
        },
      },
      required: ["ref", "text"],
    },
  ),
  fn("browser_read", "Re-read the current page (after it changed). Returns text + elements.", {
    type: "object",
    properties: {},
  }),
  fn(
    "browser_extract_media",
    "Find the real media file URL for the video on the current page. It automatically presses play and dismisses ad pop-ups/redirects to make the video stream load, then returns the single best URL captured from the player and network traffic. Use this to get the actual video URL for browser_download — do NOT click a 'download' link (usually an ad). One video page yields one file.",
    { type: "object", properties: {} },
  ),
  fn(
    "browser_screenshot",
    "Capture a screenshot of the current page. The image is shown to you so you can see the page visually.",
    { type: "object", properties: {} },
  ),
  fn(
    "browser_download",
    "Download a file from a URL to the server's downloads folder (owner only). The file is named automatically from the page title — do NOT pass a filename. Small files are also attached to the chat; large ones get a link. Call this with a URL from browser_extract_media to save the video.",
    {
      type: "object",
      properties: {
        url: { type: "string", description: "Public http(s) URL of the file" },
      },
      required: ["url"],
    },
  ),
];

function snapshotResult(
  ctx: AgentToolContext,
  title: string,
  snapshot: PageSnapshot,
): McpToolCallResult {
  ctx.recorder?.okPhase("browser", title, `${snapshot.url}`, undefined, {
    title: snapshot.title,
    elements: snapshot.elements.length,
  });
  return { text: formatSnapshot(snapshot) };
}

function errorResult(
  ctx: AgentToolContext,
  title: string,
  message: string,
): McpToolCallResult {
  ctx.recorder?.failPhase("browser", title, message);
  return { text: `Error: ${message}` };
}

function num(args: Record<string, unknown>, key: string): number | null {
  const v = args[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Build the dispatcher the tool loop calls for each browser tool invocation. */
export function makeBrowserToolDispatcher(ctx: AgentToolContext) {
  return async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolCallResult> => {
    try {
      switch (name) {
        case "browser_navigate": {
          const url = str(args, "url");
          ctx.onAction(`navigate ${url}`, url);
          return snapshotResult(
            ctx,
            "Navigate",
            await ctx.session.navigate(url),
          );
        }
        case "browser_click": {
          const ref = num(args, "ref");
          if (ref == null) return errorResult(ctx, "Click", "ref is required");
          ctx.onAction(`click [${ref}]`, ctx.session.currentUrl());
          return snapshotResult(ctx, "Click", await ctx.session.click(ref));
        }
        case "browser_type": {
          const ref = num(args, "ref");
          if (ref == null) return errorResult(ctx, "Type", "ref is required");
          const text = str(args, "text");
          const submit = args.submit === true;
          ctx.onAction(`type into [${ref}]`, ctx.session.currentUrl());
          return snapshotResult(
            ctx,
            "Type",
            await ctx.session.type(ref, text, submit),
          );
        }
        case "browser_read": {
          ctx.onAction("read page", ctx.session.currentUrl());
          return snapshotResult(ctx, "Read", await ctx.session.read());
        }
        case "browser_extract_media": {
          ctx.onAction("extract media", ctx.session.currentUrl());
          const urls = await ctx.session.extractMedia();
          ctx.recorder?.okPhase(
            "browser",
            "Extract media",
            `${urls.length} candidate URL(s)`,
            undefined,
            { urls },
          );
          if (urls.length === 0) {
            return {
              text: "No media URLs captured even after pressing play and retrying. The video may be DRM/login-protected or the player blocked automation. Report that the video could not be extracted.",
            };
          }
          // Return ONLY the single best URL. The other entries are just
          // lower-quality variants of the SAME video (HD/SD of one file), not
          // separate videos — surfacing them makes the model download the same
          // video several times. Ranking already put the best variant first.
          const [top] = urls;
          return {
            text:
              `Video file URL: ${top}\n` +
              `This is the one file for this video. Next, call browser_download with url "${top}". Do not download any other URL for this video.`,
          };
        }
        case "browser_screenshot": {
          ctx.onAction("screenshot", ctx.session.currentUrl());
          const buffer = await ctx.session.screenshot();
          const base64 = buffer.toString("base64");
          ctx.recorder?.noteImage("Screenshot", base64);
          return {
            text: "Screenshot captured (shown to you as an image).",
            images: [base64],
          };
        }
        case "browser_download": {
          if (!ctx.isOwner) {
            return errorResult(
              ctx,
              "Download",
              "Only the owner can download files.",
            );
          }
          const url = str(args, "url");
          ctx.onAction(`download ${url}`, ctx.session.currentUrl());
          // Always name the file (and its metadata) from the page it came from
          // — never from a model-supplied name, which is inconsistent (the model
          // sometimes passes the raw URL basename, e.g. "6810.mp4").
          const meta = await ctx.session.getPageMetadata().catch(() => null);
          const result = await downloadToDisk(url, {
            title: meta?.title || null,
          });
          // Bake the page's data into the file's own metadata tags.
          const tagged = await embedMetadata(result.filePath, {
            title: meta?.title ?? result.filename,
            description: meta?.description ?? "",
            sourcePage: meta?.url ?? ctx.session.currentUrl() ?? "",
            sourceUrl: url,
            date: new Date().toISOString().slice(0, 10),
          });
          const mb = Math.round(result.sizeBytes / 1024 / 1024);
          // Small enough for Telegram — also attach it to the chat.
          const inline = result.sizeBytes <= ctx.downloadMaxMb * 1024 * 1024;
          if (inline) {
            ctx.files.push({
              buffer: await readFile(result.filePath),
              filename: result.filename,
              mime: result.mime,
            });
          }
          ctx.downloads.push({
            sourceUrl: meta?.url ?? ctx.session.currentUrl() ?? url,
            filename: result.filename,
            sizeBytes: result.sizeBytes,
            inline,
          });
          ctx.recorder?.okPhase(
            "browser",
            "Download",
            `${result.filename} · ${mb} MB · saved${inline ? " + inline" : ""} · ${tagged ? "tagged" : "no ffmpeg"}`,
          );
          return {
            text:
              `Saved to the downloads folder as "${result.filename}" (${mb} MB)` +
              (tagged ? ", with metadata tags baked in." : ".") +
              (inline
                ? " Attaching it to the chat now."
                : " It is too large to attach here — tell the user the filename and that it is in the downloads folder. Do NOT paste a URL."),
          };
        }
        default:
          return { text: `Unknown tool: ${name}` };
      }
    } catch (err) {
      const message =
        err instanceof UnsafeUrlError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Tool failed";
      return errorResult(ctx, name, message);
    }
  };
}
