import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { downloadToDisk } from "../../../src/features/web-browse/download.js";
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
