import type { MemoryNote, SearchStep, Source, TurnTimings } from '../../shared/types.js';

/** A fact stated in an answer, kept with its source so it can be re-verified later. */
export interface Claim {
  subject: string;
  attribute: string;
  value: string;
  sourceUrl?: string;
}

/** Written in the background after a turn completes (see memory/enricher.ts). */
export interface Enrichment {
  status: 'pending' | 'done' | 'failed';
  summary: string;
  topics: string[];
  entities: string[];
  claims: Claim[];
}

export interface ThreadRecord {
  id: string;
  userId: string;
  title: string;
  titleFinal: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TurnRecord {
  id: string;
  threadId: string;
  userId: string;
  question: string;
  answer: string;
  status: 'pending' | 'complete' | 'aborted' | 'error';
  timezone: string;
  model?: string;
  sources: Source[];
  citedSourceIds: number[];
  searches: SearchStep[];
  memory?: MemoryNote;
  timings?: TurnTimings;
  enrichment: Enrichment;
  createdAt: Date;
}

export interface TurnQuery {
  userId: string;
  from?: Date;
  to?: Date;
  /** Ranked full-text match on question, topics, entities, summary and answer. */
  terms?: string[];
  limit: number;
}

export type TurnPatch = Partial<
  Pick<TurnRecord, 'answer' | 'status' | 'sources' | 'citedSourceIds' | 'searches' | 'memory' | 'timings' | 'model'>
>;

// Storage interface: MongoStore in the app, an in-memory fake in tests.
export interface ConversationStore {
  createThread(userId: string, title: string, at: Date): Promise<ThreadRecord>;
  getThread(userId: string, threadId: string): Promise<ThreadRecord | null>;
  listThreads(userId: string, limit: number): Promise<ThreadRecord[]>;
  deleteThread(userId: string, threadId: string): Promise<boolean>;
  touchThread(threadId: string, at: Date, title?: { title: string; final: boolean }): Promise<void>;

  listTurns(threadId: string): Promise<TurnRecord[]>;
  createTurn(input: Pick<TurnRecord, 'threadId' | 'userId' | 'question' | 'timezone' | 'createdAt'>): Promise<TurnRecord>;
  finishTurn(turnId: string, patch: TurnPatch): Promise<void>;
  getTurn(turnId: string): Promise<TurnRecord | null>;
  setEnrichment(turnId: string, enrichment: Enrichment): Promise<void>;

  /** Completed turns for a user, optionally within [from, to] and ranked by topic terms. */
  findTurns(query: TurnQuery): Promise<TurnRecord[]>;
  firstTurnAt(userId: string): Promise<Date | null>;
  /** Messages a user has sent since a moment (any status), for usage limits. */
  countTurnsSince(userId: string, since: Date): Promise<number>;
}
