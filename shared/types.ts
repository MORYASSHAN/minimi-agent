/**
 * Wire contract between the API and the React client.
 * One file, imported by both sides, so the stream protocol can't drift.
 */

export interface Source {
  /** Citation number, unique within a thread so [n] stays valid across turns. */
  id: number;
  url: string;
  title: string;
  domain: string;
  snippet: string;
  publishedAt?: string;
}

export interface SearchStep {
  id: string;
  queries: string[];
  since?: string;
  depth: 'fast' | 'deep';
  status: 'running' | 'done' | 'error';
  resultCount?: number;
  provider?: string;
  ms?: number;
}

export interface RecalledTurn {
  turnId: string;
  threadId: string;
  at: string;
  question: string;
}

export interface MemoryNote {
  /** Human labels of the time references we resolved, e.g. "Tue 3 Nov 2026". */
  ranges: string[];
  matches: RecalledTurn[];
  /** True when the user referred to the past but nothing matched. */
  empty: boolean;
}

export interface TurnTimings {
  totalMs: number;
  firstTokenMs?: number;
  recallMs: number;
  searchMs: number;
  llmRounds: number;
}

/** Server-sent events emitted during one chat turn, in order. */
export type AgentEvent =
  | { type: 'thread'; threadId: string; turnId: string }
  | { type: 'memory'; memory: MemoryNote }
  | { type: 'search'; step: SearchStep }
  | { type: 'sources'; sources: Source[] }
  | { type: 'text'; delta: string }
  /** The model spoke before deciding to search; the client discards that draft. */
  | { type: 'text_reset' }
  | { type: 'done'; turnId: string; answer: string; citedSourceIds: number[]; timings: TurnTimings }
  | { type: 'error'; message: string; retryable: boolean };

export interface ThreadSummary {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
}

export interface TurnDTO {
  id: string;
  question: string;
  answer: string;
  status: 'complete' | 'aborted' | 'error';
  createdAt: string;
  sources: Source[];
  citedSourceIds: number[];
  searches: SearchStep[];
  memory?: MemoryNote;
  timings?: TurnTimings;
}

export interface ThreadDetail extends ThreadSummary {
  turns: TurnDTO[];
}

export interface UsageLimits {
  maxInputWords: number;
  /** Messages per user per rolling 24 hours. */
  dailyMessages: number;
  usedToday: number;
}

export interface HealthInfo {
  ok: boolean;
  model: string;
  searchProviders: string[];
  missing: string[];
  database: 'external' | 'embedded';
  limits: UsageLimits;
}
