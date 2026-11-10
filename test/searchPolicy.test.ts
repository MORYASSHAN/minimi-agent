import { describe, expect, it } from 'vitest';
import { mustSearchFirst } from '../server/agent/searchPolicy.js';

describe('mustSearchFirst', () => {
  it.each([
    'Who is the president of Uganda?',
    'who is president of uganda',
    'Neon vs Supabase pricing',
    'What is the capital of Australia?',
    'tell me about the latest iPhone',
  ])('searches for "%s"', (q) => expect(mustSearchFirst(q, false)).toBe(true));

  it.each(['hi', 'Hello!', 'thanks', 'ok 👍', 'good morning'])('skips small talk "%s"', (q) => expect(mustSearchFirst(q, false)).toBe(false));

  it('answers pure memory questions from memory, but re-checks when asked about now', () => {
    expect(mustSearchFirst('What did I ask you on 3 November?', true)).toBe(false);
    expect(mustSearchFirst('What did I ask you on 3 November? Is your answer still correct today?', true)).toBe(true);
    expect(mustSearchFirst('Last Tuesday I asked about Postgres hosting. Has any pricing changed since then?', true)).toBe(true);
  });
});

describe('countWords', async () => {
  const { countWords } = await import('../server/config.js');
  it('counts whitespace-separated words', () => {
    expect(countWords('  who is   president of\nuganda ')).toBe(5);
    expect(countWords('sssss ss s')).toBe(3);
    expect(countWords('   ')).toBe(0);
  });
});
