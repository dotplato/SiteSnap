import { URL } from 'url';
import { isRenderablePageUrl } from '@/lib/page-url';

export interface CrawlResult {
  url: string;
  depth: number;
}

/**
 * Collects URLs from sitemap (when present) and in-site link crawl, merged and deduped,
 * so coverage is not limited to sitemap-only and non-HTML URLs are excluded.
 */
export async function crawl(startUrl: string, maxPages = 200, maxDepth = 5): Promise<string[]> {
  const normalizedStartUrl = normalizeUrl(startUrl);
  if (!normalizedStartUrl) return [];

  const domain = new URL(normalizedStartUrl).hostname;

  let sitemapUrls: string[] = [];
  try {
    sitemapUrls = await tryFetchSitemap(normalizedStartUrl, maxPages);
  } catch (e) {
    console.error('Sitemap fetch failed', e);
  }

  const bfsUrls = await crawlBfs(normalizedStartUrl, domain, maxPages, maxDepth);

  return mergeUrlLists(normalizedStartUrl, sitemapUrls, bfsUrls, maxPages);
}

/** Breadth-first crawl of same-host links (HTML pages only). */
async function crawlBfs(
  normalizedStartUrl: string,
  domain: string,
  maxPages: number,
  maxDepth: number,
): Promise<string[]> {
  const visited = new Set<string>();
  const results: string[] = [];
  const queue: CrawlResult[] = [{ url: normalizedStartUrl, depth: 0 }];

  while (queue.length > 0 && results.length < maxPages) {
    const { url, depth } = queue.shift()!;

    if (visited.has(url)) continue;
    if (!isRenderablePageUrl(url)) continue;
    visited.add(url);
    results.push(url);
    console.log(`Crawl: ${results.length}/${maxPages} - ${url}`);

    if (depth >= maxDepth) continue;

    try {
      const links = await fetchLinks(url, domain);
      for (const link of links) {
        if (!isRenderablePageUrl(link)) continue;
        if (!visited.has(link) && !queue.some((q) => q.url === link)) {
          queue.push({ url: link, depth: depth + 1 });
        }
      }
    } catch (e) {
      console.error(`Failed to fetch links from ${url}`, e);
    }
  }

  return results;
}

function mergeUrlLists(start: string, sitemap: string[], bfs: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const take = (u: string) => {
    if (!isRenderablePageUrl(u)) return;
    if (!sameHostname(start, u)) return;
    if (seen.has(u)) return;
    if (out.length >= max) return;
    seen.add(u);
    out.push(u);
  };

  take(start);
  for (const u of sitemap) take(u);
  for (const u of bfs) take(u);

  return ensureStartUrlFirst(out, start).slice(0, max);
}

function sameHostname(a: string, b: string): boolean {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
}

/** Keep the URL the user entered first when it is in the list. */
function ensureStartUrlFirst(urls: string[], startUrl: string): string[] {
  const rest = urls.filter((u) => u !== startUrl);
  return urls.includes(startUrl) ? [startUrl, ...rest] : urls;
}

function normalizeUrl(url: string): string | null {
  try {
    let u = url.trim();
    if (!u.startsWith('http')) {
      u = 'https://' + u;
    }
    const parsed = new URL(u);
    parsed.hash = '';
    // Remove trailing slash for consistency
    let res = parsed.toString();
    if (res.endsWith('/') && parsed.pathname === '/') {
      res = res.slice(0, -1);
    }
    return res;
  } catch (e) {
    return null;
  }
}

function decodeXmlLoc(raw: string): string {
  return raw
    .trim()
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function extractLocs(xml: string): string[] {
  const matches = xml.match(/<loc>([\s\S]*?)<\/loc>/gi);
  if (!matches) return [];
  return matches.map((m) => decodeXmlLoc(m.replace(/<\/?loc>/gi, '')));
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

/**
 * WordPress and many CMS sites expose a sitemap *index* whose <loc> entries are
 * child *.xml* sitemaps, not HTML pages. Taking screenshots of those URLs shows
 * raw XML (looks like "source"). We follow index → child urlsets → real page URLs.
 */
async function tryFetchSitemap(baseUrl: string, maxPages: number): Promise<string[]> {
  const seenSitemaps = new Set<string>();
  const seenPages = new Set<string>();
  const pageUrls: string[] = [];
  const queue: string[] = [`${baseUrl}/sitemap.xml`, `${baseUrl}/sitemap_index.xml`];
  let budget = 60;

  const pushPage = (loc: string) => {
    if (!loc.startsWith('http')) return;
    if (!sameHostname(baseUrl, loc)) return;
    if (!isRenderablePageUrl(loc)) return;
    // Child sitemap URLs are XML; real pages should not use .xml (edge cases are rare)
    if (loc.split('?')[0].toLowerCase().endsWith('.xml')) return;
    if (seenPages.has(loc)) return;
    seenPages.add(loc);
    pageUrls.push(loc);
  };

  while (queue.length > 0 && pageUrls.length < maxPages && budget-- > 0) {
    const smUrl = queue.shift()!;
    if (seenSitemaps.has(smUrl)) continue;
    seenSitemaps.add(smUrl);

    let text: string;
    try {
      const resp = await fetch(smUrl, {
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
      });
      if (!resp.ok) continue;
      text = await resp.text();
    } catch {
      continue;
    }

    const locs = extractLocs(text);
    if (locs.length === 0) continue;

    if (isSitemapIndex(text)) {
      for (const loc of locs) {
        if (!loc.startsWith('http')) continue;
        if (!sameHostname(baseUrl, loc)) continue;
        if (loc.split('?')[0].toLowerCase().endsWith('.xml')) {
          queue.push(loc);
        }
      }
    } else {
      for (const loc of locs) {
        pushPage(loc);
        if (pageUrls.length >= maxPages) break;
      }
    }
  }

  return pageUrls;
}

async function fetchLinks(url: string, domain: string): Promise<string[]> {
  try {
    const resp = await fetch(url, { 
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    if (!resp.ok) return [];
    const html = await resp.text();
    
    // Extract hrefs
    const hrefRegex = /href="([^"]*)"/g;
    const links = new Set<string>();
    let match;
    
    while ((match = hrefRegex.exec(html)) !== null) {
      const href = match[1];
      
      // Filter out mailto, tel, javascript, etc.
      if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
      
      try {
        const absoluteUrl = new URL(href, url);
        // Only internal links
        if (absoluteUrl.hostname === domain) {
          absoluteUrl.hash = '';
          const hrefUrl = absoluteUrl.toString();
          if (!isRenderablePageUrl(hrefUrl)) continue;
          links.add(hrefUrl);
        }
      } catch (e) {}
    }
    
    return Array.from(links);
  } catch (e) {
    return [];
  }
}
