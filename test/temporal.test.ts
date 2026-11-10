import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { recentCalendar, resolveTimeReferences } from '../server/memory/temporal.js';

// Tuesday 10 November 2026, 18:30 in India.
const NOW = DateTime.fromISO('2026-11-10T18:30', { zone: 'Asia/Kolkata' }).toJSDate();
const TZ = 'Asia/Kolkata';

const days = (text: string, tz = TZ, now = NOW) =>
  resolveTimeReferences(text, now, tz).map((r) => [
    DateTime.fromJSDate(r.start).setZone(tz).toISODate(),
    DateTime.fromJSDate(r.end).setZone(tz).toISODate(),
  ]);

describe('resolveTimeReferences', () => {
  it('handles the three phrasings from the challenge dataset', () => {
    expect(days('What did I ask you on 3 November? Is your answer still correct today?')).toEqual([['2026-11-03', '2026-11-03']]);
    expect(days('Last Tuesday I asked you about Postgres hosting.')).toEqual([['2026-11-03', '2026-11-03']]);
    expect(days('On Monday we shortlisted 5 CRM tools for a 20-person sales team.')).toEqual([['2026-11-09', '2026-11-09']]);
  });

  it('moves future-looking guesses into the past', () => {
    expect(days('on Friday we talked about pricing')).toEqual([['2026-11-06', '2026-11-06']]);
    expect(days('what did I ask on 15 December')).toEqual([['2025-12-15', '2025-12-15']]);
  });

  it('uses the granularity the user said', () => {
    expect(days('what did we discuss last week')).toEqual([['2026-11-02', '2026-11-08']]);
    expect(days('anything I asked in October')).toEqual([['2026-10-01', '2026-10-31']]);
    expect(days('yesterday')).toEqual([['2026-11-09', '2026-11-09']]);
  });

  it('treats "today" as the check date when another date is present, but keeps it alone', () => {
    expect(days('is the answer from 3 Nov still true today?')).toEqual([['2026-11-03', '2026-11-03']]);
    expect(days('what did I ask you today?')).toEqual([['2026-11-10', '2026-11-10']]);
  });

  it('resolves days in the user timezone, not the server one', () => {
    // 01:00 on Wed 11 Nov in Tokyo is still Tue 10 Nov in UTC.
    const now = DateTime.fromISO('2026-11-11T01:00', { zone: 'Asia/Tokyo' }).toJSDate();
    expect(days('yesterday', 'Asia/Tokyo', now)).toEqual([['2026-11-10', '2026-11-10']]);
    expect(days('yesterday', 'UTC', now)).toEqual([['2026-11-09', '2026-11-09']]);
  });

  it('ignores times without dates and messages without dates', () => {
    expect(days('call me at 5pm')).toEqual([]);
    expect(days('compare Neon and Supabase pricing')).toEqual([]);
  });
});

describe('recentCalendar', () => {
  it('labels today and yesterday so the model can map weekdays to dates', () => {
    const cal = recentCalendar(NOW, TZ);
    expect(cal).toContain('Tue 3 Nov');
    expect(cal).toContain('Mon 9 Nov (yesterday)');
    expect(cal.endsWith('Tue 10 Nov (today)')).toBe(true);
  });
});
