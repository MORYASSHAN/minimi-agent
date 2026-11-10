import { describe, expect, it } from 'vitest';
import { mustSearchFirst } from '../server/agent/searchPolicy.js';
import { countWords } from '../server/config.js';

const none = { triggered: false, found: false };

describe('mustSearchFirst', () => {
  it.each([
    'Who is the president of Uganda?',
    'who is president of uganda',
    'Neon vs Supabase pricing',
    'What is the capital of Australia?',
    'tell me about the latest iPhone',
  ])('searches for "%s"', (q) => expect(mustSearchFirst(q, none)).toBe(true));

  it.each(['hi', 'Hello!', 'thanks', 'ok', 'good morning'])('skips small talk "%s"', (q) => expect(mustSearchFirst(q, none)).toBe(false));

  it.each(['Rewrite this email to sound friendlier: ...', 'translate "good night" to Hindi', 'fix this ```const x = 1```', 'calculate 18% of 2400'])(
    'leaves tasks on the user’s own text to the model: "%s"',
    (q) => expect(mustSearchFirst(q, none)).toBe(false),
  );

  it('about a past chat we found: re-checks only when asked about now', () => {
    const found = { triggered: true, found: true };
    expect(mustSearchFirst('What did I ask you on 3 November?', found)).toBe(false);
    expect(mustSearchFirst('What did I ask you on 3 November? Is your answer still correct today?', found)).toBe(true);
    expect(mustSearchFirst('Last Tuesday I asked about Postgres hosting. Has any pricing changed since then?', found)).toBe(true);
  });

  it('about a past chat we do not have: the model decides (no aimless forced search)', () => {
    expect(mustSearchFirst('What did I ask you on 3 November? Is your answer still correct today?', { triggered: true, found: false })).toBe(false);
  });
});

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('  who is   president of\nuganda ')).toBe(5);
    expect(countWords('sssss ss s')).toBe(3);
    expect(countWords('   ')).toBe(0);
  });
});
