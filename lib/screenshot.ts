import { chromium, Browser, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { isHtmlDocumentContentType, isRenderablePageUrl } from '@/lib/page-url';

export interface ScreenshotOptions {
  jobId: string;
  viewport?: { width: number; height: number };
}

/** Scroll the document so lazy-loaded images render; capped so broken/huge layouts cannot hang. */
async function scrollForLazyContent(page: Page) {
  await page.evaluate(async () => {
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const root = document.scrollingElement ?? document.documentElement;
    const step = Math.max(400, Math.floor(window.innerHeight * 0.9));
    let y = 0;
    const rawH = root.scrollHeight;
    const max = Math.min(Number.isFinite(rawH) ? rawH + 400 : 8000, 120_000);
    const MAX_STEPS = 200;
    for (let stepIdx = 0; stepIdx < MAX_STEPS && y < max; stepIdx++) {
      window.scrollTo(0, y);
      await delay(60);
      y += step;
    }
    window.scrollTo(0, 0);
    await delay(120);
  });
}

async function createBrowser() {
  console.log('[Playwright] Launching browser...');
  return await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote'
    ],
  });
}

export async function captureScreenshots(urls: string[], options: ScreenshotOptions, onProgress?: (current: number, total: number) => void) {
  const { jobId, viewport = { width: 1440, height: 900 } } = options;
  const tempDir = path.join(os.tmpdir(), 'sitesnap', jobId);
  
  console.log(`[Playwright] Job ${jobId} started. Target dir: ${tempDir}`);
  await fs.mkdir(tempDir, { recursive: true });

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  const results: string[] = [];

  try {
    browser = await createBrowser();
    context = await browser.newContext({ 
      viewport,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    });

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`[Playwright] [${i+1}/${urls.length}] Processing URL: ${url}`);
      
      // Robust check for browser health
      if (!browser || !browser.isConnected()) {
        console.warn('[Playwright] Browser lost connection, re-launching...');
        if (browser) await browser.close().catch(() => {});
        browser = await createBrowser();
        context = await browser.newContext({ viewport });
      }

      const page = await context.newPage();
      try {
        page.setDefaultTimeout(30000);

        if (!isRenderablePageUrl(url)) {
          console.warn(`[Playwright] Skipping non-page URL: ${url}`);
          continue;
        }

        if (onProgress) onProgress(i + 1, urls.length);
        
        console.log(`[Playwright] Navigating to: ${url}`);
        // `load` often never fires on marketing/SPA sites (analytics, media, open sockets).
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        
        if (!response) {
          throw new Error(`No response from ${url}`);
        }
        
        const finalUrl = page.url();
        console.log(`[Playwright] Navigation complete. Final URL: ${finalUrl} (Status: ${response.status()})`);
        
        if (response.status() >= 400) {
          throw new Error(`HTTP Error ${response.status()} for ${url}`);
        }

        // Best-effort: richer paint when `load` does finish, without blocking forever.
        await page.waitForLoadState('load', { timeout: 12_000 }).catch(() => {});

        const docType = await page.evaluate(() => document.contentType).catch(() => '');
        if (!isHtmlDocumentContentType(docType)) {
          console.warn(
            `[Playwright] Skipping non-HTML document (document.contentType=${docType || 'n/a'}) for ${url}`,
          );
          continue;
        }
        await scrollForLazyContent(page);
        // Let fonts / late images settle without relying on networkidle
        await page.evaluate(() => new Promise<void>((r) => setTimeout(r, 600)));

        const parsedUrl = new URL(url);
        const host = parsedUrl.hostname.replace(/[^\w.-]+/g, '_');
        let slug = parsedUrl.pathname.replace(/\//g, '-').replace(/^-+|-+$/g, '') || 'home';
        slug = slug.replace(/[<>:"|?*\\]/g, '_');
        if (slug.length > 100) slug = slug.slice(0, 100);
        const filename = `${String(i + 1).padStart(4, '0')}-${host}-${slug}.png`;

        const filePath = path.join(tempDir, filename);
        console.log(`[Playwright] Taking full-page screenshot for ${url} -> ${filePath}`);
        
        await page.screenshot({ path: filePath, fullPage: true });
        
        // Verify file exists and has size
        const stats = await fs.stat(filePath);
        if (stats.size > 0) {
          console.log(`[Playwright] Screenshot saved successfully (${stats.size} bytes)`);
          results.push(filePath);
        } else {
          console.warn(`[Playwright] Screenshot file is empty for ${url}`);
        }
      } catch (e) {
        console.error(`[Playwright] Error capturing screenshot for ${url}:`, e);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    if (browser) {
      console.log('[Playwright] Closing browser...');
      await browser.close().catch(() => {});
    }
  }

  return { tempDir, filePaths: results };
}
