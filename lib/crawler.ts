import { URL } from 'url';

export interface CrawlResult {
  url: string;
  depth: number;
}

export async function crawl(startUrl: string, maxPages = 50, maxDepth = 3): Promise<string[]> {
  const normalizedStartUrl = normalizeUrl(startUrl);
  if (!normalizedStartUrl) return [];

  const domain = new URL(normalizedStartUrl).hostname;
  const visited = new Set<string>();
  const queue: CrawlResult[] = [{ url: normalizedStartUrl, depth: 0 }];
  const results: string[] = [];

  // 1. Try Sitemap first
  try {
    const sitemapUrls = await tryFetchSitemap(normalizedStartUrl);
    if (sitemapUrls.length > 0) {
      return sitemapUrls.slice(0, maxPages);
    }
  } catch (e) {
    console.error('Sitemap fetch failed, falling back to crawl', e);
  }

  // 2. Recursive Crawl
  while (queue.length > 0 && results.length < maxPages) {
    const { url, depth } = queue.shift()!;

    if (visited.has(url)) continue;
    visited.add(url);
    results.push(url);

    if (depth >= maxDepth) continue;

    try {
      const links = await fetchLinks(url, domain);
      for (const link of links) {
        if (!visited.has(link) && !queue.some(q => q.url === link)) {
          queue.push({ url: link, depth: depth + 1 });
        }
      }
    } catch (e) {
      console.error(`Failed to fetch links from ${url}`, e);
    }
  }

  return results.slice(0, maxPages);
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

async function tryFetchSitemap(baseUrl: string): Promise<string[]> {
  const sitemapUrls = [`${baseUrl}/sitemap.xml`, `${baseUrl}/sitemap_index.xml`];
  for (const url of sitemapUrls) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const text = await resp.text();
        // Simple regex to extract <loc>...</loc>
        const locs = text.match(/<loc>(.*?)<\/loc>/g);
        if (locs) {
          return locs.map(l => l.replace(/<\/?loc>/g, '').trim())
                     .filter(l => l.startsWith(baseUrl));
        }
      }
    } catch (e) {}
  }
  return [];
}

async function fetchLinks(url: string, domain: string): Promise<string[]> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return [];
    const html = await resp.text();
    
    // Extract hrefs
    const hrefRegex = /href="([^"]*)"/g;
    const links = new Set<string>();
    let match;
    
    while ((match = hrefRegex.exec(html)) !== null) {
      let href = match[1];
      
      // Filter out mailto, tel, javascript, etc.
      if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
      
      try {
        const absoluteUrl = new URL(href, url);
        // Only internal links
        if (absoluteUrl.hostname === domain) {
          absoluteUrl.hash = '';
          links.add(absoluteUrl.toString());
        }
      } catch (e) {}
    }
    
    return Array.from(links);
  } catch (e) {
    return [];
  }
}
