import { describe, expect, it } from 'vitest';
import { SourceRegistry } from '../server/agent/sourceRegistry.js';
import { parseWebSearchArgs, renderResults } from '../server/agent/webSearchTool.js';
import { silentLogger } from '../server/lib/logger.js';
import { citedIds, normalizeUrl } from '../server/lib/text.js';
import { htmlToText, isPublicHttpUrl, selectPassages } from '../server/search/pageReader.js';
import { SearchService } from '../server/search/searchService.js';
import { FakeProvider } from './fakes.js';

const signal = new AbortController().signal;
const hit = (url: string, title = url) => ({ url, title, snippet: `about ${title}` });

describe('SearchService', () => {
  it('falls back to the next provider when one fails', async () => {
    const broken = new FakeProvider('a', () => Promise.reject(new Error('HTTP 500')));
    const backup = new FakeProvider('b', () => [hit('https://x.com/1')]);
    const svc = new SearchService([broken, backup], silentLogger);
    const out = await svc.search({ queries: ['q'], depth: 'fast' }, signal);
    expect(out.hits.map((h) => h.url)).toEqual(['https://x.com/1']);
    expect(out.provider).toBe('b');
  });

  it('interleaves queries and drops duplicate pages', async () => {
    const p = new FakeProvider('a', (req) =>
      req.query === 'one' ? [hit('https://a.com/'), hit('https://b.com')] : [hit('https://www.a.com?utm_source=x'), hit('https://c.com')],
    );
    const out = await new SearchService([p], silentLogger).search({ queries: ['one', 'two'], depth: 'fast' }, signal);
    expect(out.hits.map((h) => h.url)).toEqual(['https://a.com/', 'https://b.com', 'https://c.com']);
  });

  it('caches identical queries', async () => {
    const p = new FakeProvider('a', () => [hit('https://a.com')]);
    const svc = new SearchService([p], silentLogger);
    await svc.search({ queries: ['same'], depth: 'fast' }, signal);
    await svc.search({ queries: ['Same'], depth: 'fast' }, signal);
    expect(p.calls).toHaveLength(1);
  });

  it('reports failed queries instead of throwing', async () => {
    const p = new FakeProvider('a', () => Promise.reject(new Error('down')));
    const out = await new SearchService([p], silentLogger).search({ queries: ['q'], depth: 'fast' }, signal);
    expect(out.failedQueries).toEqual(['q']);
  });
});

describe('SourceRegistry', () => {
  it('keeps numbers stable across a thread and continues after prior sources', () => {
    const prior = [{ id: 4, url: 'https://neon.com/pricing', title: 'Neon', domain: 'neon.com', snippet: '' }];
    const reg = new SourceRegistry(prior);
    expect(reg.register(hit('https://www.neon.com/pricing/')).source.id).toBe(4);
    expect(reg.register(hit('https://supabase.com/pricing')).source.id).toBe(5);
    expect(reg.forTurn([4, 5, 99]).map((s) => s.id)).toEqual([4, 5]);
  });
});

describe('web_search tool', () => {
  it('accepts a single "query" string and cleans arguments', () => {
    expect(parseWebSearchArgs('{"query":"neon pricing","since":"bad","domains":["https://neon.com/x"]}', 6)).toEqual({
      queries: ['neon pricing'],
      depth: 'fast',
      since: undefined,
      domains: ['neon.com'],
    });
    expect(parseWebSearchArgs('not json', 6)).toHaveProperty('error');
  });

  it('renders numbered results and suggests a next step when empty', () => {
    const reg = new SourceRegistry();
    const args = { queries: ['q'], depth: 'fast' as const, since: '2026-11-03' };
    const ok = renderResults(args, { hits: [{ ...hit('https://a.com'), query: 'q' }], provider: 'a', failedQueries: [], ms: 1 }, reg, '2026-11-10');
    expect(ok.text).toContain('[1] https://a.com (a.com)');
    const empty = renderResults(args, { hits: [], provider: 'a', failedQueries: [], ms: 1 }, reg, '2026-11-10');
    expect(empty.text).toContain('may simply mean nothing changed');
  });
});

describe('text helpers', () => {
  it('extracts citation ids, ignoring markdown links', () => {
    expect(citedIds('Price is $19 [3]. Also [1, 2] and [see](http://x) [5](http://y)')).toEqual([1, 2, 3]);
  });
  it('normalizes URLs for de-duplication', () => {
    expect(normalizeUrl('http://www.Example.com/a/?utm_source=x#top')).toBe('https://example.com/a');
  });
  it('pulls price passages out of HTML', () => {
    const html = '<nav>menu</nav><p>Welcome to our site</p><p>Launch plan: $19 per month, 10 GB storage</p><script>x()</script>';
    const text = htmlToText(html);
    expect(text).not.toContain('menu');
    expect(selectPassages(text, 'launch plan pricing')).toContain('$19 per month');
  });
  it('blocks private network URLs', () => {
    expect(isPublicHttpUrl('https://neon.com')).toBe(true);
    expect(isPublicHttpUrl('http://169.254.169.254/latest')).toBe(false);
    expect(isPublicHttpUrl('http://localhost:3000')).toBe(false);
  });
});
