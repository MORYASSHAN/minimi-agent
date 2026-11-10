import { Agent } from './agent/agent.js';
import type { AppConfig } from './config.js';
import type { Clock } from './lib/clock.js';
import { JobQueue } from './lib/jobQueue.js';
import type { Logger } from './lib/logger.js';
import { OpenAIChatModel } from './llm/openaiChatModel.js';
import { TurnEnricher } from './memory/enricher.js';
import { MemoryRecall } from './memory/recall.js';
import type { ConversationStore } from './memory/store.js';
import { createSearchService } from './search/index.js';
import type { SearchService } from './search/searchService.js';

export interface Services {
  store: ConversationStore;
  clock: Clock;
  queue: JobQueue;
  search?: SearchService;
  /** Undefined until an LLM key is configured. */
  agent?: Agent;
}

/** Composition root: the only place that knows concrete classes. Everything else gets interfaces. */
export function createServices(config: AppConfig, store: ConversationStore, clock: Clock, logger: Logger): Services {
  const queue = new JobQueue(logger.child({ mod: 'jobs' }));
  const search = createSearchService(config, logger);
  if (!config.llm.apiKey) return { store, clock, queue, search };

  const common = { apiKey: config.llm.apiKey, baseURL: config.llm.baseURL };
  const model = new OpenAIChatModel({ ...common, model: config.llm.chatModel, reasoningEffort: config.llm.reasoningEffort });
  // Background enrichment is a small extraction task: the cheap fast model is plenty.
  const fastModel = new OpenAIChatModel({ ...common, model: config.llm.fastModel });

  const agent = new Agent({
    store,
    model,
    search,
    recall: new MemoryRecall(store),
    enricher: new TurnEnricher(store, fastModel, logger.child({ mod: 'memory' })),
    queue,
    clock,
    logger: logger.child({ mod: 'agent' }),
    settings: config.agent,
  });
  return { store, clock, queue, search, agent };
}
