import type { BrowserContext, Page } from "playwright";
import { getSharedChromium } from "../link-fetch/playwright.js";
import { assertPublicUrl } from "./ssrf.js";
import { capturePageSnapshot, REF_ATTR, type PageSnapshot } from "./snapshot.js";
import { isLikelyMediaUrl, isMediaContentType } from "./media.js";
import { probeSize } from "./download.js";

/** A URL ending in an HLS/DASH manifest extension (a streaming playlist). */
function isManifestUrl(u: string): boolean {
  return /\.(m3u8|mpd)(\/|\?|$)/i.test(u);
}
/** A URL ending in an HLS transport-stream segment (a piece of a manifest). */
function isSegmentUrl(u: string): boolean {
  return /\.ts(\/|\?|$)/i.test(u);
}

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

/**
 * In-page code (string — see snapshot.ts) reporting whether the frame holds a
 * streaming player: a `<video>` whose source is a `blob:`/MediaSource URL. Such
 * players (JWPlayer, hls.js, etc.) feed HLS/DASH segments into MSE, so the real
 * file is the manifest — any progressive `.mp4` on the page is almost always an
 * ad creative, not the requested video.
 */
const HAS_STREAMING_PLAYER_SCRIPT = `(() => {
  var vids = document.querySelectorAll("video");
  for (var i = 0; i < vids.length; i++) {
    var s = vids[i].currentSrc || vids[i].getAttribute("src") || "";
    if (s.indexOf("blob:") === 0 || s.indexOf("mediasource:") === 0) return true;
  }
  return false;
})()`;

/**
 * In-page code (string — see snapshot.ts) reporting the cross-origin player
 * embed URL(s) on the page. Hostile DLE tube sites don't ship the player in the
 * DOM: they inject `<iframe src="https://host/e/ID">` only when the poster is
 * clicked — and that same click fires an ad pop-under/redirect. But the embed URL
 * is sitting in the page's inline script as an `iframe.src = "https://..."`
 * assignment, so we read it straight from source (and from any already-live
 * iframe) and navigate there directly, skipping the ad trap entirely. Kept
 * generic — matches on URL SHAPE (cross-origin, non-asset, embed-like path),
 * never a hardcoded host list. Embed-shaped paths (\`/e/\`, \`/embed/\`, …) rank
 * first so the real player beats an incidental cross-origin iframe.
 */
const EXTRACT_EMBED_SCRIPT = `(() => {
  var out = [];
  var ASSET = /\\.(js|css|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|mp4|webm|m3u8|mpd|ts|json|xml)(\\?|$)/i;
  var add = function(u) {
    if (!u) return;
    var abs;
    try { abs = new URL(u, document.baseURI).href; } catch (e) { return; }
    if (!/^https?:/i.test(abs)) return;
    try { if (new URL(abs).host === location.host) return; } catch (e2) { return; }
    if (ASSET.test(abs)) return;
    if (out.indexOf(abs) === -1) out.push(abs);
  };
  var ifr = document.querySelectorAll("iframe[src]");
  for (var i = 0; i < ifr.length; i++) add(ifr[i].getAttribute("src"));
  var scripts = document.querySelectorAll("script");
  var re = /\\.src\\s*=\\s*["'](https?:\\/\\/[^"']+)["']/g;
  for (var s = 0; s < scripts.length; s++) {
    var txt = scripts[s].textContent || "";
    var m;
    while ((m = re.exec(txt))) add(m[1]);
  }
  var EMBED = /\\/(e|v|embed|iframe|player)\\//i;
  out.sort(function(a, b) { return (EMBED.test(b) ? 1 : 0) - (EMBED.test(a) ? 1 : 0); });
  return out;
})()`;

const ACTION_TIMEOUT_MS = 45_000;
/**
 * How long to let the DOM settle after a navigation commits. Junk-laden video
 * sites stream ads/trackers that keep `domcontentloaded` from ever firing, so we
 * cap the settle well below ACTION_TIMEOUT_MS and snapshot whatever has rendered
 * rather than failing a page that was usable seconds earlier.
 */
const SETTLE_TIMEOUT_MS = 8_000;
/** How many candidate files to probe for real byte size when picking the biggest. */
const MAX_SIZE_PROBES = 10;
/** Grace period after navigating to a player embed so its HLS manifest loads. */
const EMBED_SETTLE_MS = 3_500;
/** Cap on player embeds to try before giving up (bounds run time). */
const MAX_EMBED_FOLLOWS = 4;
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
    // Resolve as soon as the server responds and navigation commits, instead of
    // blocking on "domcontentloaded". Junk-laden video sites stream ads/trackers
    // that keep the document "loading" long after the real content is present, so
    // a strict wait times out on a page that was usable seconds earlier.
    try {
      await page.goto(url, { waitUntil: "commit", timeout: ACTION_TIMEOUT_MS });
    } catch (err) {
      // Nothing committed (DNS/connection failure) — there is no page to read,
      // so surface the error. Otherwise fall through and snapshot what loaded.
      if (page.url() === "about:blank" || page.url() === "") throw err;
    }
    // Give the DOM a bounded chance to parse; tolerate the event never firing.
    await page
      .waitForLoadState("domcontentloaded", { timeout: SETTLE_TIMEOUT_MS })
      .catch(() => {});
    return capturePageSnapshot(page);
  }

  async click(ref: number): Promise<PageSnapshot> {
    const page = this.requirePage();
    const locator = this.refLocator(page, ref);
    // Fast-fail an unknown ref. count() is instant, whereas getAttribute/click
    // would each auto-wait the full ACTION_TIMEOUT_MS for an element that never
    // appears — a stalled model guessing at refs otherwise burns ~45s per miss.
    if ((await locator.count().catch(() => 0)) === 0) {
      throw new Error(
        `No element with ref ${ref} on the current page. Call browser_read to get the current refs, then click one of those.`,
      );
    }
    // For a link, follow its real href by NAVIGATING rather than dispatching a
    // synthetic click. Sketchy sites hijack the first click anywhere on the page
    // into an off-site ad redirect (a pop-under/interstitial), so a DOM click on
    // a video thumbnail lands on the ad instead of the video. The href is the
    // exact destination the snapshot already showed the model after "->", so
    // going straight to it is both safer and truer to intent.
    const rawHref = await locator.getAttribute("href").catch(() => null);
    if (rawHref) {
      let resolved = "";
      try {
        resolved = new URL(rawHref, page.url()).href;
      } catch {
        resolved = "";
      }
      if (/^https?:\/\//i.test(resolved)) return this.navigate(resolved);
    }
    // Non-link (button, role=link element, JS onclick): a real click is required.
    // If it hijacks the main frame to another host, recover by returning to the
    // page we clicked from — same guard triggerPlayback() uses.
    const origin = page.url();
    await locator.click({ timeout: ACTION_TIMEOUT_MS });
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    if (!this.sameHost(page.url(), origin)) {
      await page
        .goto(origin, { waitUntil: "domcontentloaded", timeout: ACTION_TIMEOUT_MS })
        .catch(() => {});
    }
    return capturePageSnapshot(page);
  }

  async type(ref: number, text: string, submit: boolean): Promise<PageSnapshot> {
    const page = this.requirePage();
    const locator = this.refLocator(page, ref);
    if ((await locator.count().catch(() => 0)) === 0) {
      throw new Error(
        `No element with ref ${ref} on the current page. Call browser_read to get the current refs, then type into one of those.`,
      );
    }
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
   * The single best media file URL for the video on the current page, or null if
   * none could be captured. Gathers candidates (`<video>`/`<source>` sources,
   * og:video meta, media anchors, inline player config, and network traffic),
   * narrows to the requested video, then returns the one file to download.
   */
  async extractMedia(): Promise<string | null> {
    const page = this.requirePage();
    // Pass 1: scan every frame's DOM/source plus network traffic so far.
    let urls = await this.collectMedia();
    let streaming = await this.hasStreamingPlayer();

    // Pass 2: follow embedded player(s). Hostile tube sites host the real video
    // on a separate player domain and only inject its `<iframe>` on a click that
    // also springs an ad pop-under/redirect. The embed URL is already in the
    // page source, so navigate straight to it — this skips the ad trap and lands
    // on the player page, where the HLS manifest loads on its own. Done BEFORE
    // the click fallback so we never trip the ad in the first place. A page can
    // list several players (tabs); some are ad-laden and expose only a preroll
    // `.mp4`, so try them in order and STOP at the first that yields a real HLS
    // manifest — that is the one to download.
    if (!urls.some((u) => isManifestUrl(u))) {
      for (const embed of await this.discoverEmbedUrls()) {
        await this.navigate(embed).catch(() => {});
        await page.waitForTimeout(EMBED_SETTLE_MS).catch(() => {});
        urls = await this.collectMedia();
        if (urls.some((u) => isManifestUrl(u))) {
          // A manifest loaded → this is a streaming player; its progressive files
          // are ad prerolls. Force the streaming verdict so pickBest returns the
          // manifest, not a leftover ad `.mp4` from a sibling player we tried.
          streaming = true;
          break;
        }
        streaming = await this.hasStreamingPlayer();
      }
    }

    // Pass 3: last resort for players that expose no embed URL in source — one
    // real user-gesture play click across every frame (pop-ups auto-closed,
    // same-tab ad redirects recovered), then re-scan. Ad creatives (progressive
    // .mp4s) load instantly, but a blob/MSE player only fetches its manifest ON
    // play. One attempt only, to stay under the run budget.
    if (!urls.some((u) => isManifestUrl(u))) {
      await this.triggerPlayback();
      await page.waitForTimeout(2500).catch(() => {});
      urls = await this.collectMedia();
      streaming = await this.hasStreamingPlayer();
    }
    return this.pickBest(this.rankByRelevance(urls), streaming);
  }

  /**
   * Cross-origin player-embed URLs to follow, embed-shaped first, capped at
   * {@link MAX_EMBED_FOLLOWS}. Scans every frame's live iframes and inline
   * scripts (see EXTRACT_EMBED_SCRIPT), keeping only URLs off the current page's
   * host (so we move to a player, not reload the same ad-laden page).
   */
  private async discoverEmbedUrls(): Promise<string[]> {
    const page = this.requirePage();
    const current = page.url();
    const seen = new Set<string>();
    for (const frame of page.frames()) {
      const found = (await frame
        .evaluate(EXTRACT_EMBED_SCRIPT)
        .catch(() => [])) as string[];
      for (const url of found) {
        if (!this.sameHost(url, current)) seen.add(url);
      }
    }
    return Array.from(seen).slice(0, MAX_EMBED_FOLLOWS);
  }

  /**
   * Pick the one URL to download. With a streaming (blob/MSE) player the real
   * video is the HLS/DASH manifest (ffmpeg muxes it on download), so return that
   * and NEVER a progressive `.mp4` — those are ad creatives loaded in separate
   * frames; report nothing if no manifest loaded rather than hand back an ad.
   * Otherwise the target is a progressive file: pick the largest (probed by real
   * byte size, so HD wins over SD and over unrelated preview clips), falling back
   * to a manifest only when no progressive file exists. Returns null when empty.
   */
  private async pickBest(urls: string[], streaming: boolean): Promise<string | null> {
    const playlists = urls.filter(isManifestUrl);
    // HLS/DASH segments (.ts) are pieces of a manifest, not standalone targets.
    const files = urls.filter((u) => !isManifestUrl(u) && !isSegmentUrl(u));
    if (streaming) return playlists[0] ?? null;
    if (files.length === 0) return playlists[0] ?? null;
    const probed = await Promise.all(
      files.slice(0, MAX_SIZE_PROBES).map(async (u) => ({ u, size: await probeSize(u) })),
    );
    probed.sort((a, b) => b.size - a.size);
    // A probed size of 0 means the HEAD failed, not an empty file — still better
    // than returning nothing, and better than an unprobed tail file.
    return probed[0]?.u ?? files[0] ?? playlists[0] ?? null;
  }

  /** True when any frame hosts a blob/MSE `<video>` (real content is streamed). */
  private async hasStreamingPlayer(): Promise<boolean> {
    const page = this.requirePage();
    for (const frame of page.frames()) {
      const blob = await frame
        .evaluate(HAS_STREAMING_PLAYER_SCRIPT)
        .catch(() => false);
      if (blob) return true;
    }
    return false;
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
    const merged = new Set<string>();
    // Video players are almost always embedded in an iframe, so the
    // `<video>`/`<source>` elements and the inline player config that hold the
    // real file URL live in a child frame, not the main document. Scan every
    // frame — Playwright evaluates inside each frame's own context, so even
    // cross-origin player iframes are reachable.
    for (const frame of page.frames()) {
      const inFrame = (await frame
        .evaluate(EXTRACT_MEDIA_SCRIPT)
        .catch(() => [])) as string[];
      for (const url of inFrame) if (url) merged.add(url);
    }
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
    const playSelectors = [
      "video",
      ".vjs-big-play-button",
      "[class*='big-play']",
      "button[class*='play']",
      "[class*='player'] [class*='play']",
      "[id*='player']",
    ];
    // The player is usually inside an iframe, so kick playback in every frame,
    // not just the main document — otherwise the media request never fires and
    // nothing is captured. Each frame gets the JS `.play()` nudge plus one real
    // click on its first play-like element.
    for (const frame of page.frames()) {
      await frame.evaluate(TRIGGER_PLAY_SCRIPT).catch(() => {});
      for (const selector of playSelectors) {
        const locator = frame.locator(selector).first();
        const count = await locator.count().catch(() => 0);
        if (count > 0) {
          await locator.click({ timeout: 4000, force: true }).catch(() => {});
          break;
        }
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
