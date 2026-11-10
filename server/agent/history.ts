import type { ChatMessage } from '../llm/types.js';
import type { TurnRecord } from '../memory/store.js';

// Earlier turns are replayed as answers plus the sources they cited, not the raw search
// results. Newest turns win when the budget runs out.
export function buildHistory(turns: TurnRecord[], charBudget: number): ChatMessage[] {
  const pairs: ChatMessage[][] = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!;
    if (!t.answer.trim() || (t.status !== 'complete' && t.status !== 'aborted')) continue;
    const cited = t.sources.filter((s) => t.citedSourceIds.includes(s.id));
    const sourceNote = cited.length ? `\n\nSources cited above: ${cited.map((s) => `[${s.id}] ${s.title} — ${s.url}`).join('; ')}` : '';
    const answer = t.answer + (t.status === 'aborted' ? '\n\n(answer was interrupted)' : '') + sourceNote;
    const size = t.question.length + answer.length;
    if (used + size > charBudget && pairs.length > 0) break;
    used += size;
    pairs.unshift([
      { role: 'user', content: t.question },
      { role: 'assistant', content: answer },
    ]);
  }
  return pairs.flat();
}
