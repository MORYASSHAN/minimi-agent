import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import type { AgentEvent, MemoryNote, SearchStep, Source } from '../../shared/types.js';
import type { Clock } from '../lib/clock.js';
import type { JobQueue } from '../lib/jobQueue.js';
import type { Logger } from '../lib/logger.js';
import { citedIds, collapseWhitespace, truncate } from '../lib/text.js';
import { LlmError, type ChatMessage, type ChatModel, type ToolCall } from '../llm/types.js';
import type { TurnEnricher } from '../memory/enricher.js';
import { renderMemory, toMemoryNote, type MemoryRecall } from '../memory/recall.js';
import type { ConversationStore } from '../memory/store.js';
import { isValidTimezone } from '../memory/temporal.js';
import type { SearchService } from '../search/searchService.js';
import { buildHistory } from './history.js';
import { SYSTEM_PROMPT, contextPrompt } from './prompts.js';
import { mustSearchFirst } from './searchPolicy.js';
import { SourceRegistry } from './sourceRegistry.js';
import { WEB_SEARCH, parseWebSearchArgs, renderResults, webSearchSpec, type WebSearchArgs } from './webSearchTool.js';

export interface AgentSettings {
  maxToolRounds: number;
  maxQueriesPerCall: number;
  historyCharBudget: number;
  /** Hard cap on answer length, so a single reply can't burn through the API budget. */
  maxAnswerTokens: number;
}

export interface AgentDeps {
  store: ConversationStore;
  model: ChatModel;
  /** Undefined when no search provider is configured; the agent then says it can't check the web. */
  search?: SearchService;
  recall: MemoryRecall;
  enricher: TurnEnricher;
  queue: JobQueue;
  clock: Clock;
  logger: Logger;
  settings: AgentSettings;
}

export interface TurnInput {
  userId: string;
  threadId?: string;
  message: string;
  timezone: string;
}

interface PlannedCall {
  call: ToolCall;
  args?: WebSearchArgs;
  error?: string;
  step?: SearchStep;
}

const NO_SEARCH_NOTE =
  '\n\nWeb search is not configured in this deployment. Answer from your own knowledge and say clearly that you could not check the live web for anything time-sensitive.';

const ms = (since: number) => Math.round(performance.now() - since);

/**
 * One chat turn, end to end:
 *   1. load thread + recall memory (deterministic, no LLM)
 *   2. tool loop: model decides to search -> parallel queries -> model answers (streamed)
 *   3. persist the turn, then enrich memory in the background
 * Emits AgentEvents as it goes; the HTTP layer just forwards them as SSE.
 */
export class Agent {
  constructor(private readonly deps: AgentDeps) {}

  async *run(input: TurnInput, signal: AbortSignal): AsyncGenerator<AgentEvent> {
    const { store, clock, settings } = this.deps;
    const started = performance.now();
    const now = clock.now();
    const tz = isValidTimezone(input.timezone) ? input.timezone : 'UTC';
    const log = this.deps.logger.child({ user: input.userId.slice(0, 8) });

    // 1. Memory: resolve "last Tuesday" etc. and fetch matching past turns. It doesn't depend on
    // the thread, so it runs in parallel with loading the thread instead of after it.
    const recallStarted = performance.now();
    let recallMs = 0;
    const recallPromise = this.deps.recall.recall({ userId: input.userId, message: input.message, now, timezone: tz }).finally(() => {
      recallMs = ms(recallStarted);
    });
    recallPromise.catch(() => {}); // awaited below; this only silences the early-return path

    let thread = input.threadId ? await store.getThread(input.userId, input.threadId) : null;
    if (input.threadId && !thread) {
      yield { type: 'error', message: "That conversation doesn't exist anymore. Start a new chat.", retryable: false };
      return;
    }
    thread ??= await store.createThread(input.userId, truncate(collapseWhitespace(input.message), 60), now);
    const [prior, turn] = await Promise.all([
      store.listTurns(thread.id),
      store.createTurn({ threadId: thread.id, userId: input.userId, question: input.message, timezone: tz, createdAt: now }),
    ]);
    yield { type: 'thread', threadId: thread.id, turnId: turn.id };

    const recall = await recallPromise;
    const memory: MemoryNote | undefined = recall.triggered ? toMemoryNote(recall) : undefined;
    if (memory) yield { type: 'memory', memory };

    const registry = new SourceRegistry(prior.flatMap((t) => t.sources));
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        content: contextPrompt(now, tz, recall.triggered ? renderMemory(recall, tz) : undefined) + (this.deps.search ? '' : NO_SEARCH_NOTE),
      },
      ...buildHistory(prior, settings.historyCharBudget),
      { role: 'user', content: input.message },
    ];
    const tools = this.deps.search ? [webSearchSpec(settings.maxQueriesPerCall)] : undefined;
    const searchFirst = !!tools && mustSearchFirst(input.message, recall.matches.length > 0);
    const today = DateTime.fromJSDate(now).setZone(tz).toISODate() ?? now.toISOString().slice(0, 10);

    const searches: SearchStep[] = [];
    const emitted = new Set<number>();
    const usage = { input: 0, output: 0, cached: 0 };
    let answer = '';
    let firstTokenMs: number | undefined;
    let rounds = 0;
    let searchMs = 0;

    try {
      // 2. Tool loop. Usually 2 model calls: decide+search, then answer.
      for (let round = 0; ; round++) {
        const canSearch = !!tools && round < settings.maxToolRounds;
        const calls: ToolCall[] = [];
        let text = '';
        rounds++;
        const toolChoice = !canSearch ? 'none' : round === 0 && searchFirst ? 'required' : 'auto';
        for await (const chunk of this.deps.model.stream({ messages, tools, toolChoice, maxTokens: settings.maxAnswerTokens }, signal)) {
          if (chunk.type === 'text') {
            text += chunk.delta;
            answer = text;
            firstTokenMs ??= ms(started);
            yield { type: 'text', delta: chunk.delta };
          } else if (chunk.type === 'tool_calls') {
            calls.push(...chunk.calls);
          } else {
            usage.input += chunk.inputTokens;
            usage.output += chunk.outputTokens;
            usage.cached += chunk.cachedTokens;
          }
        }
        if (!calls.length || !canSearch) break;

        // The model "thought out loud" before calling the tool: that text isn't the answer.
        if (text) {
          yield { type: 'text_reset' };
          answer = '';
          firstTokenMs = undefined;
        }
        messages.push({ role: 'assistant', content: text || null, tool_calls: calls });

        const planned = calls.map((call) => this.plan(call));
        for (const p of planned) {
          if (!p.step) continue;
          searches.push(p.step);
          yield { type: 'search', step: p.step };
        }
        const searchStarted = performance.now();
        const results = await Promise.all(planned.map((p) => this.execute(p, registry, today, signal)));
        searchMs += ms(searchStarted);

        for (const r of results) {
          if (r.step) {
            searches[searches.findIndex((s) => s.id === r.step!.id)] = r.step;
            yield { type: 'search', step: r.step };
          }
          const fresh = r.sources.filter((s) => !emitted.has(s.id));
          for (const s of fresh) emitted.add(s.id);
          if (fresh.length) yield { type: 'sources', sources: fresh };
          messages.push({ role: 'tool', tool_call_id: r.callId, content: r.content });
        }
      }

      if (!answer.trim()) {
        answer = "Sorry, I couldn't put an answer together for that. Could you rephrase or narrow it down?";
        yield { type: 'text', delta: answer };
      }

      // 3. Persist. Citations to sources from earlier turns travel with this turn too.
      const cited = citedIds(answer).filter((id) => registry.get(id));
      const turnSources = registry.forTurn(cited);
      const late = turnSources.filter((s) => !emitted.has(s.id));
      if (late.length) yield { type: 'sources', sources: late };

      const timings = { totalMs: ms(started), firstTokenMs, recallMs, searchMs, llmRounds: rounds };
      await store.finishTurn(turn.id, {
        answer,
        status: 'complete',
        sources: turnSources,
        citedSourceIds: cited,
        searches,
        memory,
        timings,
        model: this.deps.model.model,
      });
      await store.touchThread(thread.id, now);
      this.deps.queue.enqueue({ name: `enrich:${turn.id}`, run: () => this.deps.enricher.enrich(turn.id) });

      log.info('turn complete', {
        ...timings,
        searches: searches.length,
        sources: turnSources.length,
        cited: cited.length,
        memory: memory ? memory.matches.length : undefined,
        tokensIn: usage.input,
        tokensCached: usage.cached,
        tokensOut: usage.output,
      });
      yield { type: 'done', turnId: turn.id, answer, citedSourceIds: cited, timings };
    } catch (err) {
      const aborted = signal.aborted;
      await store
        .finishTurn(turn.id, { answer, status: aborted ? 'aborted' : 'error', sources: registry.forTurn(citedIds(answer)), searches, memory })
        .catch(() => {});
      if (aborted) {
        log.info('turn aborted by client', { ms: ms(started) });
        if (answer.trim()) this.deps.queue.enqueue({ name: `enrich:${turn.id}`, run: () => this.deps.enricher.enrich(turn.id) });
        return;
      }
      log.error('turn failed', { error: err instanceof Error ? err.message : String(err) });
      yield {
        type: 'error',
        message: err instanceof LlmError ? err.userMessage : 'Something went wrong while answering. Please try again.',
        retryable: err instanceof LlmError ? err.retryable : true,
      };
    }
  }

  private plan(call: ToolCall): PlannedCall {
    if (call.function.name !== WEB_SEARCH) return { call, error: `Unknown tool "${call.function.name}". The only tool is ${WEB_SEARCH}.` };
    const parsed = parseWebSearchArgs(call.function.arguments, this.deps.settings.maxQueriesPerCall);
    if ('error' in parsed) return { call, error: `Invalid ${WEB_SEARCH} arguments: ${parsed.error}` };
    return {
      call,
      args: parsed,
      step: { id: randomUUID().slice(0, 8), queries: parsed.queries, since: parsed.since, depth: parsed.depth, status: 'running' },
    };
  }

  private async execute(
    p: PlannedCall,
    registry: SourceRegistry,
    today: string,
    signal: AbortSignal,
  ): Promise<{ callId: string; content: string; sources: Source[]; step?: SearchStep }> {
    if (!p.args || !p.step || !this.deps.search) return { callId: p.call.id, content: p.error ?? 'Tool unavailable.', sources: [] };
    const outcome = await this.deps.search.search(p.args, signal);
    const { text, sources } = renderResults(p.args, outcome, registry, today);
    const allFailed = outcome.failedQueries.length === p.args.queries.length;
    return {
      callId: p.call.id,
      content: text,
      sources,
      step: { ...p.step, status: allFailed ? 'error' : 'done', resultCount: sources.length, provider: outcome.provider, ms: outcome.ms },
    };
  }
}
