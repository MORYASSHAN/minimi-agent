import type { z } from 'zod';

/** OpenAI chat format is the lingua franca; these types are a structural subset of it. */
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ChatChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool_calls'; calls: ToolCall[] }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cachedTokens: number };

export interface StreamRequest {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  /** 'required' forces a tool call (used for the search-first policy). */
  toolChoice?: 'auto' | 'none' | 'required';
  maxTokens?: number;
}

export interface JsonRequest<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  name: string;
  maxTokens?: number;
}

/** What the agent needs from a model. Anything that can do this can power the agent. */
export interface ChatModel {
  readonly model: string;
  stream(req: StreamRequest, signal?: AbortSignal): AsyncIterable<ChatChunk>;
  json<T>(req: JsonRequest<T>, signal?: AbortSignal): Promise<T>;
}

/** Provider failure translated into something we can show a user. */
export class LlmError extends Error {
  constructor(
    readonly userMessage: string,
    readonly retryable: boolean,
    cause?: unknown,
  ) {
    super(userMessage, { cause });
    this.name = 'LlmError';
  }
}
