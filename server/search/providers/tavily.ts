import { fetchJson, type SearchHit, type SearchProvider, type SearchRequest } from '../types.js';

interface TavilyResponse {
  results: Array<{ title: string; url: string; content: string; published_date?: string | null }>;
}

/** Tavily is built for LLM agents: it returns query-relevant page chunks, not just snippets. */
export class TavilyProvider implements SearchProvider {
  readonly name = 'tavily';
  readonly returnsPageContent = true;

  constructor(private readonly apiKey: string) {}

  async search(req: SearchRequest, signal: AbortSignal): Promise<SearchHit[]> {
    const body: Record<string, unknown> = {
      query: req.query,
      // 'fast' is Tavily's low-latency tier; 'advanced' returns the best chunks for exact numbers.
      search_depth: req.depth === 'deep' ? 'advanced' : 'fast',
      chunks_per_source: req.depth === 'deep' ? 3 : 1,
      max_results: req.maxResults,
      include_answer: false,
      include_published_date: true,
    };
    if (req.since) body.start_date = req.since;
    if (req.domains?.length) body.include_domains = req.domains;

    const data = await fetchJson<TavilyResponse>(this.name, 'https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
      signal,
    });
    return data.results.map((r) => ({
      url: r.url,
      title: r.title,
      snippet: r.content.slice(0, 400),
      content: req.depth === 'deep' ? r.content : undefined,
      publishedAt: r.published_date ?? undefined,
    }));
  }
}
