import type { HealthInfo, ThreadSummary } from '../../shared/types';
import { ArrowUpRight, BRAND, Logo, PORTFOLIO_URL } from '../brand';
import { bucketOf } from '../time';

interface Props {
  threads: ThreadSummary[] | null;
  activeId?: string;
  health?: HealthInfo;
  open: boolean;
  onClose: () => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onHow: () => void;
  howActive: boolean;
}

export function Sidebar(p: Props) {
  const groups = new Map<string, ThreadSummary[]>();
  for (const t of p.threads ?? []) {
    const key = bucketOf(t.updatedAt);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const left = p.health ? Math.max(0, p.health.limits.dailyMessages - p.health.limits.usedToday) : undefined;

  return (
    <>
      <div className={`scrim ${p.open ? 'is-on' : ''}`} onClick={p.onClose} />
      <aside className={`sidebar ${p.open ? 'is-open' : ''}`}>
        <div className="sidebar__brand">
          <Logo />
          <span>{BRAND}</span>
        </div>

        <button className="btn btn--primary btn--block" onClick={p.onNew}>
          New chat
        </button>

        <nav className="history" aria-label="Past chats">
          {p.threads?.length === 0 && <p className="history__empty">No chats yet.</p>}
          {[...groups.entries()].map(([label, items]) => (
            <section key={label} className="history__group">
              <h2 className="history__label">{label}</h2>
              {items.map((t) => (
                <div key={t.id} className={`chat-link ${t.id === p.activeId && !p.howActive ? 'is-active' : ''}`}>
                  <button className="chat-link__title" onClick={() => p.onOpen(t.id)} title={t.title}>
                    {t.title}
                  </button>
                  <button
                    className="chat-link__del"
                    aria-label={`Delete "${t.title}"`}
                    onClick={() => {
                      if (confirm('Delete this chat? Scout will forget it.')) p.onDelete(t.id);
                    }}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden>
                      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
                    </svg>
                  </button>
                </div>
              ))}
            </section>
          ))}
        </nav>

        <div className="sidebar__foot">
          <button className={`foot-link ${p.howActive ? 'is-active' : ''}`} onClick={p.onHow}>
            How it works
          </button>
          <a className="foot-link" href={PORTFOLIO_URL} target="_blank" rel="noreferrer">
            Portfolio <ArrowUpRight />
          </a>
          {p.health && (
            <p className="sidebar__meta">
              {p.health.ok ? `${p.health.model} · ${left} messages left today` : 'Not set up yet'}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
