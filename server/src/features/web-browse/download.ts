import { spawn } from "node:child_process";
import { once } from "node:events";
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

/** Thrown when a streaming (HLS/DASH) download needs ffmpeg but it is absent. */
export class FfmpegMissingError extends Error {}

/** True for an HLS/DASH manifest URL — must be muxed with ffmpeg, not GET-ed. */
export function isStreamingManifest(url: string): boolean {
  return /\.(m3u8|mpd)(\/|\?|$)/i.test(url);
}

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

/** ffmpeg read/write timeout (µs) so a stalled segment can't hang forever. */
const STREAM_RW_TIMEOUT_US = 30_000_000;

/** ffmpeg input URL(s) plus the `-map` args that pair them. */
export interface HlsInputs {
  inputUrls: string[];
  maps: string[];
}

/**
 * Choose the ffmpeg input(s) for an HLS master playlist: the highest-bandwidth
 * video variant, plus its demuxed audio rendition when the master carries audio
 * as a separate group (`#EXT-X-MEDIA:TYPE=AUDIO` + `AUDIO="…"` on the variant) —
 * so the top-quality download still has sound instead of ffmpeg's default of the
 * FIRST (lowest) variant. When the text is not a master (already a media
 * playlist) or has no variants, the URL is returned unchanged for ffmpeg to
 * handle directly. Pure/synchronous so it can be unit-tested against real
 * playlists. Relative variant/audio URIs resolve against `masterUrl`.
 */
export function selectBestHlsInputs(
  masterText: string,
  masterUrl: string,
): HlsInputs {
  const asIs: HlsInputs = { inputUrls: [masterUrl], maps: [] };
  if (!/#EXT-X-STREAM-INF/i.test(masterText)) return asIs;
  const lines = masterText.split(/\r?\n/);
  const variants: { bandwidth: number; uri: string; audioGroup: string | null }[] = [];
  const audios: { group: string; uri: string; isDefault: boolean; autoselect: boolean }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^#EXT-X-STREAM-INF:/i.test(line)) {
      const bandwidth = Number(line.match(/[^-]BANDWIDTH=(\d+)/i)?.[1] ?? 0);
      const audioGroup = line.match(/AUDIO="([^"]*)"/i)?.[1] ?? null;
      // The variant URI is the next non-comment, non-empty line.
      const uri = lines
        .slice(i + 1)
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith("#"));
      if (uri) variants.push({ bandwidth, uri, audioGroup });
    } else if (/^#EXT-X-MEDIA:.*TYPE=AUDIO/i.test(line)) {
      const uri = line.match(/URI="([^"]*)"/i)?.[1];
      if (uri) {
        audios.push({
          group: line.match(/GROUP-ID="([^"]*)"/i)?.[1] ?? "",
          uri,
          isDefault: /DEFAULT=YES/i.test(line),
          autoselect: /AUTOSELECT=YES/i.test(line),
        });
      }
    }
  }
  if (variants.length === 0) return asIs;
  const best = variants.reduce((a, b) => (b.bandwidth > a.bandwidth ? b : a));
  const abs = (u: string): string => {
    try {
      return new URL(u, masterUrl).href;
    } catch {
      return u;
    }
  };
  // Audio demuxed into its own playlist → mux the chosen video + audio together.
  // Prefer the group's DEFAULT (then AUTOSELECT, then first) rendition.
  const groupAudio = audios.filter((a) => a.group === best.audioGroup);
  const audio =
    groupAudio.find((a) => a.isDefault) ??
    groupAudio.find((a) => a.autoselect) ??
    groupAudio[0];
  if (best.audioGroup && audio) {
    return {
      inputUrls: [abs(best.uri), abs(audio.uri)],
      maps: ["-map", "0:v:0", "-map", "1:a:0"],
    };
  }
  // Audio already muxed into the variant → a single input carries both streams.
  return { inputUrls: [abs(best.uri)], maps: [] };
}

/**
 * Fetch an HLS master and resolve it to the best-quality ffmpeg input(s). Only
 * `.m3u8` masters are inspected; DASH (`.mpd`) and any fetch/parse failure fall
 * back to the original URL so ffmpeg still gets a working (if default-quality)
 * input — never a hard failure.
 */
async function resolveHlsInputs(url: URL): Promise<HlsInputs> {
  const asIs: HlsInputs = { inputUrls: [url.toString()], maps: [] };
  if (!/\.m3u8(\/|$)/i.test(url.pathname)) return asIs;
  try {
    const res = await fetch(url.toString(), {
      headers: DOWNLOAD_HEADERS(url),
      redirect: "follow",
    });
    if (!res.ok) return asIs;
    return selectBestHlsInputs(await res.text(), url.toString());
  } catch {
    return asIs;
  }
}

/** PNG file signature — the wrapper some tube CDNs prepend to media segments. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Absolute segment URLs from an HLS media playlist (skips tags/comments). */
function parseHlsSegments(playlistText: string, baseUrl: string): string[] {
  const out: string[] = [];
  for (const raw of playlistText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    try {
      out.push(new URL(line, baseUrl).href);
    } catch {
      // skip an unparseable segment line
    }
  }
  return out;
}

/**
 * Strip a leading PNG wrapper that some tube CDNs prepend to each media segment
 * to disguise it as an image (the player removes it in-browser before feeding
 * MSE). Returns the bytes after the PNG's IEND chunk — the real MPEG-TS payload;
 * returns the buffer unchanged when it is not PNG-wrapped.
 */
export function stripPngWrapper(buf: Buffer): Buffer {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return buf;
  const iend = buf.indexOf("IEND", 0, "latin1");
  if (iend < 0) return buf;
  return buf.subarray(iend + 8); // "IEND" type (4 bytes) + CRC (4 bytes)
}

/**
 * Whether a media playlist's first segment is served as a PNG-wrapped file
 * (image/png magic bytes). Such segments must be de-obfuscated by us — ffmpeg
 * fetches them itself and chokes on the image data. Any failure → false, so the
 * normal ffmpeg path is used.
 */
async function firstSegmentIsPngCloaked(playlistUrl: string): Promise<boolean> {
  if (!/\.m3u8(\/|\?|$)/i.test(playlistUrl)) return false;
  try {
    const purl = new URL(playlistUrl);
    const res = await fetch(playlistUrl, {
      headers: DOWNLOAD_HEADERS(purl),
      redirect: "follow",
    });
    if (!res.ok) return false;
    const first = parseHlsSegments(await res.text(), playlistUrl)[0];
    if (!first) return false;
    const sres = await fetch(first, {
      headers: { ...DOWNLOAD_HEADERS(purl), range: "bytes=0-7" },
      redirect: "follow",
    });
    const head = Buffer.from(await sres.arrayBuffer());
    return head.subarray(0, 8).equals(PNG_SIGNATURE);
  } catch {
    return false;
  }
}

/**
 * Fetch an HLS media playlist's segments, strip any PNG wrapper, and append the
 * raw payload to `outPath`. Stops at `maxBytes` written or `maxSegments` fetched
 * (whichever comes first). Returns bytes written and segments consumed.
 */
async function fetchStripConcat(
  playlistUrl: string,
  outPath: string,
  limit: { maxBytes?: number; maxSegments?: number },
): Promise<{ bytes: number; segments: number }> {
  const purl = new URL(playlistUrl);
  const res = await fetch(playlistUrl, {
    headers: DOWNLOAD_HEADERS(purl),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`playlist fetch failed: ${res.status}`);
  const segments = parseHlsSegments(await res.text(), playlistUrl);
  const out = createWriteStream(outPath);
  let bytes = 0;
  let count = 0;
  try {
    for (const seg of segments) {
      if (limit.maxSegments != null && count >= limit.maxSegments) break;
      if (limit.maxBytes != null && bytes >= limit.maxBytes) break;
      const sres = await fetch(seg, {
        headers: DOWNLOAD_HEADERS(purl),
        redirect: "follow",
      });
      if (!sres.ok) continue;
      const payload = stripPngWrapper(Buffer.from(await sres.arrayBuffer()));
      if (!out.write(payload)) await once(out, "drain");
      bytes += payload.length;
      count++;
    }
  } finally {
    out.end();
    await once(out, "finish").catch(() => {});
  }
  return { bytes, segments: count };
}

/**
 * Download a PNG-cloaked HLS stream ffmpeg can't fetch itself: pull each segment,
 * strip its PNG wrapper, concatenate the raw MPEG-TS to temp files (video and,
 * when demuxed, audio), then ffmpeg-muxes the LOCAL streams into an MP4. Capped
 * by maxBytes on the video track, leaving a valid partial for long movies; audio
 * is fetched to the same segment count so it lines up.
 */
async function downloadDeobfuscatedHls(
  inputUrls: string[],
  maps: string[],
  filePath: string,
  filename: string,
  maxBytes: number,
): Promise<DiskDownload> {
  const videoTmp = `${filePath}.v.ts`;
  const audioTmp = `${filePath}.a.ts`;
  const hasAudio = inputUrls.length > 1 && maps.length > 0;
  try {
    const v = await fetchStripConcat(inputUrls[0]!, videoTmp, { maxBytes });
    if (v.segments === 0) throw new Error("no segments could be downloaded");
    const localInputs = [videoTmp];
    let localMaps: string[] = [];
    if (hasAudio) {
      await fetchStripConcat(inputUrls[1]!, audioTmp, { maxSegments: v.segments });
      localInputs.push(audioTmp);
      localMaps = ["-map", "0:v:0", "-map", "1:a:0"];
    }
    const muxArgs = (bsf: string[]): string[] => [
      "-y",
      ...localInputs.flatMap((f) => ["-i", f]),
      ...localMaps,
      "-c",
      "copy",
      ...bsf,
      "-fs",
      String(maxBytes),
      filePath,
    ];
    // TS-packaged AAC needs aac_adtstoasc to be valid in MP4; retry without it
    // for fMP4-carried audio that the filter rejects.
    const sizeBytes = await runFfmpeg(
      muxArgs(["-bsf:a", "aac_adtstoasc"]),
      filePath,
    ).catch(async (err: unknown) => {
      if (err instanceof FfmpegMissingError) throw err;
      return runFfmpeg(muxArgs([]), filePath);
    });
    return { filePath, filename, mime: "video/mp4", sizeBytes };
  } finally {
    await fs.rm(videoTmp, { force: true }).catch(() => {});
    await fs.rm(audioTmp, { force: true }).catch(() => {});
  }
}

/**
 * Download an HLS/DASH stream (`.m3u8`/`.mpd`) by muxing its segments into one
 * `.mp4` with ffmpeg (`-c copy`, no re-encode). Blob/MSE players feed segments
 * into the page, so there is no single progressive file to GET — ffmpeg is the
 * only way to assemble one. Uses the system ffmpeg (same as metadata tagging);
 * throws FfmpegMissingError when it is not installed. The `-fs` cap stops it at
 * the size limit, leaving a valid, playable partial file. When the CDN cloaks
 * segments as PNGs, de-obfuscates them ourselves first (ffmpeg can't).
 */
export async function downloadStreamToDisk(
  rawUrl: string,
  options: DownloadOptions = {},
): Promise<DiskDownload> {
  const url = await assertPublicUrl(rawUrl);
  const maxBytes = options.maxBytes ?? MAX_DISK_BYTES_DEFAULT;
  await ensureDownloadsDir();
  // The mux always yields an MP4 regardless of the .m3u8/.mpd source extension.
  const base = buildMediaFilename(options.title, url.toString(), "video/mp4");
  const filename = await uniqueFilename(
    `${base.replace(/\.[a-z0-9]{1,5}$/i, "")}.mp4`,
  );
  const filePath = path.join(DOWNLOADS_DIR, filename);

  const headerArg =
    Object.entries(DOWNLOAD_HEADERS(url))
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n") + "\r\n";
  // Resolve to the highest-quality inputs. For an HLS master this is the
  // top-bandwidth video variant plus its demuxed audio (so the best-quality
  // download keeps sound); otherwise ffmpeg is handed the URL as-is.
  const { inputUrls, maps } = await resolveHlsInputs(url);

  // Some tube CDNs cloak each MPEG-TS segment inside a tiny PNG (the player
  // strips it in-browser); ffmpeg fetches the segments itself and dies on the
  // image data. Detect that and fetch + de-obfuscate the segments ourselves.
  if (await firstSegmentIsPngCloaked(inputUrls[0]!)) {
    return downloadDeobfuscatedHls(inputUrls, maps, filePath, filename, maxBytes);
  }

  const inputArgs = inputUrls.flatMap((inUrl) => [
    "-rw_timeout",
    String(STREAM_RW_TIMEOUT_US),
    // Accept real segments whose URL extension is non-standard (e.g. tube CDNs
    // that name TS segments `.png`/`.image`); ffmpeg otherwise refuses them.
    "-extension_picky",
    "0",
    "-headers",
    headerArg,
    "-i",
    inUrl,
  ]);
  const outArgs = (bsf: string[]): string[] => [
    ...maps,
    "-c",
    "copy",
    ...bsf,
    "-fs",
    String(maxBytes),
    filePath,
  ];

  // TS-packaged AAC needs the aac_adtstoasc bitstream filter to become valid in
  // an MP4 — but that same filter errors out on fMP4 (already-ASC) HLS. Try with
  // it first (older TS-based tube sites), then fall back without it (modern fMP4)
  // so a single code path covers both segment formats.
  const sizeBytes = await runFfmpeg(
    ["-y", ...inputArgs, ...outArgs(["-bsf:a", "aac_adtstoasc"])],
    filePath,
  ).catch(async (err: unknown) => {
    if (err instanceof FfmpegMissingError) throw err;
    return runFfmpeg(["-y", ...inputArgs, ...outArgs([])], filePath);
  });

  if (sizeBytes === 0) {
    await fs.rm(filePath, { force: true }).catch(() => {});
    throw new Error("Streaming download failed: ffmpeg produced no output.");
  }
  return { filePath, filename, mime: "video/mp4", sizeBytes };
}

/**
 * Run ffmpeg with the given args and return the output file's byte size.
 * Throws FfmpegMissingError when ffmpeg is absent; throws (with the file removed)
 * when the run produced nothing. ffmpeg exits non-zero when the `-fs` cap
 * interrupts it, yet the partial MP4 is valid and playable, so a non-empty file
 * on disk counts as success regardless of the exit code.
 */
async function runFfmpeg(args: string[], filePath: string): Promise<number> {
  let stderrTail = "";
  const outcome = await new Promise<number | "enoent">((resolve) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    // Keep only the tail — enough to explain a failure without unbounded memory.
    proc.stderr?.on("data", (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000);
    });
    proc.on("error", () => resolve("enoent")); // ffmpeg not installed
    proc.on("close", (code) => resolve(code ?? 1));
  });
  if (outcome === "enoent") {
    await fs.rm(filePath, { force: true }).catch(() => {});
    throw new FfmpegMissingError(
      "This video streams in HLS/DASH format, which needs ffmpeg to download, but ffmpeg is not installed on the server.",
    );
  }
  let sizeBytes = 0;
  try {
    sizeBytes = (await fs.stat(filePath)).size;
  } catch {
    sizeBytes = 0;
  }
  if (sizeBytes === 0) {
    await fs.rm(filePath, { force: true }).catch(() => {});
    // Surface the last ffmpeg error lines so a failure is diagnosable from logs.
    const reason = stderrTail
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-2)
      .join(" | ");
    throw new Error(
      `ffmpeg exited ${outcome} with no output${reason ? `: ${reason}` : ""}`,
    );
  }
  return sizeBytes;
}
