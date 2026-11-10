import { useState } from 'react';
import type { MemoryNote, SearchStep } from '../../shared/types';
import { shortDate } from '../time';

function memoryText(m: MemoryNote): string {
  const when = m.ranges.length ? ` from ${m.ranges.join(', ')}` : '';
  if (!m.empty) return `Found ${m.matches.length} past ${m.matches.length === 1 ? 'chat' : 'chats'}${when}`;
  const nearby = m.matches[0] ? `, closest is ${shortDate(m.matches[0].at)}` : '';
  return `No past chat found${when}${nearby}`;
}

/** One quiet status line while working; afterwards a summary you can expand. */
export function Activity({ memory, searches, working }: { memory?: MemoryNote; searches: SearchStep[]; working: boolean }) {
  const [open, setOpen] = useState(false);
  const running = searches.find((s) => s.status === 'running');

  if (working && !running) {
    return (
      <div className="status-line">
        <span className="spinner" />
        {searches.length ? 'Reading results' : memory ? 'Checking past chats' : 'Thinking'}
      </div>
    );
  }
  if (running) {
    return (
      <div className="status-line">
        <span className="spinner" />
        Searching for {running.queries.map((q) => `“${q}”`).join(', ')}
      </div>
    );
  }
  if (!memory && !searches.length) return null;

  const results = searches.reduce((n, s) => n + (s.resultCount ?? 0), 0);
  const summary = searches.length
    ? `Searched the web · ${results} ${results === 1 ? 'result' : 'results'}`
    : memoryText(memory!);

  return (
    <div className="activity">
      <button className="activity__toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {summary}
        <svg className={open ? 'is-open' : ''} viewBox="0 0 16 16" aria-hidden>
          <path d="M6 4l4 4-4 4" />
        </svg>
      </button>
      <div className={`activity__body ${open ? 'is-open' : ''}`}>
        <ul>
          {memory && <li>{memoryText(memory)}</li>}
          {searches.map((s) => (
            <li key={s.id}>
              {s.queries.map((q) => `“${q}”`).join(', ')}
              <span className="activity__meta">
                {s.since && ` · since ${shortDate(s.since)}`}
                {s.depth === 'deep' && ' · read full pages'}
                {s.status === 'error' && ' · search failed'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
