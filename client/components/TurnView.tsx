import { memo, useRef, useState } from 'react';
import type { Source } from '../../shared/types';
import { BRAND, Logo } from '../brand';
import type { UiTurn } from '../useChat';
import { useSmoothText } from '../useSmoothText';
import { Activity } from './Activity';
import { Markdown } from './Markdown';

function SourceCard({ source }: { source: Source }) {
  return (
    <a className="src" href={source.url} target="_blank" rel="noreferrer" title={source.snippet}>
      <span className="src__top">
        <span className="src__fav">{source.domain[0]?.toUpperCase()}</span>
        <span className="src__domain">{source.domain}</span>
        <span className="src__num">{source.id}</span>
      </span>
      <span className="src__title">{source.title}</span>
    </a>
  );
}

function Sources({ turn }: { turn: UiTurn }) {
  const [all, setAll] = useState(false);
  if (!turn.sources.length || turn.status === 'thinking') return null;
  const cited = turn.citedSourceIds.map((id) => turn.sources.find((s) => s.id === id)).filter((s): s is Source => !!s);
  const rest = turn.sources.filter((s) => !turn.citedSourceIds.includes(s.id));
  const list = cited.length && !all ? cited : [...cited, ...rest];
  return (
    <section className="sources" aria-label="Sources">
      <div className="sources__head">
        <span className="mono-label">Sources</span>
        {cited.length > 0 && rest.length > 0 && (
          <button className="text-btn" onClick={() => setAll((v) => !v)}>
            {all ? 'Show cited only' : `Show all ${turn.sources.length}`}
          </button>
        )}
      </div>
      <div className="sources__row">
        {list.map((s) => (
          <SourceCard key={s.id} source={s} />
        ))}
      </div>
    </section>
  );
}

function Footer({ turn }: { turn: UiTurn }) {
  const [copied, setCopied] = useState(false);
  if (turn.status !== 'complete') return null;
  const t = turn.timings;
  return (
    <div className="turn__foot">
      <button
        className="pill-btn"
        onClick={async () => {
          await navigator.clipboard.writeText(turn.answer);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      {t && (
        <span className="mono-label mono-label--dim">
          {(t.totalMs / 1000).toFixed(1)}s
          {t.firstTokenMs != null && ` · first word ${(t.firstTokenMs / 1000).toFixed(1)}s`}
        </span>
      )}
    </div>
  );
}

export const TurnView = memo(function TurnView({ turn, onRetry }: { turn: UiTurn; onRetry: (key: string) => void }) {
  // Only turns that started live in this session animate; history renders instantly.
  const animate = useRef(turn.status === 'thinking' || turn.status === 'streaming').current;
  const text = useSmoothText(turn.answer, animate);
  const live = turn.status === 'thinking' || turn.status === 'streaming' || text.length < turn.answer.length;

  return (
    <article className="turn">
      <div className="turn__q">
        <p>{turn.question}</p>
      </div>
      <div className="turn__a">
        <div className="turn__who">
          <span className="turn__logo">
            <Logo size={16} />
          </span>
          <span className="mono-label">{BRAND}</span>
        </div>
        <Activity memory={turn.memory} searches={turn.searches} working={turn.status === 'thinking'} />
        {text && (
          <div className={live ? 'answer answer--live' : 'answer'}>
            <Markdown text={text} sources={turn.sources} />
          </div>
        )}
        {turn.status === 'aborted' && <p className="note">Stopped.</p>}
        {turn.status === 'error' && (
          <div className="alert">
            <span>{turn.error?.message ?? 'Something went wrong.'}</span>
            {turn.error?.retryable !== false && (
              <button className="pill-btn" onClick={() => onRetry(turn.key)}>
                Try again
              </button>
            )}
          </div>
        )}
        {!live && <Sources turn={turn} />}
        {!live && <Footer turn={turn} />}
      </div>
    </article>
  );
});
