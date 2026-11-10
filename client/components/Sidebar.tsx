import type { HealthInfo, ThreadSummary } from '../../shared/types';
import { BRAND, Logo } from '../brand';
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

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function Sidebar(p: Props) {
  const groups = new Map<string, ThreadSummary[]>();
  for (const t of p.threads ?? []) {
    const key = bucketOf(t.updatedAt);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  return (
    <>
      <div className={`scrim ${p.open ? 'scrim--on' : ''}`} onClick={p.onClose} />
      <aside className={`sidebar ${p.open ? 'sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <span className="brandmark">
            <Logo size={20} />
          </span>
          <span className="wordmark">{BRAND}</span>
        </div>

        <button className="newchat" onClick={p.onNew}>
          <span>New chat</span>
          <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>

        <nav className="threads" aria-label="Past chats">
          {p.threads === null && (
            <div className="threads__skeleton">
              <span />
              <span />
              <span />
            </div>
          )}
          {p.threads?.length === 0 && <p className="threads__empty">Your chats show up here. Scout remembers them by date, so you can ask about them later.</p>}
          {[...groups.entries()].map(([label, items]) => (
            <div key={label} className="threads__group">
              <div className="mono-label mono-label--dim threads__label">{label}</div>
              {items.map((t) => (
                <div key={t.id} className={`thread ${t.id === p.activeId && !p.howActive ? 'thread--active' : ''}`}>
                  <button className="thread__title" onClick={() => p.onOpen(t.id)} title={t.title}>
                    {t.title}
                  </button>
                  <button
                    className="thread__del"
                    aria-label={`Delete "${t.title}"`}
                    onClick={() => {
                      if (confirm('Delete this chat? Scout will forget it.')) p.onDelete(t.id);
                    }}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden>
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar__foot">
          <button className={`navlink ${p.howActive ? 'navlink--active' : ''}`} onClick={p.onHow}>
            How it works
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M5 11l6-6M6 5h5v5" />
            </svg>
          </button>
          {p.health && (
            <div className="status" title={p.health.missing.length ? `Missing: ${p.health.missing.join(', ')}` : 'Connected'}>
              <span className={`status__dot ${p.health.ok ? '' : 'status__dot--warn'}`} />
              <span>{p.health.ok ? p.health.model : 'Setup needed'}</span>
              {p.health.ok && <span className="status__sep">·</span>}
              {p.health.ok && <span>{p.health.searchProviders[0]}</span>}
            </div>
          )}
          {p.health?.ok && (
            <div className="usage" title="Messages per 24 hours, set by DAILY_MESSAGE_LIMIT">
              <div className="usage__bar">
                <span style={{ width: `${Math.min(100, (p.health.limits.usedToday / p.health.limits.dailyMessages) * 100)}%` }} />
              </div>
              <span className="mono-label mono-label--dim">
                {Math.max(0, p.health.limits.dailyMessages - p.health.limits.usedToday)} of {p.health.limits.dailyMessages} messages left today
              </span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
