import type { Source } from '../../shared/types.js';
import { domainOf, normalizeUrl } from '../lib/text.js';
import type { SearchHit } from '../search/types.js';

// Citation numbers are per thread, so a page keeps the same [n] across answers.
export class SourceRegistry {
  private readonly byUrl = new Map<string, Source>();
  private readonly byId = new Map<number, Source>();
  private readonly touched = new Set<number>();
  private nextId = 1;

  constructor(prior: Source[] = []) {
    for (const s of prior) {
      this.byUrl.set(normalizeUrl(s.url), s);
      this.byId.set(s.id, s);
      this.nextId = Math.max(this.nextId, s.id + 1);
    }
  }

  /** Returns the source and whether it is new to this thread. */
  register(hit: SearchHit): { source: Source; isNew: boolean } {
    const key = normalizeUrl(hit.url);
    const existing = this.byUrl.get(key);
    if (existing) {
      this.touched.add(existing.id);
      return { source: existing, isNew: false };
    }
    const source: Source = {
      id: this.nextId++,
      url: hit.url,
      title: hit.title || domainOf(hit.url),
      domain: domainOf(hit.url),
      snippet: hit.snippet.slice(0, 300),
      ...(hit.publishedAt && { publishedAt: hit.publishedAt }),
    };
    this.byUrl.set(key, source);
    this.byId.set(source.id, source);
    this.touched.add(source.id);
    return { source, isNew: true };
  }

  get(id: number): Source | undefined {
    return this.byId.get(id);
  }

  /** Sources to store with this turn: everything found this turn plus older ones it cites. */
  forTurn(citedIds: number[]): Source[] {
    const ids = new Set([...this.touched, ...citedIds.filter((id) => this.byId.has(id))]);
    return [...ids].sort((a, b) => a - b).map((id) => this.byId.get(id)!);
  }
}
