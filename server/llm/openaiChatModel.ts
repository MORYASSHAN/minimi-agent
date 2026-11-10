import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { ChatCompletionCreateParamsStreaming, ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ChatChunk, ChatModel, JsonRequest, StreamRequest, ToolCall } from './types.js';
import { LlmError } from './types.js';

interface Options {
  apiKey: string;
  baseURL?: string;
  model: string;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
}

// Chat Completions rather than the Responses API: it is the one API every
// OpenAI-compatible provider implements.
export class OpenAIChatModel implements ChatModel {
  readonly model: string;
  private readonly client: OpenAI;
  private readonly isOfficialOpenAI: boolean;
  private readonly isReasoningModel: boolean;

  constructor(private readonly opts: Options) {
    this.model = opts.model;
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL, timeout: 60_000, maxRetries: 2 });
    this.isOfficialOpenAI = !opts.baseURL || opts.baseURL.includes('api.openai.com');
    const bare = opts.model.split('/').pop() ?? opts.model;
    this.isReasoningModel = /^(o\d|gpt-5)/i.test(bare);
  }

  async *stream(req: StreamRequest, signal?: AbortSignal): AsyncIterable<ChatChunk> {
    const params: ChatCompletionCreateParamsStreaming = {
      model: this.model,
      messages: req.messages as ChatCompletionMessageParam[],
      stream: true,
      ...this.samplingParams(req.maxTokens ?? 4_000),
    };
    if (req.tools?.length) {
      params.tools = req.tools.map((t) => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      params.tool_choice = req.toolChoice ?? 'auto';
      if (params.tool_choice !== 'none') params.parallel_tool_calls = true;
    }
    if (this.isOfficialOpenAI) params.stream_options = { include_usage: true };

    let stream;
    try {
      stream = await this.client.chat.completions.create(params, { signal });
    } catch (err) {
      throw toLlmError(err, this.model);
    }

    // Tool-call arguments arrive as fragments keyed by index; stitch them back together.
    const pending = new Map<number, ToolCall>();
    try {
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        const delta = choice?.delta;
        if (delta?.content) yield { type: 'text', delta: delta.content };
        for (const [i, tc] of (delta?.tool_calls ?? []).entries()) {
          const index = tc.index ?? i;
          const call = pending.get(index) ?? { id: '', type: 'function' as const, function: { name: '', arguments: '' } };
          if (tc.id) call.id = tc.id;
          if (tc.function?.name) call.function.name += tc.function.name;
          if (tc.function?.arguments) call.function.arguments += tc.function.arguments;
          pending.set(index, call);
        }
        if (chunk.usage) {
          yield {
            type: 'usage',
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
            cachedTokens: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
          };
        }
      }
    } catch (err) {
      throw toLlmError(err, this.model);
    }
    if (pending.size) {
      const calls = [...pending.entries()]
        .sort(([a], [b]) => a - b)
        .map(([i, c]) => ({ ...c, id: c.id || `call_${i}` }));
      yield { type: 'tool_calls', calls };
    }
  }

  async json<T>(req: JsonRequest<T>, signal?: AbortSignal): Promise<T> {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ];
    const base = { model: this.model, messages, ...this.samplingParams(req.maxTokens ?? 2_000) };
    let content: string | null | undefined;
    try {
      // Strict JSON schema where supported; plain JSON mode for providers that lack it.
      const res = await this.client.chat.completions
        .create({ ...base, response_format: zodResponseFormat(req.schema as never, req.name) }, { signal })
        .catch((err: unknown) => {
          if (err instanceof OpenAI.BadRequestError) {
            return this.client.chat.completions.create({ ...base, response_format: { type: 'json_object' } }, { signal });
          }
          throw err;
        });
      content = res.choices[0]?.message.content;
    } catch (err) {
      throw toLlmError(err, this.model);
    }
    if (!content) throw new LlmError('The model returned an empty response.', true);
    return req.schema.parse(JSON.parse(content));
  }

  private samplingParams(maxTokens: number) {
    if (this.isReasoningModel) {
      return {
        max_completion_tokens: maxTokens,
        ...(this.opts.reasoningEffort && { reasoning_effort: this.opts.reasoningEffort }),
      };
    }
    return { max_tokens: maxTokens, temperature: 0.3 };
  }
}

function toLlmError(err: unknown, model: string): unknown {
  if (err instanceof LlmError) return err;
  if (err instanceof OpenAI.APIUserAbortError || (err instanceof Error && err.name === 'AbortError')) return err;
  if (err instanceof OpenAI.AuthenticationError) {
    return new LlmError('The model provider rejected the API key. Check OPENAI_API_KEY in .env.', false, err);
  }
  if (err instanceof OpenAI.NotFoundError) {
    return new LlmError(`Model "${model}" isn't available for this API key. Set CHAT_MODEL / FAST_MODEL in .env.`, false, err);
  }
  if (err instanceof OpenAI.RateLimitError) {
    // OpenAI uses 429 both for "slow down" and for "this account is out of credits".
    // Only the first is worth retrying, so tell them apart.
    const code = `${err.code ?? ''} ${err.type ?? ''}`;
    if (/insufficient_quota|credit_balance|billing/i.test(code)) {
      return new LlmError(
        'The OpenAI account behind this API key has no credits left. Add credits at platform.openai.com → Settings → Billing, or switch to another provider in .env.',
        false,
        err,
      );
    }
    return new LlmError('The model provider is rate-limiting requests. Try again in a few seconds.', true, err);
  }
  if (err instanceof OpenAI.APIConnectionTimeoutError || err instanceof OpenAI.APIConnectionError) {
    return new LlmError("Couldn't reach the model provider. Check your connection and try again.", true, err);
  }
  if (err instanceof OpenAI.APIError) {
    return new LlmError(`The model provider returned an error (${err.status ?? 'unknown'}): ${err.message}`, true, err);
  }
  return err;
}
