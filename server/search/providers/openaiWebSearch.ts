import OpenAI from 'openai';
import { collapseWhitespace } from '../../lib/text.js';
import type { SearchHit, SearchProvider, SearchRequest } from '../types.js';

const INSTRUCTIONS =
  'You are a search backend, not a chat assistant. Search the web for the query and report the most relevant facts as short ' +
  'bullet points, each with exact names, numbers and dates, citing the page each fact came from. No preamble, no advice.';

// Last-resort provider: OpenAI's hosted search, which needs no extra key.
// Slower and pricier per query than Tavily.
export class OpenAIWebSearchProvider implements SearchProvider {
  readonly name = 'openai';
  readonly returnsPageContent = true;
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 });
  }

  async search(req: SearchRequest, signal: AbortSignal): Promise<SearchHit[]> {
    const res = await this.client.responses.create(
      {
        model: this.model,
        instructions: INSTRUCTIONS,
        input: req.since ? `${req.query}\n(Only use pages published on or after ${req.since}.)` : req.query,
        tools: [
          {
            type: 'web_search',
            search_context_size: req.depth === 'deep' ? 'medium' : 'low',
            ...(req.domains?.length && { filters: { allowed_domains: req.domains } }),
          },
        ],
        tool_choice: 'required',
        max_output_tokens: req.depth === 'deep' ? 900 : 500,
      },
      { signal },
    );

    const hits = new Map<string, SearchHit>();
    for (const item of res.output) {
      if (item.type !== 'message') continue;
      for (const part of item.content) {
        if (part.type !== 'output_text') continue;
        for (const a of part.annotations) {
          if (a.type !== 'url_citation') continue;
          const fact = citedLine(part.text, a.start_index);
          const existing = hits.get(a.url);
          if (existing) {
            if (fact && !existing.snippet.includes(fact)) existing.snippet = `${existing.snippet} … ${fact}`;
          } else {
            hits.set(a.url, { url: a.url, title: a.title || new URL(a.url).hostname, snippet: fact });
          }
        }
      }
    }
    return [...hits.values()].slice(0, req.maxResults).map((h) => ({ ...h, content: h.snippet }));
  }
}

/** The bullet/sentence a citation belongs to, with markdown links stripped. */
function citedLine(text: string, index: number): string {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const endNl = text.indexOf('\n', index);
  const line = text.slice(start, endNl === -1 ? undefined : endNl);
  return collapseWhitespace(
    line
      .replace(/\(\[[^\]]*\]\([^)]*\)\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^[-*•\d.)\s]+/, ''),
  );
}
