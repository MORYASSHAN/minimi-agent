import { fetchJson, withSiteFilter, type SearchHit, type SearchProvider, type SearchRequest } from '../types.js';

interface BraveResponse {
  web?: {
    results: Array<{ title: string; url: string; description?: string; extra_snippets?: string[]; page_age?: string }>;
  };
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, '');

export class BraveProvider implements SearchProvider {
  readonly name = 'brave';
  readonly returnsPageContent = false;

  constructor(private readonly apiKey: string) {}

  async search(req: SearchRequest, signal: AbortSignal): Promise<SearchHit[]> {
    const params = new URLSearchParams({
      q: withSiteFilter(req.query, req.domains),
      count: String(Math.min(req.maxResults, 20)),
      extra_snippets: 'true',
    });
    if (req.since) params.set('freshness', `${req.since}to${new Date().toISOString().slice(0, 10)}`);

    const data = await fetchJson<BraveResponse>(this.name, `https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': this.apiKey },
      signal,
    });
    return (data.web?.results ?? []).map((r) => ({
      url: r.url,
      title: stripTags(r.title),
      snippet: stripTags([r.description ?? '', ...(r.extra_snippets ?? [])].join(' … ')).slice(0, 600),
      publishedAt: r.page_age?.slice(0, 10),
    }));
  }
}
