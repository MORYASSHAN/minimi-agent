import { useState } from 'react';
import type { MemoryNote, SearchStep } from '../../shared/types';
import { shortDate } from '../time';

const Spinner = () => <span className="spinner" aria-hidden />;

const Chevron = () => (
  <svg className="chev" viewBox="0 0 16 16" aria-hidden>
    <path d="M4 6l4 4 4-4" />
  </svg>
);

const GlobeIcon = () => (
  <svg className="ico" viewBox="0 0 16 16" aria-hidden>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M1.8 8h12.4M8 1.8c1.8 1.9 2.6 3.9 2.6 6.2S9.8 12.3 8 14.2C6.2 12.3 5.4 10.3 5.4 8S6.2 3.7 8 1.8z" />
  </svg>
);

function memoryText(m: MemoryNote): string {
  const when = m.ranges.length ? ` from ${m.ranges.join(', ')}` : '';
  if (!m.empty) return `Recalled ${m.matches.length} past ${m.matches.length === 1 ? 'chat' : 'chats'}${when}`;
  const nearby = m.matches[0] ? ` (closest: ${shortDate(m.matches[0].at)})` : '';
  return `No past chat found${when}${nearby}`;
}

/** Collapsible "what I did" panel: open while working, folds away once the answer starts. */
export function Activity({ memory, searches, working }: { memory?: MemoryNote; searches: SearchStep[]; working: boolean }) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const running = searches.some((s) => s.status === 'running');
  if (!memory && !searches.length) {
    return working ? (
      <div className="steps steps--solo">
        <div className="steps__head">
          <Spinner />
          <span className="shimmer">Thinking</span>
        </div>
      </div>
    ) : null;
  }

  const open = userOpen ?? running;
  const results = searches.reduce((n, s) => n + (s.resultCount ?? 0), 0);
  const queries = searches.reduce((n, s) => n + s.queries.length, 0);
  const secs = searches.reduce((n, s) => n + (s.ms ?? 0), 0) / 1000;
  const label = running ? 'Searching the web' : searches.length ? 'Searched the web' : 'Checked your past chats';

  return (
    <div className={`steps ${open ? 'steps--open' : ''}`}>
      <button className="steps__head" onClick={() => setUserOpen(!open)} aria-expanded={open}>
        {running ? <Spinner /> : <GlobeIcon />}
        <span className={running ? 'shimmer' : ''}>{label}</span>
        {!running && searches.length > 0 && (
          <span className="steps__meta">
            {queries} {queries === 1 ? 'query' : 'queries'} · {results} results · {secs.toFixed(1)}s
          </span>
        )}
        {!searches.length && memory && <span className="steps__meta">{memory.empty ? 'nothing on that date' : `${memory.matches.length} found`}</span>}
        <Chevron />
      </button>
      <div className="steps__body">
        <div className="steps__inner">
          {memory && (
            <div className="step">
              <span className="step__dot step__dot--mem" />
              <span>{memoryText(memory)}</span>
            </div>
          )}
          {searches.map((s) => (
            <div className="step" key={s.id}>
              <span className={`step__dot ${s.status === 'error' ? 'step__dot--err' : s.status === 'running' ? 'step__dot--live' : ''}`} />
              <div className="step__body">
                <div className="step__queries">
                  {s.queries.map((q) => (
                    <span className="qchip" key={q}>
                      {q}
                    </span>
                  ))}
                </div>
                <div className="step__meta">
                  {s.depth === 'deep' ? 'Read full pages' : 'Quick search'}
                  {s.since && ` · since ${shortDate(s.since)}`}
                  {s.status === 'done' && ` · ${s.resultCount ?? 0} results`}
                  {s.status === 'error' && ' · search failed, answering with what I have'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
