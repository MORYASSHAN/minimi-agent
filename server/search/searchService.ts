import type { Logger } from '../lib/logger.js';
import { normalizeUrl } from '../lib/text.js';
import { TtlCache } from '../lib/ttlCache.js';
import { readPage } from './pageReader.js';
import type { SearchHit, SearchProvider } from './types.js';

export interface SearchInput {
  queries: string[];
  since?: string;
  domains?: string[];
  depth: 'fast' | 'deep';
}

export interface RankedHit extends SearchHit {
  query: string;
}

export interface SearchOutcome {
  hits: RankedHit[];
  provider: string;
  failedQueries: string[];
  ms: number;
}

const PROVIDER_COOLDOWN_MS = 60_000;
const PAGES_TO_READ = 4;

/**
 * Runs all queries of one tool call in parallel, each through a provider fallback chain,
 * then merges, de-duplicates and (for deep searches) enriches results with page text.
 */
export class SearchService {
  private readonly cache = new TtlCache<SearchHit[]>(500, 10 * 60_000);
  private readonly cooldownUntil = new Map<string, number>();

  constructor(
    private readonly providers: SearchProvider[],
    private readonly logger: Logger,
  ) {
    if (!providers.length) throw new Error('SearchService needs at least one provider');
  }

  get providerNames(): string[] {
    return this.providers.map((p) => p.name);
  }

  async search(input: SearchInput, signal: AbortSignal): Promise<SearchOutcome> {
    const started = performance.now();
    const maxResults = input.depth === 'deep' ? 5 : 6;
    const settled = await Promise.all(
      input.queries.map((query) =>
        this.searchOne(query, input, maxResults, signal)
          .then((r) => ({ query, ...r, ok: true as const }))
          .catch((err: unknown) => {
            if (signal.aborted) throw err;
            this.logger.warn('search failed on all providers', { query, error: String(err) });
            return { query, hits: [] as SearchHit[], provider: 'none', needsPages: false, ok: false as const };
          }),
      ),
    );

    // Interleave results (1st of each query, then 2nd of each...) so every query is represented,
    // and drop duplicates of the same page found by several queries.
    const seen = new Set<string>();
    const merged: RankedHit[] = [];
    const longest = Math.max(0, ...settled.map((s) => s.hits.length));
    for (let rank = 0; rank < longest; rank++) {
      for (const s of settled) {
        const hit = s.hits[rank];
        if (!hit) continue;
        const key = normalizeUrl(hit.url);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({ ...hit, query: s.query });
      }
    }

    if (input.depth === 'deep' && settled.some((s) => s.needsPages)) await this.readTopPages(merged, signal);

    return {
      hits: merged,
      provider: [...new Set(settled.filter((s) => s.ok).map((s) => s.provider))].join('+') || 'none',
      failedQueries: settled.filter((s) => !s.ok).map((s) => s.query),
      ms: Math.round(performance.now() - started),
    };
  }

  private async searchOne(query: string, input: SearchInput, maxResults: number, signal: AbortSignal) {
    const key = JSON.stringify([query.toLowerCase(), input.since, input.domains, input.depth]);
    const errors: string[] = [];
    const usable = this.providers.filter((p) => (this.cooldownUntil.get(p.name) ?? 0) < Date.now());
    // If every provider is cooling down, try them anyway rather than fail outright.
    for (const provider of usable.length ? usable : this.providers) {
      const cached = this.cache.get(`${provider.name}:${key}`);
      if (cached) return { hits: cached, provider: provider.name, needsPages: !provider.returnsPageContent };
      try {
        const timeout = AbortSignal.timeout(input.depth === 'deep' ? 15_000 : 8_000);
        const hits = await provider.search(
          { query, since: input.since, domains: input.domains, depth: input.depth, maxResults },
          AbortSignal.any([signal, timeout]),
        );
        this.cache.set(`${provider.name}:${key}`, hits);
        this.cooldownUntil.delete(provider.name);
        return { hits, provider: provider.name, needsPages: !provider.returnsPageContent };
      } catch (err) {
        if (signal.aborted) throw err;
        errors.push(String(err));
        this.cooldownUntil.set(provider.name, Date.now() + PROVIDER_COOLDOWN_MS);
        this.logger.warn('search provider failed, falling back', { provider: provider.name, error: String(err) });
      }
    }
    throw new Error(errors.join(' | ') || 'no providers available');
  }

  /** Snippet-only providers: fetch the top pages ourselves and keep query-relevant passages. */
  private async readTopPages(hits: RankedHit[], signal: AbortSignal): Promise<void> {
    const targets = hits.filter((h) => !h.content).slice(0, PAGES_TO_READ);
    await Promise.all(
      targets.map(async (hit) => {
        try {
          const text = await readPage(hit.url, hit.query, AbortSignal.any([signal, AbortSignal.timeout(6_000)]));
          if (text) hit.content = text;
        } catch {
          // A page we can't read just keeps its snippet.
        }
      }),
    );
  }
}
