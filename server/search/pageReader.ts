import { collapseWhitespace, topicTerms } from '../lib/text.js';

const MAX_BYTES = 1_500_000;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Cheap, dependency-free HTML → text. Good enough to find prices, limits and dates on a page. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|br|td|th)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .split('\n')
    .map(collapseWhitespace)
    .filter((l) => l.length > 2)
    .join('\n');
}

/**
 * Query-focused extraction: split the page into ~500 char windows, score each by
 * query-term overlap (+ a bonus for numbers/currency, which is what "deep" searches are
 * usually after), and keep the best windows in page order.
 */
export function selectPassages(text: string, query: string, budget = 2_400): string {
  const terms = topicTerms(query);
  const lines = text.split('\n');
  const windows: { i: number; text: string; score: number }[] = [];
  let buf = '';
  for (const line of lines) {
    buf += (buf ? ' ' : '') + line;
    if (buf.length >= 500) {
      windows.push({ i: windows.length, text: buf, score: 0 });
      buf = '';
    }
  }
  if (buf) windows.push({ i: windows.length, text: buf, score: 0 });

  for (const w of windows) {
    const lower = w.text.toLowerCase();
    for (const t of terms) if (lower.includes(t)) w.score += 2;
    if (/[$€£₹]\s?\d|\d+(\.\d+)?\s?(\/|per)\s?(mo|month|user|seat|year|gb|hour)/i.test(w.text)) w.score += 1.5;
    if (/\b20\d\d\b/.test(w.text)) w.score += 0.5;
  }
  const picked: typeof windows = [];
  let used = 0;
  for (const w of [...windows].sort((a, b) => b.score - a.score)) {
    if (w.score <= 0 && picked.length) break;
    if (used + w.text.length > budget) continue;
    picked.push(w);
    used += w.text.length;
  }
  return picked
    .sort((a, b) => a.i - b.i)
    .map((w) => w.text)
    .join(' … ');
}

/** URLs come from search results, so refuse anything that points at local/private networks (basic SSRF guard). */
export function isPublicHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return false;
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false;
    if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return false;
    return true;
  } catch {
    return false;
  }
}

export async function readPage(url: string, query: string, signal: AbortSignal): Promise<string | undefined> {
  if (!isPublicHttpUrl(url)) return undefined;
  const res = await fetch(url, {
    signal,
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; minimi-search-agent/1.0)', Accept: 'text/html,*/*;q=0.5' },
  });
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html')) return undefined;
  const html = (await res.text()).slice(0, MAX_BYTES);
  const passages = selectPassages(htmlToText(html), query);
  return passages || undefined;
}
