import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile, rm } from "node:fs/promises";
import {
  downloadToDisk,
  isStreamingManifest,
  selectBestHlsInputs,
  stripPngWrapper,
} from "../../../src/features/web-browse/download.js";
import {
  DOWNLOADS_DIR,
  buildMediaFilename,
  extForUrl,
  safeFilename,
} from "../../../src/features/web-browse/download-store.js";

function stubFetch(body: Uint8Array, headers: Record<string, string> = {}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(body.buffer as ArrayBuffer, { status: 200, headers }),
    ),
  );
}

const created: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  for (const f of created.splice(0)) {
    await rm(f, { force: true }).catch(() => {});
    await rm(`${f}.json`, { force: true }).catch(() => {});
  }
});

describe("safeFilename", () => {
  it("strips reserved characters", () => {
    expect(safeFilename('a:b"c?d*e.mp4')).toBe("abcde.mp4");
  });

  it("keeps unicode letters, spaces, and dashes", () => {
    expect(safeFilename("Café — Le Film")).toBe("Café — Le Film");
  });
});

describe("buildMediaFilename", () => {
  it("names from the page title with the URL extension", () => {
    expect(
      buildMediaFilename(
        "My Movie",
        "https://x/get_file/1/abc/5000/5943/5943.mp4/?v-acctoken=Z",
        "video/mp4",
      ),
    ).toBe("My Movie.mp4");
  });

  it("derives the extension from mime when the URL has none", () => {
    expect(extForUrl("https://x/stream?id=9", "video/webm")).toBe("webm");
  });

  it("uses the core title, dropping the SEO descriptor after a separator", () => {
    expect(
      buildMediaFilename("Foo Movie — full HD film", "https://x/5.mp4", "video/mp4"),
    ).toBe("Foo Movie.mp4");
    expect(
      buildMediaFilename("Bar Clip | SomeSite", "https://x/5.mp4", "video/mp4"),
    ).toBe("Bar Clip.mp4");
  });
});

describe("isStreamingManifest", () => {
  it("flags HLS/DASH manifests (which must be muxed with ffmpeg)", () => {
    expect(isStreamingManifest("https://cdn/hls/master.m3u8")).toBe(true);
    expect(isStreamingManifest("https://cdn/v/index.m3u8?token=abc")).toBe(true);
    expect(isStreamingManifest("https://cdn/dash/manifest.mpd")).toBe(true);
  });

  it("treats progressive files and lone segments as non-manifests", () => {
    expect(isStreamingManifest("https://cdn/library/123/ad.mp4")).toBe(false);
    expect(isStreamingManifest("https://cdn/hls/seg-1.ts")).toBe(false);
    expect(isStreamingManifest("https://cdn/clip.webm")).toBe(false);
  });
});

describe("selectBestHlsInputs", () => {
  // The real shape captured from a tube-site master: three video variants
  // (480/720/1080) with a separate (demuxed) audio group, relative URIs.
  const master = [
    "#EXTM3U",
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio0",NAME="English",LANGUAGE="en",AUTOSELECT=YES,DEFAULT=YES,URI="index-f1-a1.m3u8"',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio0",NAME="Russian",LANGUAGE="ru",AUTOSELECT=NO,DEFAULT=NO,URI="index-f1-a2.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=707334,RESOLUTION=960x480,AUDIO="audio0"',
    "index-f1-v1-a2.m3u8",
    '#EXT-X-STREAM-INF:BANDWIDTH=1523714,RESOLUTION=1440x720,AUDIO="audio0"',
    "index-f2-v1-a2.m3u8",
    '#EXT-X-STREAM-INF:BANDWIDTH=2965316,RESOLUTION=2160x1080,AUDIO="audio0"',
    "index-f3-v1-a2.m3u8",
  ].join("\n");
  const url = "https://cdn.example.com/stream/tok/1/master.m3u8";

  it("picks the highest-bandwidth variant + the default demuxed audio", () => {
    const { inputUrls, maps } = selectBestHlsInputs(master, url);
    expect(inputUrls).toEqual([
      "https://cdn.example.com/stream/tok/1/index-f3-v1-a2.m3u8",
      "https://cdn.example.com/stream/tok/1/index-f1-a1.m3u8",
    ]);
    expect(maps).toEqual(["-map", "0:v:0", "-map", "1:a:0"]);
  });

  it("uses a single input when audio is muxed into the variant", () => {
    const muxed = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=800000",
      "sd.m3u8",
      "#EXT-X-STREAM-INF:BANDWIDTH=2500000",
      "hd.m3u8",
    ].join("\n");
    const { inputUrls, maps } = selectBestHlsInputs(muxed, url);
    expect(inputUrls).toEqual(["https://cdn.example.com/stream/tok/1/hd.m3u8"]);
    expect(maps).toEqual([]);
  });

  it("returns the URL unchanged for a media playlist (not a master)", () => {
    const media = "#EXTM3U\n#EXTINF:10,\nseg1.ts\n#EXTINF:10,\nseg2.ts";
    expect(selectBestHlsInputs(media, url)).toEqual({
      inputUrls: [url],
      maps: [],
    });
  });
});

describe("stripPngWrapper", () => {
  // A minimal PNG (signature + IHDR + IEND) with an MPEG-TS payload appended —
  // the exact cloaking seen on the tube CDN.
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("....IHDR....stuff...."),
    Buffer.from("IEND"),
    Buffer.from([0xae, 0x42, 0x60, 0x82]), // IEND CRC
  ]);
  const ts = Buffer.from([0x47, 0x40, 0x00, 0x10, 0xaa, 0xbb]); // MPEG-TS sync

  it("strips the PNG wrapper and returns the appended payload", () => {
    expect(stripPngWrapper(Buffer.concat([png, ts])).equals(ts)).toBe(true);
  });

  it("returns raw MPEG-TS (no PNG signature) unchanged", () => {
    expect(stripPngWrapper(ts).equals(ts)).toBe(true);
  });
});

describe("downloadToDisk", () => {
  it("streams the file into the downloads folder named from the title", async () => {
    stubFetch(new Uint8Array([1, 2, 3, 4, 5]), { "content-type": "video/mp4" });
    const result = await downloadToDisk("http://93.184.216.34/video/5943.mp4", {
      title: "Test Clip",
    });
    created.push(result.filePath);
    expect(result.filename).toBe("Test Clip.mp4");
    expect(result.filePath.startsWith(DOWNLOADS_DIR)).toBe(true);
    expect(result.sizeBytes).toBe(5);
    const bytes = await readFile(result.filePath);
    expect(bytes).toEqual(Buffer.from([1, 2, 3, 4, 5]));
  });

  it("aborts and cleans up when the response exceeds the byte cap", async () => {
    stubFetch(new Uint8Array(2000));
    await expect(
      downloadToDisk("http://93.184.216.34/big.mp4", {
        title: "Big",
        maxBytes: 500,
      }),
    ).rejects.toThrow(/cap/i);
  });

  it("refuses a private target before fetching", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      downloadToDisk("http://127.0.0.1/secret.mp4", { title: "x" }),
    ).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
