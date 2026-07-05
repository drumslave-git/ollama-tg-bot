import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { assertPublicUrl, UnsafeUrlError } from "./ssrf.js";
import {
  DOWNLOADS_DIR,
  buildMediaFilename,
  ensureDownloadsDir,
  uniqueFilename,
} from "./download-store.js";

/** A file streamed to the downloads folder. */
export interface DiskDownload {
  filePath: string;
  filename: string;
  mime: string;
  sizeBytes: number;
}

const DOWNLOAD_HEADERS = (url: URL): Record<string, string> => ({
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  referer: url.origin + "/",
  accept: "*/*",
});

/**
 * Total byte size of a media URL via a ranged request (no body download).
 * Returns 0 when it can't be determined. Used to pick the biggest (highest
 * quality) variant.
 */
export async function probeSize(rawUrl: string): Promise<number> {
  let url: URL;
  try {
    url = await assertPublicUrl(rawUrl);
  } catch {
    return 0;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { ...DOWNLOAD_HEADERS(url), range: "bytes=0-0" },
    });
    await res.body?.cancel().catch(() => {});
    const range = res.headers.get("content-range"); // "bytes 0-0/12345"
    const fromRange = range ? /\/(\d+)\s*$/.exec(range)?.[1] : undefined;
    if (fromRange) return Number(fromRange);
    const len = res.headers.get("content-length");
    return len ? Number(len) : 0;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

export interface DownloadOptions {
  /** Page title used to name the file (extension comes from the URL/mime). */
  title?: string | null;
  /** Absolute cap on bytes written to disk. */
  maxBytes?: number;
  maxRedirects?: number;
}

const MAX_REDIRECTS_DEFAULT = 5;
const HEADER_TIMEOUT_MS = 60_000;
/** Safety cap so a runaway response can't fill the disk (default 6 GB). */
const MAX_DISK_BYTES_DEFAULT = 6 * 1024 * 1024 * 1024;

async function resolveFinalResponse(
  rawUrl: string,
  maxRedirects: number,
): Promise<{ response: Response; finalUrl: URL }> {
  let current = await assertPublicUrl(rawUrl);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEADER_TIMEOUT_MS);
    try {
      const res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: DOWNLOAD_HEADERS(current),
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return { response: res, finalUrl: current };
        await res.body?.cancel().catch(() => {});
        current = await assertPublicUrl(new URL(location, current).toString());
        continue;
      }
      return { response: res, finalUrl: current };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new UnsafeUrlError(`Too many redirects fetching ${rawUrl}`);
}

/**
 * Download a URL to the project's downloads folder, naming the file from the
 * page title. SSRF-guarded (each redirect hop re-checked). Streams to disk with
 * a size cap; the run does not race this, so large videos may take minutes.
 */
export async function downloadToDisk(
  rawUrl: string,
  options: DownloadOptions = {},
): Promise<DiskDownload> {
  const maxBytes = options.maxBytes ?? MAX_DISK_BYTES_DEFAULT;
  const { response, finalUrl } = await resolveFinalResponse(
    rawUrl,
    options.maxRedirects ?? MAX_REDIRECTS_DEFAULT,
  );
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Download failed: HTTP ${response.status}`);
  }
  if (!response.body) throw new Error("Download failed: empty response body");

  const mime = (response.headers.get("content-type") ?? "application/octet-stream")
    .split(";")[0]!
    .trim();

  await ensureDownloadsDir();
  const filename = await uniqueFilename(
    buildMediaFilename(options.title, finalUrl.toString(), mime),
  );
  const filePath = path.join(DOWNLOADS_DIR, filename);

  let written = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      written += chunk.length;
      if (written > maxBytes) {
        cb(new Error(`Download exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB cap`));
        return;
      }
      cb(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      counter,
      createWriteStream(filePath),
    );
  } catch (err) {
    await fs.rm(filePath, { force: true }).catch(() => {});
    throw err;
  }

  return { filePath, filename, mime, sizeBytes: written };
}
