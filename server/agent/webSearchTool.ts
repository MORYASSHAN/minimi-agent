import { z } from 'zod';
import type { Source } from '../../shared/types.js';
import { truncate } from '../lib/text.js';
import type { ToolSpec } from '../llm/types.js';
import type { SearchOutcome } from '../search/searchService.js';
import type { SourceRegistry } from './sourceRegistry.js';

export const WEB_SEARCH = 'web_search';

/** The agent's one tool. Several queries per call so one round can cover every entity. */
export function webSearchSpec(maxQueries: number): ToolSpec {
  return {
    name: WEB_SEARCH,
    description:
      'Search the live web. Pass several specific queries at once (one per entity or sub-question); they run in parallel. ' +
      'Results come back numbered [n] for citation.',
    parameters: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: maxQueries,
          description: `1-${maxQueries} distinct, specific queries. Include product names, the year, and words like "pricing", "changelog", "release notes".`,
        },
        depth: {
          type: 'string',
          enum: ['fast', 'deep'],
          description: 'fast = snippets (default). deep = reads page text; use when you need exact numbers (prices, limits, specs, versions, dates).',
        },
        since: {
          type: 'string',
          description: 'YYYY-MM-DD. Only pages published on or after this date. Use for news/changes since a date. Omit for current-state pages such as pricing pages.',
        },
        domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: restrict results to these domains, e.g. ["hubspot.com"].',
        },
      },
      required: ['queries'],
      additionalProperties: false,
    },
  };
}

const ArgsSchema = z.object({
  queries: z.array(z.string()).min(1),
  depth: z.enum(['fast', 'deep']).optional().default('fast'),
  since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  domains: z.array(z.string()).optional().catch(undefined),
});

export type WebSearchArgs = { queries: string[]; depth: 'fast' | 'deep'; since?: string; domains?: string[] };

export function parseWebSearchArgs(raw: string, maxQueries: number): WebSearchArgs | { error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw || '{}');
  } catch {
    return { error: 'Arguments were not valid JSON.' };
  }
  // Some models send a single "query" string; accept it.
  if (json && typeof json === 'object' && 'query' in json && !('queries' in json)) {
    json = { ...json, queries: [(json as { query: unknown }).query] };
  }
  const parsed = ArgsSchema.safeParse(json);
  if (!parsed.success) return { error: 'Expected {"queries": ["..."]}.' };
  const queries = [...new Set(parsed.data.queries.map((q) => q.trim()).filter(Boolean))].slice(0, maxQueries);
  if (!queries.length) return { error: 'No non-empty queries given.' };
  const domains = parsed.data.domains?.map((d) => d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim()).filter(Boolean);
  return { queries, depth: parsed.data.depth, since: parsed.data.since, domains: domains?.length ? domains : undefined };
}

const CONTENT_CHARS = { fast: 700, deep: 2_400 } as const;
const TOTAL_CHARS = 36_000;

// Numbers the hits and renders them for the model, within a character budget.
export function renderResults(
  args: WebSearchArgs,
  outcome: SearchOutcome,
  registry: SourceRegistry,
  today: string,
): { text: string; sources: Source[] } {
  const sources: Source[] = [];
  const blocks: string[] = [];
  let used = 0;
  for (const hit of outcome.hits) {
    const body = truncate(hit.content || hit.snippet, CONTENT_CHARS[args.depth]);
    // Check the budget before registering, so sources the model never saw don't get numbers.
    if (used + body.length + hit.url.length + hit.title.length + 40 > TOTAL_CHARS) break;
    const { source } = registry.register(hit);
    const date = hit.publishedAt ? `, published ${hit.publishedAt.slice(0, 10)}` : '';
    const block = `[${source.id}] ${source.title} (${source.domain}${date})\n${source.url}\n${body}`;
    blocks.push(block);
    sources.push(source);
    used += block.length;
  }

  const header = `Search results (retrieved ${today}${args.since ? `, published since ${args.since}` : ''}) for: ${args.queries.map((q) => `"${q}"`).join(', ')}`;
  if (!blocks.length) {
    const failed = outcome.failedQueries.length === args.queries.length;
    return {
      sources,
      text: `${header}\n\n${failed ? 'Search failed (provider error).' : 'No results.'} ` +
        (args.since ? 'Nothing published in that window may simply mean nothing changed; check the current official page without `since`. ' : '') +
        'Try different wording, or answer from what you have and say clearly what you could not verify.',
    };
  }
  const failedNote = outcome.failedQueries.length ? `\n(Failed queries: ${outcome.failedQueries.join('; ')})` : '';
  return { sources, text: `${header}${failedNote}\n\n${blocks.join('\n\n')}` };
}
