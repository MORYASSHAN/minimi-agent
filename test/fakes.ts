import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { ChatChunk, ChatModel, JsonRequest, StreamRequest } from '../server/llm/types.js';
import type { ConversationStore, Enrichment, ThreadRecord, TurnPatch, TurnQuery, TurnRecord } from '../server/memory/store.js';
import type { SearchHit, SearchProvider, SearchRequest } from '../server/search/types.js';

const hex24 = () => randomUUID().replace(/-/g, '').slice(0, 24);

/** In-memory ConversationStore. Text ranking is a simple term-overlap count. */
export class InMemoryStore implements ConversationStore {
  threads = new Map<string, ThreadRecord>();
  turns = new Map<string, TurnRecord>();

  async createThread(userId: string, title: string, at: Date) {
    const t: ThreadRecord = { id: hex24(), userId, title, titleFinal: false, createdAt: at, updatedAt: at };
    this.threads.set(t.id, t);
    return t;
  }
  async getThread(userId: string, id: string) {
    const t = this.threads.get(id);
    return t && t.userId === userId ? t : null;
  }
  async listThreads(userId: string, limit: number) {
    return [...this.threads.values()].filter((t) => t.userId === userId).sort((a, b) => +b.updatedAt - +a.updatedAt).slice(0, limit);
  }
  async deleteThread(userId: string, id: string) {
    const t = await this.getThread(userId, id);
    if (!t) return false;
    this.threads.delete(id);
    for (const [k, turn] of this.turns) if (turn.threadId === id) this.turns.delete(k);
    return true;
  }
  async touchThread(id: string, at: Date, title?: { title: string; final: boolean }) {
    const t = this.threads.get(id)!;
    this.threads.set(id, { ...t, updatedAt: at, ...(title && { title: title.title, titleFinal: title.final }) });
  }
  async listTurns(threadId: string) {
    return [...this.turns.values()].filter((t) => t.threadId === threadId).sort((a, b) => +a.createdAt - +b.createdAt);
  }
  async createTurn(input: Pick<TurnRecord, 'threadId' | 'userId' | 'question' | 'timezone' | 'createdAt'>) {
    const t: TurnRecord = {
      ...input,
      id: hex24(),
      answer: '',
      status: 'pending',
      sources: [],
      citedSourceIds: [],
      searches: [],
      enrichment: { status: 'pending', summary: '', topics: [], entities: [], claims: [] },
    };
    this.turns.set(t.id, t);
    return t;
  }
  async finishTurn(id: string, patch: TurnPatch) {
    this.turns.set(id, { ...this.turns.get(id)!, ...patch });
  }
  async getTurn(id: string) {
    return this.turns.get(id) ?? null;
  }
  async setEnrichment(id: string, enrichment: Enrichment) {
    this.turns.set(id, { ...this.turns.get(id)!, enrichment });
  }
  async findTurns(q: TurnQuery) {
    let list = [...this.turns.values()].filter(
      (t) =>
        t.userId === q.userId &&
        (t.status === 'complete' || t.status === 'aborted') &&
        (!q.from || t.createdAt >= q.from) &&
        (!q.to || t.createdAt <= q.to),
    );
    if (q.terms?.length) {
      const score = (t: TurnRecord) => {
        const hay = [t.question, t.answer, t.enrichment.summary, ...t.enrichment.topics, ...t.enrichment.entities].join(' ').toLowerCase();
        return q.terms!.filter((term) => hay.includes(term)).length;
      };
      list = list.filter((t) => score(t) > 0).sort((a, b) => score(b) - score(a));
    } else {
      list.sort((a, b) => +b.createdAt - +a.createdAt);
    }
    return list.slice(0, q.limit);
  }
  async countTurnsSince(userId: string, since: Date) {
    return [...this.turns.values()].filter((t) => t.userId === userId && t.createdAt >= since).length;
  }
  async firstTurnAt(userId: string) {
    const all = [...this.turns.values()].filter((t) => t.userId === userId && t.status !== 'pending');
    return all.length ? new Date(Math.min(...all.map((t) => +t.createdAt))) : null;
  }

  /** Test helper: a finished turn at a given time. */
  async seedTurn(userId: string, at: Date, question: string, answer: string, extra: Partial<TurnRecord> = {}) {
    const thread = await this.createThread(userId, question.slice(0, 40), at);
    const turn = await this.createTurn({ threadId: thread.id, userId, question, timezone: 'Asia/Kolkata', createdAt: at });
    await this.finishTurn(turn.id, { answer, status: 'complete', ...extra });
    return (await this.getTurn(turn.id))!;
  }
}

type Script = (req: StreamRequest, call: number) => ChatChunk[];

/** A ChatModel that replays scripted chunks, recording every request it receives. */
export class ScriptedModel implements ChatModel {
  readonly model = 'scripted';
  readonly requests: StreamRequest[] = [];
  constructor(
    private readonly script: Script,
    private readonly jsonReply: unknown = { title: 'T', summary: 'S', topics: [], entities: [], claims: [] },
  ) {}

  async *stream(req: StreamRequest): AsyncIterable<ChatChunk> {
    this.requests.push(structuredClone(req));
    for (const chunk of this.script(req, this.requests.length)) yield chunk;
  }

  async json<T>(req: JsonRequest<T>): Promise<T> {
    return (req.schema as z.ZodType<T>).parse(this.jsonReply);
  }
}

export class FakeProvider implements SearchProvider {
  readonly name: string;
  readonly returnsPageContent = true;
  calls: SearchRequest[] = [];
  constructor(
    name: string,
    private readonly results: (req: SearchRequest) => SearchHit[] | Promise<SearchHit[]>,
  ) {
    this.name = name;
  }
  async search(req: SearchRequest) {
    this.calls.push(req);
    return this.results(req);
  }
}
