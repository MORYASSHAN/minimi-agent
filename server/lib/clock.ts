/**
 * Every date-relative feature ("last Tuesday", "since then") reads time from a Clock,
 * never from `new Date()` directly. That makes memory behaviour testable and lets
 * AGENT_NOW replay the app as if it were a different day.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(iso: string): Clock {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) throw new Error(`Invalid fixed clock time: ${iso}`);
  // Advance in real time from the pinned instant so ordering of new writes stays correct.
  const startedAt = Date.now();
  return { now: () => new Date(t.getTime() + (Date.now() - startedAt)) };
}
