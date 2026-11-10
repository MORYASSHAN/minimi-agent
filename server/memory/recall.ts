import type { MemoryNote } from '../../shared/types.js';
import { topicTerms } from '../lib/text.js';
import type { ConversationStore, TurnRecord } from './store.js';
import { formatLocal, resolveTimeReferences, type TimeRange } from './temporal.js';

/**
 * Strong cues talk about the conversation itself ("what did I ask", "you said", "last time").
 * Weak cues ("since", "earlier") only count when paired with a date ("since Monday").
 */
const STRONG_CUES = [
  /\b(i|we)\s+(asked|said|told|mentioned|discussed|talked|shortlisted|shared|picked|chose|decided|compared|looked\s+(at|into)|researched|searched|went\s+through)\b/i,
  /\b(did|have|had)\s+(i|we)\s+(ask|say|tell|mention|discuss|talk|shortlist|share|pick|choose|decide|compare|look|research|search)/i,
  /\b(did|have|had)\s+you\s+(say|tell|answer|recommend|suggest|find|mention|give|list)/i,
  /\byou\s+(said|told|answered|recommended|suggested|found|mentioned|gave|listed|showed|wrote)\b/i,
  /\byour\s+(answer|recommendation|list|shortlist|comparison|suggestion|reply)\b/i,
  /\b(last time|previously|our (last |previous )?(chat|conversation|discussion)|remember when|do you remember)\b/i,
];
const WEAK_CUES = /\b(since|earlier|before|back then|at the time)\b/i;

export type CueStrength = 'none' | 'weak' | 'strong';

export function recallCue(message: string): CueStrength {
  if (STRONG_CUES.some((re) => re.test(message))) return 'strong';
  if (WEAK_CUES.test(message)) return 'weak';
  return 'none';
}

export interface RecallResult {
  triggered: boolean;
  ranges: TimeRange[];
  /** Turns inside the referenced time ranges (or best topic matches when no date was given). */
  matches: TurnRecord[];
  /** Topic matches on other dates, used only when the referenced dates were empty. */
  nearby: TurnRecord[];
  memoryStart: Date | null;
}

const NOT_TRIGGERED: RecallResult = { triggered: false, ranges: [], matches: [], nearby: [], memoryStart: null };

/**
 * Deterministic episodic recall that runs before the model is called: no extra LLM
 * round-trip, and the model is told explicitly when nothing was found, which is what
 * stops it from inventing a past conversation.
 */
export class MemoryRecall {
  constructor(private readonly store: ConversationStore) {}

  async recall(input: { userId: string; message: string; now: Date; timezone: string }): Promise<RecallResult> {
    const cue = recallCue(input.message);
    const ranges = resolveTimeReferences(input.message, input.now, input.timezone).slice(0, 3);
    if (cue === 'none' || (cue === 'weak' && !ranges.length)) return NOT_TRIGGERED;

    const { userId } = input;
    const terms = topicTerms(input.message).slice(0, 12);
    const memoryStartP = this.store.firstTurnAt(userId);

    let matches: TurnRecord[] = [];
    let nearby: TurnRecord[] = [];
    if (ranges.length) {
      const perRange = await Promise.all(
        ranges.map(async (r) => {
          const byTopic = terms.length
            ? await this.store.findTurns({ userId, from: r.start, to: r.end, terms, limit: 5 })
            : [];
          // No topic words, or none matched: everything from that day is the candidate set.
          return byTopic.length ? byTopic : this.store.findTurns({ userId, from: r.start, to: r.end, limit: 6 });
        }),
      );
      matches = dedupe(perRange.flat());
      if (!matches.length && terms.length) nearby = await this.store.findTurns({ userId, terms, limit: 3 });
    } else {
      const byTopic = terms.length ? await this.store.findTurns({ userId, terms, limit: 4 }) : [];
      matches = byTopic.length ? byTopic : await this.store.findTurns({ userId, limit: 3 });
    }

    const byTime = (a: TurnRecord, b: TurnRecord) => a.createdAt.getTime() - b.createdAt.getTime();
    return {
      triggered: true,
      ranges,
      matches: matches.sort(byTime).slice(-6),
      nearby: nearby.sort(byTime),
      memoryStart: await memoryStartP,
    };
  }
}

function dedupe(turns: TurnRecord[]): TurnRecord[] {
  const seen = new Map<string, TurnRecord>();
  for (const t of turns) seen.set(t.id, t);
  return [...seen.values()];
}

export function toMemoryNote(r: RecallResult): MemoryNote {
  return {
    ranges: r.ranges.map((x) => x.label),
    matches: [...r.matches, ...r.nearby].map((t) => ({
      turnId: t.id,
      threadId: t.threadId,
      at: t.createdAt.toISOString(),
      question: t.question,
    })),
    empty: r.matches.length === 0,
  };
}

const stripCitations = (s: string) => s.replace(/\s?\[\d+(?:\s*[,–-]\s*\d+)*\](?!\()/g, '');

function renderTurn(t: TurnRecord, timezone: string, note?: string): string {
  const lines = [`### ${formatLocal(t.createdAt, timezone)}${note ? ` (${note})` : ''}`, `User asked: "${t.question}"`];
  const e = t.enrichment;
  if (e.summary) lines.push(`Summary of your answer: ${e.summary}`);
  if (e.claims.length) {
    lines.push('Facts you stated then (re-verify these if asked whether they still hold):');
    for (const c of e.claims.slice(0, 15)) {
      lines.push(`- ${c.subject} — ${c.attribute}: ${c.value}${c.sourceUrl ? ` (${c.sourceUrl})` : ''}`);
    }
  }
  const excerptLen = e.claims.length ? 900 : 1_800;
  const answer = stripCitations(t.answer);
  lines.push(`Your answer then${answer.length > excerptLen ? ' (excerpt)' : ''}:\n"""\n${answer.slice(0, excerptLen)}${answer.length > excerptLen ? ' …' : ''}\n"""`);
  const cited = t.sources.filter((s) => t.citedSourceIds.includes(s.id)).slice(0, 6);
  if (cited.length) lines.push(`Sources you used then: ${cited.map((s) => s.url).join(' , ')}`);
  if (t.status === 'aborted') lines.push('(This answer was cut off before it finished.)');
  return lines.join('\n');
}

/** Render recall into the prompt. Explicit about absence so the model never fills the gap. */
export function renderMemory(r: RecallResult, timezone: string): string {
  const out = ['# Memory of past conversations with this user'];
  if (r.ranges.length) {
    out.push(`Time references in the message, resolved: ${r.ranges.map((x) => `"${x.phrase}" → ${x.label}`).join('; ')}.`);
  }
  out.push(
    r.memoryStart
      ? `Your memory of this user starts on ${formatLocal(r.memoryStart, timezone, false)}.`
      : 'You have no earlier conversations with this user; this is the first one.',
  );

  if (r.matches.length) {
    out.push(`Found ${r.matches.length} past exchange(s)${r.ranges.length ? ' in that time' : ' that look relevant'}:`);
    for (const t of r.matches) out.push(renderTurn(t, timezone));
  } else {
    out.push(r.ranges.length ? 'No past conversations found in that time.' : 'No relevant past conversations found.');
    if (r.nearby.length) {
      out.push('Closest topic matches on other dates (the user may have the day wrong; say so if you use them):');
      for (const t of r.nearby) out.push(renderTurn(t, timezone, 'different date than referenced'));
    }
    out.push(
      'If the user is referring to an earlier conversation with you, say plainly that you have no record of it. ' +
        'Never guess what they asked or what you answered. Then still help: ask for the missing detail, ' +
        'or give a best-effort answer with your assumption stated.',
    );
  }
  return out.join('\n\n');
}
