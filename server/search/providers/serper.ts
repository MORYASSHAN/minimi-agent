import { fetchJson, withSiteFilter, type SearchHit, type SearchProvider, type SearchRequest } from '../types.js';

interface SerperResponse {
  organic?: Array<{ title: string; link: string; snippet?: string; date?: string }>;
}

/** Serper proxies Google results. Date window uses Google's custom-date-range `tbs`. */
export class SerperProvider implements SearchProvider {
  readonly name = 'serper';
  readonly returnsPageContent = false;

  constructor(private readonly apiKey: string) {}

  async search(req: SearchRequest, signal: AbortSignal): Promise<SearchHit[]> {
    const body: Record<string, unknown> = { q: withSiteFilter(req.query, req.domains), num: req.maxResults };
    if (req.since) {
      const [y, m, d] = req.since.split('-');
      const now = new Date();
      body.tbs = `cdr:1,cd_min:${Number(m)}/${Number(d)}/${y},cd_max:${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
    }
    const data = await fetchJson<SerperResponse>(this.name, 'https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': this.apiKey },
      body: JSON.stringify(body),
      signal,
    });
    return (data.organic ?? []).map((r) => ({
      url: r.link,
      title: r.title,
      snippet: r.snippet ?? '',
      publishedAt: r.date,
    }));
  }
}
