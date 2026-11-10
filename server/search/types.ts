export interface SearchRequest {
  query: string;
  /** YYYY-MM-DD: only pages published on/after this date. */
  since?: string;
  domains?: string[];
  depth: 'fast' | 'deep';
  maxResults: number;
}

export interface SearchHit {
  url: string;
  title: string;
  snippet: string;
  /** Longer query-relevant page text, when the provider (or our page reader) has it. */
  content?: string;
  publishedAt?: string;
}

export interface SearchProvider {
  readonly name: string;
  /** True if hits already carry page text for deep searches (no page fetch needed). */
  readonly returnsPageContent: boolean;
  search(req: SearchRequest, signal: AbortSignal): Promise<SearchHit[]>;
}

export class SearchProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number | undefined,
    message: string,
  ) {
    super(`${provider}: ${message}`);
    this.name = 'SearchProviderError';
  }
}

export async function fetchJson<T>(provider: string, url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new SearchProviderError(provider, res.status, `HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** Providers without a native domain filter get `site:` operators appended to the query. */
export function withSiteFilter(query: string, domains?: string[]): string {
  if (!domains?.length) return query;
  const sites = domains.map((d) => `site:${d}`).join(' OR ');
  return `${query} ${domains.length > 1 ? `(${sites})` : sites}`;
}
