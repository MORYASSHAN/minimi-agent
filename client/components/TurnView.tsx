import { memo, useRef, useState } from 'react';
import type { Source } from '../../shared/types';
import type { UiTurn } from '../useChat';
import { useSmoothText } from '../useSmoothText';
import { Activity } from './Activity';
import { Markdown } from './Markdown';

function Sources({ turn }: { turn: UiTurn }) {
  const [all, setAll] = useState(false);
  const cited = turn.citedSourceIds.map((id) => turn.sources.find((s) => s.id === id)).filter((s): s is Source => !!s);
  const rest = turn.sources.filter((s) => !turn.citedSourceIds.includes(s.id));
  const list = cited.length && !all ? cited : [...cited, ...rest];
  if (!list.length) return null;
  return (
    <section className="sources" aria-label="Sources">
      <div className="sources__list">
        {list.map((s) => (
          <a key={s.id} className="source" href={s.url} target="_blank" rel="noreferrer" title={s.snippet}>
            <span className="source__site">
              <span className="source__n">{s.id}</span>
              {s.domain}
            </span>
            <span className="source__title">{s.title}</span>
          </a>
        ))}
      </div>
      {cited.length > 0 && rest.length > 0 && (
        <button className="link-btn" onClick={() => setAll((v) => !v)}>
          {all ? 'Show cited sources only' : `Show all ${turn.sources.length} sources`}
        </button>
      )}
    </section>
  );
}

function Actions({ turn }: { turn: UiTurn }) {
  const [copied, setCopied] = useState(false);
  const t = turn.timings;
  return (
    <div className="actions">
      <button
        className="link-btn"
        onClick={async () => {
          await navigator.clipboard.writeText(turn.answer);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      {t && <span className="actions__time">{(t.totalMs / 1000).toFixed(1)}s</span>}
    </div>
  );
}

export const TurnView = memo(function TurnView({ turn, onRetry }: { turn: UiTurn; onRetry: (key: string) => void }) {
  // Turns that started live in this session reveal their text smoothly; loaded history appears at once.
  const animate = useRef(turn.status === 'thinking' || turn.status === 'streaming').current;
  const text = useSmoothText(turn.answer, animate);
  const live = turn.status === 'thinking' || turn.status === 'streaming' || text.length < turn.answer.length;

  return (
    <article className="turn">
      <p className="turn__q">{turn.question}</p>
      <div className="turn__a">
        <Activity memory={turn.memory} searches={turn.searches} working={turn.status === 'thinking'} />
        {text && (
          <div className={`answer ${live ? 'is-live' : ''}`}>
            <Markdown text={text} sources={turn.sources} />
          </div>
        )}
        {turn.status === 'aborted' && <p className="note">Stopped.</p>}
        {turn.status === 'error' && (
          <div className="error">
            <span>{turn.error?.message ?? 'Something went wrong.'}</span>
            {turn.error?.retryable !== false && (
              <button className="btn btn--quiet" onClick={() => onRetry(turn.key)}>
                Try again
              </button>
            )}
          </div>
        )}
        {!live && turn.status === 'complete' && (
          <>
            <Sources turn={turn} />
            <Actions turn={turn} />
          </>
        )}
      </div>
    </article>
  );
});
