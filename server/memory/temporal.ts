import * as chrono from 'chrono-node';
import { DateTime } from 'luxon';

export interface TimeRange {
  start: Date;
  end: Date;
  /** The words the user wrote, e.g. "last Tuesday". */
  phrase: string;
  /** Human label in the user's timezone, e.g. "Tue 3 Nov 2026". */
  label: string;
}

/** "today"/"now" refer to the present (e.g. "is it still correct today?"), not to a past conversation. */
const PRESENT_ONLY = /^(today|now|right now|currently|tonight)$/i;

export function isValidTimezone(tz: string | undefined): tz is string {
  return !!tz && DateTime.local().setZone(tz).isValid;
}

// Turns past time references into ranges in the user's timezone. A match in the future is
// moved back (a weekday by a week, a date by a year); "last week" is a week, "in October" a month.
export function resolveTimeReferences(input: string, now: Date, timezone: string): TimeRange[] {
  // chrono reads "from 3 Nov" as "from 3 o'clock"; "on 3 Nov" parses as the date.
  const text = input.replace(/\b(from|since)\s+(?=\d{1,2}(?:st|nd|rd|th)?\s+[a-z]{3,})/gi, 'on ');
  const tz = isValidTimezone(timezone) ? timezone : 'UTC';
  const nowLocal = DateTime.fromJSDate(now).setZone(tz);
  const results = chrono.parse(text, { instant: now, timezone: nowLocal.offset }, { forwardDate: false });

  const ranges: Array<TimeRange & { present: boolean }> = [];
  for (const r of results) {
    const phrase = r.text.trim();
    const precededBy = text.slice(Math.max(0, r.index - 12), r.index).toLowerCase();
    const present = PRESENT_ONLY.test(phrase) && !/earlier\s*$/.test(precededBy);

    const s = r.start;
    const hasDay = s.isCertain('day') || s.isCertain('weekday') || r.tags().has('result/relativeDate') || /day|ago|morning/i.test(phrase);
    const hasMonth = s.isCertain('month');
    if (!hasDay && !hasMonth && !/week|month|year/i.test(phrase)) continue; // time-only, e.g. "at 5pm"

    let anchor = nowLocal.set({
      year: s.get('year') ?? nowLocal.year,
      month: s.get('month') ?? nowLocal.month,
      day: s.get('day') ?? nowLocal.day,
    });

    // Move future guesses into the past.
    if (anchor.startOf('day') > nowLocal) {
      if (s.isCertain('weekday') && !s.isCertain('day')) anchor = anchor.minus({ weeks: 1 });
      else if (!s.isCertain('year')) anchor = anchor.minus({ years: 1 });
      else continue; // an explicit future date isn't a memory reference
    }

    let start: DateTime;
    let end: DateTime;
    if (r.end) {
      start = anchor.startOf('day');
      end = nowLocal.set({ year: r.end.get('year') ?? anchor.year, month: r.end.get('month') ?? anchor.month, day: r.end.get('day') ?? anchor.day }).endOf('day');
    } else if (/\bweeks?\b/i.test(phrase) && !/ago/i.test(phrase)) {
      start = anchor.startOf('week');
      end = anchor.endOf('week');
    } else if ((/\bmonths?\b/i.test(phrase) && !/ago/i.test(phrase)) || (hasMonth && !s.isCertain('day') && !s.isCertain('weekday'))) {
      start = anchor.startOf('month');
      end = anchor.endOf('month');
    } else if (/\bweeks? ago\b/i.test(phrase)) {
      // "2 weeks ago" is fuzzy: allow +/- 3 days around the anchor.
      start = anchor.minus({ days: 3 }).startOf('day');
      end = anchor.plus({ days: 3 }).endOf('day');
    } else {
      start = anchor.startOf('day');
      end = anchor.endOf('day');
    }
    if (end > nowLocal) end = nowLocal;
    if (start > end) continue;

    ranges.push({ start: start.toJSDate(), end: end.toJSDate(), phrase, label: labelFor(start, end), present });
  }
  // "What did I ask on 3 Nov? Is it still correct today?" -> "today" is the check date, not a recall target.
  // "What did I ask you today?" -> today is the only reference, so keep it.
  const past = ranges.filter((r) => !r.present);
  return (past.length ? past : ranges).map(({ present: _present, ...r }) => r);
}

function labelFor(start: DateTime, end: DateTime): string {
  const day = (d: DateTime) => d.toFormat('ccc d LLL yyyy');
  if (start.hasSame(end, 'day')) return day(start);
  return `${day(start)} – ${day(end)}`;
}

/** Format an instant for prompts and UI in the user's timezone. */
export function formatLocal(date: Date, timezone: string, withTime = true): string {
  const d = DateTime.fromJSDate(date).setZone(isValidTimezone(timezone) ? timezone : 'UTC');
  return d.toFormat(withTime ? 'ccc d LLL yyyy, HH:mm' : 'ccc d LLL yyyy');
}

// Weekday/date pairs for the prompt. Models are unreliable at weekday arithmetic.
export function recentCalendar(now: Date, timezone: string, days = 14): string {
  const today = DateTime.fromJSDate(now).setZone(isValidTimezone(timezone) ? timezone : 'UTC').startOf('day');
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = today.minus({ days: i });
    const tag = i === 0 ? ' (today)' : i === 1 ? ' (yesterday)' : '';
    out.push(d.toFormat('ccc d LLL') + tag);
  }
  return out.join(' · ');
}
