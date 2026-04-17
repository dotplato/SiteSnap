/**
 * URLs we should never screenshot (feeds, APIs, static assets, raw data).
 * Keeps ZIPs to real browser pages instead of XML/JSON/source-looking responses.
 */

const NON_PAGE_EXTENSIONS = new Set([
  'xml',
  'json',
  'rss',
  'atom',
  'txt',
  'csv',
  'map',
  'js',
  'mjs',
  'cjs',
  'css',
  'ico',
  'svg',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'bmp',
  'woff',
  'woff2',
  'ttf',
  'eot',
  'otf',
  'pdf',
  'zip',
  'gz',
  'tar',
  'wasm',
  'mp4',
  'webm',
  'mp3',
  'ogg',
  'm4a',
  'xsl',
  // Source / config (e.g. HTTrack mirrors expose .h, .c in the browser as plain text)
  'h',
  'hh',
  'hpp',
  'hxx',
  'c',
  'cc',
  'cpp',
  'cxx',
  'idc',
  'm',
  'mm',
  'java',
  'kt',
  'kts',
  'scala',
  'py',
  'pyw',
  'pyi',
  'rb',
  'erb',
  'go',
  'rs',
  'rlib',
  'pl',
  'pm',
  'swift',
  'ts',
  'tsx',
  'jsx',
  'vue',
  'svelte',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'psm1',
  'bat',
  'cmd',
  'sql',
  'sqlite',
  'ini',
  'cfg',
  'conf',
  'plist',
  'cmake',
  'make',
  'mak',
  'diff',
  'patch',
  'log',
  'lock',
  'gradle',
  'properties',
  'toml',
  'yaml',
  'yml',
  'env',
  'md',
  'markdown',
  'rst',
  'adoc',
  'asciidoc',
  'pod',
  'r',
  'lua',
  'vim',
  'el',
  'clj',
  'cljs',
  'ex',
  'exs',
  'fs',
  'fsi',
  'fsx',
  'vb',
  'cs',
  'asm',
  's',
  'd',
  'zig',
  'nim',
  'cr',
  'dart',
  'pas',
  'pp',
  'lpr',
  'coffee',
  'less',
  'sass',
  'scss',
  'styl',
  'pug',
  'jade',
  'hbs',
  'ejs',
  'njk',
  'liquid',
]);

function pathnameExtension(pathname: string): string {
  const base = pathname.split('/').pop() ?? '';
  const lower = base.toLowerCase();
  if (!lower.includes('.')) return '';
  return lower.split('.').pop() ?? '';
}

/** True if this URL is likely a normal HTML document in a browser (not feeds, assets, APIs). */
export function isRenderablePageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

    const path = u.pathname.toLowerCase();

    if (path.includes('/wp-json/')) return false;

    // HTTrack / offline mirror bundles (avoid crawling mirror metadata + tool sources)
    if (path.includes('/hts-cache/') || path.includes('/hts-nohurry')) return false;

    const ext = pathnameExtension(path);
    if (ext && NON_PAGE_EXTENSIONS.has(ext)) return false;

    // WordPress / common feed patterns (avoid matching arbitrary paths like /my-feedbacks/)
    if (/(^|\/)feed\/?$/i.test(path)) return false;
    if (/(^|\/)feed\/rss\/?$/i.test(path)) return false;
    if (/(^|\/)comments\/feed\/?$/i.test(path)) return false;
    if (/(^|\/)rss\/?$/i.test(path)) return false;
    if (/(^|\/)atom\/?$/i.test(path)) return false;

    const fmt = u.searchParams.get('format')?.toLowerCase();
    if (fmt === 'json' || fmt === 'xml' || fmt === 'rss' || fmt === 'atom') return false;

    return true;
  } catch {
    return false;
  }
}

const HTMLISH = /^(text\/html|application\/xhtml\+xml)/i;

/** Response header must explicitly look like HTML; unknown/missing is not assumed HTML. */
export function isHtmlContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const main = contentType.split(';')[0].trim();
  return HTMLISH.test(main);
}

/** What the browser actually rendered (rejects text/plain source files, JSON viewers, etc.). */
export function isHtmlDocumentContentType(docType: string): boolean {
  const t = docType.trim().toLowerCase();
  return t === 'text/html' || t === 'application/xhtml+xml';
}
