import { forwardRef } from 'react';
import type { HealthInfo } from '../../shared/types';
import { PORTFOLIO_URL } from '../brand';
import { Composer, type ComposerHandle } from './Composer';

interface Props {
  health?: HealthInfo;
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

function Setup({ missing }: { missing: string[] }) {
  return (
    <div className="setup">
      <p className="setup__title">Almost ready</p>
      <ol>
        <li>
          Copy <code>.env.example</code> to <code>.env</code>.
        </li>
        <li>
          Add {missing.map((m, i) => (
            <span key={m}>
              {i > 0 && ' and '}
              <code>{m.split(' ')[0]}</code>
            </span>
          ))}
          .
        </li>
        <li>
          Restart <code>npm run dev</code> and reload this page.
        </li>
      </ol>
    </div>
  );
}

export const Home = forwardRef<ComposerHandle, Props>(function Home({ health, busy, onSend, onStop }, ref) {
  const ready = health ? health.ok : true;
  return (
    <div className="home fade-in">
      <div className="home__inner">
        <h1 className="serif home__title">What do you want to know?</h1>
        <p className="home__sub">Answers from the live web, with sources. Scout also remembers your past chats.</p>
        {ready ? (
          <Composer
            ref={ref}
            size="large"
            autoFocus
            busy={busy}
            onSend={onSend}
            onStop={onStop}
            placeholder="Ask anything…"
            maxWords={health?.limits.maxInputWords}
          />
        ) : (
          <Setup missing={health?.missing ?? []} />
        )}
      </div>
      <footer className="home__foot">
        Made by{' '}
        <a href={PORTFOLIO_URL} target="_blank" rel="noreferrer">
          Shaan
        </a>
      </footer>
    </div>
  );
});
