import { errorMessage } from "../../logging/index.js";
import { chromium, type Browser, type BrowserContext } from "playwright";
import type { FetchedPage } from "./types.js";

const NAVIGATION_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_URLS_PER_TURN = 3;
const MAX_PAGE_TEXT_CHARS = 12_000;

const USER_AGENT =
  "Mozilla/5.0 (compatible; LLMTGBot/1.0; +https://github.com/llm-tg-bot)";

let browser: Browser | null = null;
let browserInit: Promise<Browser> | null = null;

export async function closePlaywrightBrowser(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
    browserInit = null;
  }
}

async function ensureBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  if (!browserInit) {
    browserInit = chromium
      .launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      })
      .then((b) => {
        browser = b;
        return b;
      })
      .catch((err) => {
        browserInit = null;
        throw err;
      });
  }
  return browserInit;
}

function trimPageText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_PAGE_TEXT_CHARS);
}

async function fetchOnePage(
  context: BrowserContext,
  url: string,
): Promise<FetchedPage> {
  const page = await context.newPage();
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    const title = (await page.title()).trim();
    const rawText = await page.evaluate(() => {
      const body = document.body;
      if (!body) return "";
      return body.innerText ?? "";
    });
    return {
      url,
      title,
      text: trimPageText(rawText),
    };
  } catch (err) {
    return {
      url,
      title: "",
      text: "",
      error: errorMessage(err),
    };
  } finally {
    await page.close();
  }
}

export async function fetchPagesWithPlaywright(
  urls: string[],
  maxUrls: number = DEFAULT_MAX_URLS_PER_TURN,
): Promise<FetchedPage[]> {
  const limited = urls.slice(0, maxUrls);
  if (limited.length === 0) return [];

  const browserInstance = await ensureBrowser();
  const context = await browserInstance.newContext({
    userAgent: USER_AGENT,
  });

  try {
    return await Promise.all(limited.map((url) => fetchOnePage(context, url)));
  } finally {
    await context.close();
  }
}
