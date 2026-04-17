import { NextRequest, NextResponse } from 'next/server';
import { crawl } from '@/lib/crawler';
import { captureScreenshots } from '@/lib/screenshot';
import { createZip } from '@/lib/zip';
import fs from 'fs/promises';

export const maxDuration = 300; // 5 minutes for long-running scans

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendProgress = (data: any) => {
          controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
        };

        try {
          sendProgress({ status: 'progress', message: 'Fetching pages...' });
          const urls = await crawl(url);
          
          if (urls.length === 0) {
            sendProgress({ status: 'error', message: 'No pages found or invalid URL' });
            controller.close();
            return;
          }

          sendProgress({ status: 'progress', message: `Found ${urls.length} pages` });

          const jobId = Math.random().toString(36).substring(7);
          const { tempDir } = await captureScreenshots(urls, { jobId }, (current, total) => {
            sendProgress({ 
              status: 'progress', 
              message: `Capturing screenshot ${current} of ${total}`,
              current,
              total 
            });
          });

          sendProgress({ status: 'progress', message: 'Creating ZIP...' });
          const zipBuffer = await createZip(tempDir);

          sendProgress({ 
            status: 'complete', 
            message: 'Download Ready', 
            zip: zipBuffer.toString('base64'),
            filename: `sitesnap-${new URL(url).hostname}.zip`
          });

          // Cleanup
          await fs.rm(tempDir, { recursive: true, force: true }).catch(console.error);
        } catch (error: any) {
          sendProgress({ status: 'error', message: error.message || 'An error occurred during scan' });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
