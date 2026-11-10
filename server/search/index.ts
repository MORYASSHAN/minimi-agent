import type { AppConfig } from '../config.js';
import type { Logger } from '../lib/logger.js';
import { BraveProvider } from './providers/brave.js';
import { OpenAIWebSearchProvider } from './providers/openaiWebSearch.js';
import { SerperProvider } from './providers/serper.js';
import { TavilyProvider } from './providers/tavily.js';
import { SearchService } from './searchService.js';
import type { SearchProvider } from './types.js';

/** Build the fallback chain from SEARCH_PROVIDERS order, skipping providers without a key. */
export function createSearchService(config: AppConfig, logger: Logger): SearchService | undefined {
  const factories: Record<string, (key: string) => SearchProvider> = {
    tavily: (k) => new TavilyProvider(k),
    brave: (k) => new BraveProvider(k),
    serper: (k) => new SerperProvider(k),
    openai: (k) => new OpenAIWebSearchProvider(k, config.llm.chatModel),
  };
  const providers = config.search.order.flatMap((name) => {
    const key = config.search.keys[name];
    const make = factories[name];
    return key && make ? [make(key)] : [];
  });
  return providers.length ? new SearchService(providers, logger.child({ mod: 'search' })) : undefined;
}
