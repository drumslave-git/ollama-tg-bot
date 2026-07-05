import type { BrowserContext, Page } from "playwright";
import { getSharedChromium } from "../link-fetch/playwright.js";
import { assertPublicUrl } from "./ssrf.js";
import { capturePageSnapshot, REF_ATTR, type PageSnapshot } from "./snapshot.js";
import { isLikelyMediaUrl, isMediaContentType } from "./media.js";
import { probeSize } from "./download.js";

/**
 * In-page code (as a STRING — see snapshot.ts for the `__name` rationale) that
 * collects candidate media URLs from `<video>`/`<source>`/`<audio>` sources,
 * og:video meta tags, and anchors that point at media files.
 */
const EXTRACT_MEDIA_SCRIPT = `(() => {
  var urls = [];
  var add = function(u) { if (u && urls.indexOf(u) === -1) urls.push(u); };
  var exts = [".mp4",".m4v",".webm",".mov",".mkv",".m3u8",".ts",".mpd"];
  // Match on the real file extension (drop query + trailing slashes), NOT
  // substring — so "preview.mp4.jpg" is excluded and ".mp4/?token" is included.
  var isMedia = function(u) {
    var path;
    try { path = new URL(u, document.baseURI).pathname.toLowerCase(); }
    catch (e) { path = String(u || "").toLowerCase().split("?")[0]; }
    path = path.replace(/\\/+$/, "");
    for (var k = 0; k < exts.length; k++) { if (path.endsWith(exts[k])) return true; }
    return false;
  };
  var media = document.querySelectorAll("video, source, audio");
  for (var i = 0; i < media.length; i++) {
    if (media[i].currentSrc) add(media[i].currentSrc);
    var srcAttr = media[i].getAttribute("src");
    if (srcAttr) { try { add(new URL(srcAttr, document.baseURI).href); } catch (e3) { add(srcAttr); } }
  }
  var metas = document.querySelectorAll("meta[property='og:video'], meta[property='og:video:url'], meta[property='og:video:secure_url'], meta[itemprop='contentURL']");
  for (var m = 0; m < metas.length; m++) add(metas[m].getAttribute("content") || "");
  var anchors = document.querySelectorAll("a[href]");
  for (var a = 0; a < anchors.length; a++) { if (isMedia(anchors[a].href)) add(anchors[a].href); }
  // Resource timing catches media the player fetched (HLS/MSE) even when it
  // never became a visible <video src> (e.g. blob-backed players).
  try {
    var res = performance.getEntriesByType("resource");
    for (var r = 0; r < res.length; r++) { if (isMedia(res[r].name)) add(res[r].name); }
  } catch (e2) {}
  // Scan the raw page source (inline player-config scripts hold the direct file
  // URL with its access token before any <video> exists) — this is how the
  // download actually gets the URL. Unescape JSON slashes first.
  try {
    var html = document.documentElement.outerHTML.replace(/\\\\\\//g, "/");
    var found = html.match(/https?:\\/\\/[^\\s"'<>\\\\)]+/g) || [];
    for (var f = 0; f < found.length; f++) {
      var cand = found[f].replace(/[),.]+$/, "");
      if (isMedia(cand)) add(cand);
    }
  } catch (e4) {}
  return urls;
})()`;

/**
 * Kick any `<video>` element into loading (muted autoplay is usually allowed),
 * so the player fires its media network request and the response listener +
 * resource timing can capture the stream URL.
 */
const TRIGGER_PLAY_SCRIPT = `(() => {
  var vids = document.querySelectorAll("video");
  for (var i = 0; i < vids.length; i++) {
    try { vids[i].muted = true; var p = vids[i].play(); if (p && p.catch) p.catch(function(){}); } catch (e) {}
  }
  return vids.length;
})()`;

const ACTION_TIMEOUT_MS = 45_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; LLMTGBot/1.0; +https://github.com/llm-tg-bot)";

/** In-page code (string — see snapshot.ts) collecting page metadata for naming. */
const PAGE_META_SCRIPT = `(() => {
  var pick = function(sel, attr) { var el = document.querySelector(sel); return el ? (el.getAttribute(attr) || "") : ""; };
  var ogTitle = pick("meta[property='og:title']", "content").trim();
  return {
    title: (ogTitle || document.title || "").trim(),
    description: (pick("meta[property='og:description']", "content") || pick("meta[name='description']", "content") || "").trim()
  };
})()`;

export interface PageMetadata {
  title: string;
  description: string;
  url: string;
}

/**
 * One live Playwright page for a single browsing run. Created lazily on the
 * first navigate, owns its own browser context (isolated cookies), and is closed
 * when the run ends. Not shared between runs — the runner holds one per run.
 */
export class BrowserSession {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  /** Media URLs seen in network traffic (streamed video/audio the DOM may hide). */
  private readonly mediaUrls = new Set<string>();

  private async ensurePage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    const browser = await getSharedChromium();
    this.context = await browser.newContext({ userAgent: USER_AGENT });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(ACTION_TIMEOUT_MS);
    // Auto-close ad pop-ups/pop-unders so the agent keeps its main page.
    this.context.on("page", (extra) => {
      if (extra !== this.page) extra.close().catch(() => {});
    });
    // Sniff media responses — streaming video is loaded by network, not links.
    this.page.on("response", (response) => {
      try {
        const url = response.url();
        const contentType = response.headers()["content-type"] ?? null;
        if (isLikelyMediaUrl(url) || isMediaContentType(contentType)) {
          this.mediaUrls.add(url);
        }
      } catch {
        // ignore malformed response events
      }
    });
    return this.page;
  }

  private requirePage(): Page {
    if (!this.page || this.page.isClosed()) {
      throw new Error("No page is open yet — call browser_navigate first.");
    }
    return this.page;
  }

  private refLocator(page: Page, ref: number) {
    return page.locator(`[${REF_ATTR}="${ref}"]`).first();
  }

  async navigate(url: string): Promise<PageSnapshot> {
    await assertPublicUrl(url);
    const page = await this.ensurePage();
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: ACTION_TIMEOUT_MS,
    });
    return capturePageSnapshot(page);
  }

  async click(ref: number): Promise<PageSnapshot> {
    const page = this.requirePage();
    await this.refLocator(page, ref).click({ timeout: ACTION_TIMEOUT_MS });
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    return capturePageSnapshot(page);
  }

  async type(ref: number, text: string, submit: boolean): Promise<PageSnapshot> {
    const page = this.requirePage();
    const locator = this.refLocator(page, ref);
    await locator.fill(text, { timeout: ACTION_TIMEOUT_MS });
    if (submit) {
      await locator.press("Enter");
      await page.waitForLoadState("domcontentloaded").catch(() => {});
    }
    return capturePageSnapshot(page);
  }

  async read(): Promise<PageSnapshot> {
    return capturePageSnapshot(this.requirePage());
  }

  /**
   * Candidate media URLs on the current page: `<video>`/`<source>` sources,
   * og:video meta, media-file anchors, plus any media seen in network traffic
   * since the session opened (the reliable source for streamed video).
   */
  async extractMedia(): Promise<string[]> {
    const page = this.requirePage();
    // Fast path: the direct file URL is usually already in the page source
    // (inline player config) — no click needed.
    let urls = await this.collectMedia();
    if (urls.length === 0) {
      // Lazy player: one real user-gesture play click (pop-ups auto-closed,
      // same-tab ad redirects recovered), then re-scan. One attempt only, to
      // stay well under the run time budget.
      await this.triggerPlayback();
      await page.waitForTimeout(2500).catch(() => {});
      urls = await this.collectMedia();
    }
    const relevant = this.rankByRelevance(urls);
    return (await this.orderBySize(relevant)).slice(0, 30);
  }

  /**
   * Order candidates biggest-first so the top URL is the highest-quality
   * variant (e.g. HD over SD). Probes real byte sizes; playlists (no meaningful
   * size) go last.
   */
  private async orderBySize(urls: string[]): Promise<string[]> {
    const isPlaylist = (u: string): boolean => /\.(m3u8|mpd|ts)(\/|\?|$)/i.test(u);
    const files = urls.filter((u) => !isPlaylist(u));
    const playlists = urls.filter(isPlaylist);
    const probed = await Promise.all(
      files.slice(0, 6).map(async (u) => ({ u, size: await probeSize(u) })),
    );
    probed.sort((a, b) => b.size - a.size);
    return [...probed.map((x) => x.u), ...files.slice(6), ...playlists];
  }

  /**
   * Narrow to the URLs for the requested video and order them best-first. Page
   * /video/5943/ → keep only .../5943/*.mp4 (dropping unrelated preview clips of
   * other videos); if none match, keep all. Progressive files rank above
   * playlists so the top URL is the one to download.
   */
  private rankByRelevance(urls: string[]): string[] {
    const pageIds = (this.currentUrl() ?? "")
      .match(/\d{3,}/g)
      ?.filter((id) => id.length >= 3) ?? [];
    const matches = urls.filter((u) =>
      pageIds.some((id) => u.includes(`/${id}/`)),
    );
    const pool = matches.length > 0 ? matches : urls;
    const isPlaylist = (u: string): number =>
      /\.(m3u8|mpd|ts)(\/|\?|$)/i.test(u) ? 1 : 0;
    return [...pool].sort((a, b) => isPlaylist(a) - isPlaylist(b));
  }

  /** Merge in-page media URLs (DOM + page source) with network-observed ones. */
  private async collectMedia(): Promise<string[]> {
    const page = this.requirePage();
    const inPage = (await page.evaluate(EXTRACT_MEDIA_SCRIPT).catch(() => [])) as string[];
    const merged = new Set<string>();
    for (const url of inPage) if (url) merged.add(url);
    for (const url of this.mediaUrls) merged.add(url);
    return Array.from(merged);
  }

  private sameHost(a: string, b: string): boolean {
    try {
      return new URL(a).host === new URL(b).host;
    } catch {
      return false;
    }
  }

  /**
   * Start playback with a real user-gesture click on the player (JS `.play()` is
   * blocked without a gesture). If the click triggers an ad — a pop-up (already
   * auto-closed) or a same-tab redirect off the original host — recover by
   * navigating back so the next attempt can try again.
   */
  private async triggerPlayback(): Promise<void> {
    const page = this.requirePage();
    const origin = page.url();
    await page.evaluate(TRIGGER_PLAY_SCRIPT).catch(() => {});
    const playSelectors = [
      "video",
      ".vjs-big-play-button",
      "[class*='big-play']",
      "button[class*='play']",
      "[class*='player'] [class*='play']",
      "[id*='player']",
    ];
    for (const selector of playSelectors) {
      const locator = page.locator(selector).first();
      const count = await locator.count().catch(() => 0);
      if (count > 0) {
        await locator
          .click({ timeout: 4000, force: true })
          .catch(() => {});
        break;
      }
    }
    await page.waitForTimeout(1500).catch(() => {});
    // An ad hijacked the main frame to another host — go back and retry.
    if (!this.sameHost(page.url(), origin)) {
      await page
        .goto(origin, { waitUntil: "domcontentloaded", timeout: ACTION_TIMEOUT_MS })
        .catch(() => {});
    }
  }

  async screenshot(): Promise<Buffer> {
    const page = this.requirePage();
    return page.screenshot({ type: "png", fullPage: false });
  }

  /** Page title + description + URL, used to name downloads and fill metadata. */
  async getPageMetadata(): Promise<PageMetadata> {
    const page = this.requirePage();
    const meta = (await page.evaluate(PAGE_META_SCRIPT).catch(() => ({
      title: "",
      description: "",
    }))) as { title: string; description: string };
    return {
      title: meta.title ?? "",
      description: meta.description ?? "",
      url: page.url(),
    };
  }

  /** Current page URL, or null when nothing has been opened. */
  currentUrl(): string | null {
    if (!this.page || this.page.isClosed()) return null;
    return this.page.url();
  }

  async close(): Promise<void> {
    await this.page?.close().catch(() => {});
    await this.context?.close().catch(() => {});
    this.page = null;
    this.context = null;
  }
}
