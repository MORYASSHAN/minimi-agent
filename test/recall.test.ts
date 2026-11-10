import { DateTime } from 'luxon';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRecall, recallCue, renderMemory } from '../server/memory/recall.js';
import { InMemoryStore } from './fakes.js';

const TZ = 'Asia/Kolkata';
const NOW = DateTime.fromISO('2026-11-10T18:30', { zone: TZ }).toJSDate();
const at = (iso: string) => DateTime.fromISO(iso, { zone: TZ }).toJSDate();
const USER = 'u1';

describe('recallCue', () => {
  it.each([
    ['What did I ask you on 3 November?', 'strong'],
    ['Last Tuesday I asked you about Postgres hosting', 'strong'],
    ['On Monday we shortlisted 5 CRM tools', 'strong'],
    ['Is your answer still correct?', 'strong'],
    ['Has pricing changed since Monday?', 'weak'],
    ['What is the price of Neon?', 'none'],
    ['What happened in AI on 3 November?', 'none'],
  ])('%s -> %s', (msg, cue) => expect(recallCue(msg)).toBe(cue));
});

describe('MemoryRecall', () => {
  let store: InMemoryStore;
  let recall: MemoryRecall;

  beforeEach(async () => {
    store = new InMemoryStore();
    recall = new MemoryRecall(store);
    await store.seedTurn(USER, at('2026-11-03T14:05'), 'Compare Neon vs Supabase vs RDS', 'Neon Launch is $19/mo [1].', {
      enrichment: {
        status: 'done',
        summary: 'Compared managed Postgres hosts.',
        topics: ['postgres hosting', 'database pricing'],
        entities: ['Neon', 'Supabase', 'AWS RDS'],
        claims: [{ subject: 'Neon', attribute: 'Launch plan price', value: '$19/month', sourceUrl: 'https://neon.com/pricing' }],
      },
    });
    await store.seedTurn(USER, at('2026-11-03T10:00'), 'Best running shoes?', 'Depends on your gait.');
    await store.seedTurn(USER, at('2026-11-09T11:30'), 'CRM pricing for HubSpot, Pipedrive', 'HubSpot Pro is $90/seat [2].');
    await store.seedTurn('someone-else', at('2026-11-03T12:00'), 'Postgres hosting for me', 'Private.');
  });

  it('does nothing without a recall cue', async () => {
    const r = await recall.recall({ userId: USER, message: 'Neon pricing?', now: NOW, timezone: TZ });
    expect(r.triggered).toBe(false);
  });

  it('finds the topic match on the referenced day, and only for this user', async () => {
    const r = await recall.recall({ userId: USER, message: 'Last Tuesday I asked you about Postgres hosting. Has pricing changed?', now: NOW, timezone: TZ });
    expect(r.triggered).toBe(true);
    expect(r.matches.map((t) => t.question)).toEqual(['Compare Neon vs Supabase vs RDS']);
  });

  it('returns the whole day when the question has no topic', async () => {
    const r = await recall.recall({ userId: USER, message: 'What did I ask you on 3 November?', now: NOW, timezone: TZ });
    expect(r.matches.map((t) => t.question)).toEqual(['Best running shoes?', 'Compare Neon vs Supabase vs RDS']);
  });

  it('reports an empty day explicitly, with nearby topic matches', async () => {
    const r = await recall.recall({ userId: USER, message: 'On Friday I asked you about Postgres hosting', now: NOW, timezone: TZ });
    expect(r.matches).toHaveLength(0);
    expect(r.nearby.map((t) => t.question)).toEqual(['Compare Neon vs Supabase vs RDS']);
    const prompt = renderMemory(r, TZ);
    expect(prompt).toContain('No past conversations found in that time.');
    expect(prompt).toContain('Never guess');
    expect(prompt).toContain('different date than referenced');
  });

  it('puts the dated claims into the prompt so they can be re-verified', async () => {
    const r = await recall.recall({ userId: USER, message: 'What did I ask you last Tuesday? Is it still correct?', now: NOW, timezone: TZ });
    const prompt = renderMemory(r, TZ);
    expect(prompt).toContain('Tue 3 Nov 2026, 14:05');
    expect(prompt).toContain('Neon — Launch plan price: $19/month (https://neon.com/pricing)');
    expect(prompt).not.toContain('[1]'); // old citation numbers are stripped to avoid clashing with new ones
  });

  it('says so when the user has no history at all', async () => {
    const empty = new MemoryRecall(new InMemoryStore());
    const r = await empty.recall({ userId: 'new', message: 'What did I ask you on 3 November?', now: NOW, timezone: TZ });
    expect(renderMemory(r, TZ)).toContain('You have no earlier conversations with this user');
  });
});
