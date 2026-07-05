import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src/features/web-browse -> repo/app root (../../../..)
const rootDir = path.resolve(__dirname, "..", "..", "..", "..");

/** Project-root folder downloaded files are saved into (Docker-mountable). */
export const DOWNLOADS_DIR = path.join(rootDir, "downloads");

const INVALID_FILENAME_CHARS = new Set('<>:"/\\|?*'.split(""));

/**
 * Sanitize to a safe single-segment filename, keeping Unicode letters (page
 * titles are often non-Latin) and only stripping characters invalid on disk
 * (reserved punctuation + control characters).
 */
export function safeFilename(name: string): string {
  // Take the last path segment ourselves — path.basename() treats "a:" as a
  // Windows drive, which would drop the leading segment cross-platform.
  const segment = name.split(/[/\\]/).pop() ?? "";
  const cleaned = segment
    .split("")
    .filter((ch) => ch.charCodeAt(0) >= 32 && !INVALID_FILENAME_CHARS.has(ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .trim();
  return cleaned && cleaned !== "." && cleaned !== ".."
    ? cleaned.slice(0, 150)
    : "download.bin";
}

export async function ensureDownloadsDir(): Promise<void> {
  await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
}

/** Pick a non-colliding filename in the downloads dir (adds " (n)" if needed). */
export async function uniqueFilename(filename: string): Promise<string> {
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext);
  let candidate = filename;
  let n = 1;
  for (;;) {
    try {
      await fs.access(path.join(DOWNLOADS_DIR, candidate));
      candidate = `${stem} (${n})${ext}`;
      n += 1;
    } catch {
      return candidate;
    }
  }
}

/** File extension (no dot) for a URL, falling back to the content-type. */
export function extForUrl(url: string, mime: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url.split("?")[0]!;
  }
  const match = pathname.replace(/\/+$/, "").match(/\.([a-z0-9]{2,5})$/i);
  if (match) return match[1]!.toLowerCase();
  const m = mime.toLowerCase();
  if (m.includes("mp4")) return "mp4";
  if (m.includes("webm")) return "webm";
  if (m.includes("mpegurl")) return "m3u8";
  if (m.includes("audio/mpeg")) return "mp3";
  return "bin";
}

/**
 * Reduce an SEO-style page title to its core name: the leading segment before
 * a " — " / " – " / " - " / " | " separator (which usually introduces a site
 * name or descriptor). "Foo — full HD movie" → "Foo"; "Bar | Site" → "Bar".
 */
export function primaryTitle(title: string): string {
  const first = title.split(/\s[—–\-|]\s/)[0]?.trim() ?? "";
  return first.length >= 2 ? first : title.trim();
}

/** Build a media filename from a page title + the URL/content-type extension. */
export function buildMediaFilename(
  title: string | null | undefined,
  url: string,
  mime: string,
): string {
  let urlBase = "video";
  try {
    urlBase = path.basename(new URL(url).pathname.replace(/\/+$/, "")) || "video";
  } catch {
    /* keep default */
  }
  const raw = primaryTitle((title ?? "").trim()) || urlBase;
  const stem =
    safeFilename(raw).replace(/\.[a-z0-9]{2,5}$/i, "").trim() || "video";
  return `${stem}.${extForUrl(url, mime)}`;
}

