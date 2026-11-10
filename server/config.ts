import { existsSync } from 'node:fs';
import { z } from 'zod';

// Load .env without a dependency (Node >= 20.12). Real env vars win.
if (existsSync('.env')) process.loadEnvFile('.env');

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),

  // LLM: any OpenAI-compatible endpoint (OpenAI, Groq, OpenRouter, Gemini, Ollama...).
  OPENAI_API_KEY: optional,
  OPENAI_BASE_URL: optional,
  CHAT_MODEL: z.string().default('gpt-5.4-mini'),
  FAST_MODEL: z.string().default('gpt-5.4-nano'),
  REASONING_EFFORT: z.enum(['none', 'minimal', 'low', 'medium', 'high']).optional(),

  // Search providers, tried in this order. "openai" (hosted web search) needs no extra key
  // and is the last-resort fallback when OPENAI_API_KEY is an OpenAI key.
  SEARCH_PROVIDERS: z.string().default('tavily,brave,serper,openai'),
  TAVILY_API_KEY: optional,
  BRAVE_API_KEY: optional,
  SERPER_API_KEY: optional,

  // Usage limits, so one key can't be drained by long questions, long answers or heavy use.
  MAX_INPUT_WORDS: z.coerce.number().int().positive().default(300),
  MAX_ANSWER_TOKENS: z.coerce.number().int().positive().default(1_200),
  DAILY_MESSAGE_LIMIT: z.coerce.number().int().positive().default(60),
  MAX_SEARCH_QUERIES: z.coerce.number().int().min(1).max(6).default(4),

  // MongoDB. Leave empty to run an embedded MongoDB persisted in ./.data/mongo.
  MONGODB_URI: optional,

  // Testing hook: pin "now" (ISO string) to exercise date-relative memory.
  AGENT_NOW: optional,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}
const env = parsed.data;
const isOfficialOpenAI = !env.OPENAI_BASE_URL || env.OPENAI_BASE_URL.includes('api.openai.com');

export const config = {
  port: env.PORT,
  llm: {
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
    chatModel: env.CHAT_MODEL,
    fastModel: env.FAST_MODEL,
    reasoningEffort: env.REASONING_EFFORT,
  },
  search: {
    order: env.SEARCH_PROVIDERS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    keys: {
      tavily: env.TAVILY_API_KEY,
      brave: env.BRAVE_API_KEY,
      serper: env.SERPER_API_KEY,
      openai: isOfficialOpenAI ? env.OPENAI_API_KEY : undefined,
    } as Record<string, string | undefined>,
  },
  limits: {
    maxInputWords: env.MAX_INPUT_WORDS,
    dailyMessages: env.DAILY_MESSAGE_LIMIT,
  },
  mongoUri: env.MONGODB_URI,
  fixedNow: env.AGENT_NOW,
  logLevel: env.LOG_LEVEL,
  agent: {
    maxToolRounds: 3,
    maxQueriesPerCall: env.MAX_SEARCH_QUERIES,
    historyCharBudget: 24_000,
    maxAnswerTokens: env.MAX_ANSWER_TOKENS,
  },
} as const;

export type AppConfig = typeof config;

/** Keys the app can't work without; surfaced in /api/health and the UI banner. */
export function missingConfig(): string[] {
  const missing: string[] = [];
  if (!config.llm.apiKey) missing.push('OPENAI_API_KEY');
  if (!config.search.order.some((p) => config.search.keys[p])) missing.push('TAVILY_API_KEY (or another search key)');
  return missing;
}

/** Word count as users understand it, for the question-length limit. */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
