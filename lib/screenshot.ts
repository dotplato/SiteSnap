import { chromium, Browser, Page } from 'playwright';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

export interface ScreenshotOptions {
  jobId: string;
  viewport?: { width: number; height: number };
}

export async function captureScreenshots(urls: string[], options: ScreenshotOptions, onProgress?: (current: number, total: number) => void) {
  const { jobId, viewport = { width: 1440, height: 900 } } = options;
  const tempDir = path.join(os.tmpdir(), 'sitesnap', jobId);
  
  await fs.mkdir(tempDir, { recursive: true });

  const browser = await chromium.launch();
  const results: string[] = [];

  try {
    const context = await browser.newContext({
      viewport,
    });

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      if (onProgress) onProgress(i + 1, urls.length);

      const page = await context.newPage();
      try {
        // 20 second timeout as requested
        await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
        
        // Generate filename based on path
        const parsedUrl = new URL(url);
        let filename = parsedUrl.pathname.replace(/\//g, '-').replace(/^-/, '') || 'home';
        if (!filename.endsWith('.png')) filename += '.png';
        
        const filePath = path.join(tempDir, filename);
        await page.screenshot({ path: filePath, fullPage: true });
        results.push(filePath);
      } catch (e) {
        console.error(`Failed to capture screenshot for ${url}:`, e);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  return { tempDir, filePaths: results };
}
