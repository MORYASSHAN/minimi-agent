import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../shared/types.js';
import { Agent } from '../server/agent/agent.js';
import { fixedClock } from '../server/lib/clock.js';
import { JobQueue } from '../server/lib/jobQueue.js';
import { silentLogger } from '../server/lib/logger.js';
import type { ChatChunk, ChatModel } from '../server/llm/types.js';
import { TurnEnricher } from '../server/memory/enricher.js';
import { MemoryRecall } from '../server/memory/recall.js';
import { SearchService } from '../server/search/searchService.js';
import { FakeProvider, InMemoryStore, ScriptedModel } from './fakes.js';

const TZ = 'Asia/Kolkata';
const NOW = DateTime.fromISO('2026-11-10T18:30', { zone: TZ }).toISO()!;

function setup(model: ChatModel, provider = new FakeProvider('fake', () => [{ url: 'https://neon.com/pricing', title: 'Neon pricing', snippet: 'Launch $19/mo' }])) {
  const store = new InMemoryStore();
  const queue = new JobQueue(silentLogger);
  const agent = new Agent({
    store,
    model,
    search: new SearchService([provider], silentLogger),
    recall: new MemoryRecall(store),
    enricher: new TurnEnricher(store, model, silentLogger),
    queue,
    clock: fixedClock(NOW),
    logger: silentLogger,
    settings: { maxToolRounds: 3, maxQueriesPerCall: 6, historyCharBudget: 24_000, maxAnswerTokens: 1_200 },
  });
  return { store, queue, agent, provider };
}

async function collect(gen: AsyncIterable<AgentEvent>) {
  const events: AgentEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

const searchCall = (args: object): ChatChunk => ({
  type: 'tool_calls',
  calls: [{ id: 'c1', type: 'function', function: { name: 'web_search', arguments: JSON.stringify(args) } }],
});

describe('Agent', () => {
  it('searches, streams a cited answer, persists it and enriches memory in the background', async () => {
    const model = new ScriptedModel(
      (_req, call) =>
        call === 1
          ? [{ type: 'text', delta: 'Let me check.' }, searchCall({ queries: ['neon pricing'], depth: 'deep' })]
          : [{ type: 'text', delta: 'Neon Launch costs $19/month [1].' }],
      {
        title: 'Neon pricing',
        summary: 'Neon Launch is $19/mo.',
        topics: ['postgres hosting'],
        entities: ['Neon'],
        claims: [{ subject: 'Neon', attribute: 'Launch price', value: '$19/month', source: 1 }],
      },
    );
    const { store, queue, agent } = setup(model);
    const events = await collect(agent.run({ userId: 'u', message: 'How much is Neon?', timezone: TZ }, new AbortController().signal));

    expect(events.map((e) => e.type)).toEqual(['thread', 'text', 'text_reset', 'search', 'search', 'sources', 'text', 'done']);
    // Search-first: a factual question can't be answered from training data alone.
    expect(model.requests.map((r) => r.toolChoice)).toEqual(['required', 'auto']);
    const done = events.at(-1) as Extract<AgentEvent, { type: 'done' }>;
    expect(done.answer).toBe('Neon Launch costs $19/month [1].');
    expect(done.citedSourceIds).toEqual([1]);

    // The tool result went back to the model with numbered sources and today's date.
    const toolMsg = model.requests[1]!.messages.find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('[1] Neon pricing (neon.com)');
    expect(toolMsg?.content).toContain('retrieved 2026-11-10');

    await queue.drain();
    const turn = (await store.getTurn(done.turnId))!;
    expect(turn.status).toBe('complete');
    expect(turn.enrichment.claims[0]).toMatchObject({ subject: 'Neon', sourceUrl: 'https://neon.com/pricing' });
    expect((await store.getThread('u', turn.threadId))!.title).toBe('Neon pricing');
  });

  it('lets the model skip search for small talk', async () => {
    const model = new ScriptedModel(() => [{ type: 'text', delta: 'Hi! How can I help?' }]);
    const { agent, provider } = setup(model);
    const events = await collect(agent.run({ userId: 'u', message: 'hello', timezone: TZ }, new AbortController().signal));
    expect(events.map((e) => e.type)).toEqual(['thread', 'text', 'done']);
    expect(model.requests[0]!.toolChoice).toBe('auto');
    expect(provider.calls).toHaveLength(0);
  });

  it('tells the model plainly when a referenced day has no memory', async () => {
    const model = new ScriptedModel(() => [{ type: 'text', delta: "I don't have a record of that." }]);
    const { agent } = setup(model);
    const events = await collect(
      agent.run({ userId: 'u', message: 'What did I ask you on 3 November?', timezone: TZ }, new AbortController().signal),
    );
    expect(events.find((e) => e.type === 'memory')).toMatchObject({ memory: { empty: true, ranges: ['Tue 3 Nov 2026'] } });
    const context = model.requests[0]!.messages[1]!.content as string;
    expect(context).toContain('"on 3 November" → Tue 3 Nov 2026');
    expect(context).toContain('Never guess what they asked');
  });

  it('stops offering the tool after the round limit', async () => {
    const model = new ScriptedModel((req) => (req.toolChoice === 'none' ? [{ type: 'text', delta: 'Best effort.' }] : [searchCall({ queries: ['again'] })]));
    const { agent, provider } = setup(model);
    const events = await collect(agent.run({ userId: 'u', message: 'loop forever', timezone: TZ }, new AbortController().signal));
    expect(provider.calls).toHaveLength(1); // same query cached after the first round
    expect(model.requests).toHaveLength(4);
    expect(events.at(-1)).toMatchObject({ type: 'done', answer: 'Best effort.' });
  });

  it('keeps citation numbers stable across turns in a thread', async () => {
    let turn = 0;
    const model = new ScriptedModel((_req, call) => {
      if (call === 1 || call === 3) return [searchCall({ queries: [`q${++turn}`] })];
      return [{ type: 'text', delta: call === 2 ? 'First [1].' : 'Still [1].' }];
    });
    const { agent } = setup(model);
    const first = await collect(agent.run({ userId: 'u', message: 'one', timezone: TZ }, new AbortController().signal));
    const threadId = (first[0] as Extract<AgentEvent, { type: 'thread' }>).threadId;
    const second = await collect(agent.run({ userId: 'u', threadId, message: 'two', timezone: TZ }, new AbortController().signal));
    expect(second.at(-1)).toMatchObject({ type: 'done', citedSourceIds: [1] });
    // History replays the earlier answer with its cited source, not the raw search results.
    const replay = model.requests[2]!.messages.find((m) => m.role === 'assistant');
    expect(replay?.content).toContain('Sources cited above: [1] Neon pricing');
  });

  it('records an aborted turn without emitting an error', async () => {
    const controller = new AbortController();
    const model: ChatModel = {
      model: 'slow',
      async *stream() {
        yield { type: 'text', delta: 'partial' };
        controller.abort();
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      },
      json: async () => {
        throw new Error('unused');
      },
    };
    const { agent, store } = setup(model);
    const events = await collect(agent.run({ userId: 'u', message: 'x', timezone: TZ }, controller.signal));
    expect(events.some((e) => e.type === 'error')).toBe(false);
    const [turn] = [...store.turns.values()];
    expect(turn).toMatchObject({ status: 'aborted', answer: 'partial' });
  });
});
