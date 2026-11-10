import { forwardRef } from 'react';
import type { HealthInfo } from '../../shared/types';
import { BRAND } from '../brand';
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
      <div className="mono-label mono-label--accent">/ Setup</div>
      <h2>Connect a model and a search API</h2>
      <ol className="setup__steps">
        <li>
          <span className="setup__n">01</span>
          <div>
            Copy <code>.env.example</code> to <code>.env</code> in the project folder.
          </div>
        </li>
        <li>
          <span className="setup__n">02</span>
          <div>
            Add {missing.map((m, i) => (
              <span key={m}>
                {i > 0 && ' and '}
                <code>{m.split(' ')[0]}</code>
              </span>
            ))}
            . MongoDB is optional: leave <code>MONGODB_URI</code> empty and a local database starts on its own.
          </div>
        </li>
        <li>
          <span className="setup__n">03</span>
          <div>
            Restart <code>npm run dev</code> and refresh this page.
          </div>
        </li>
      </ol>
    </div>
  );
}

export const Home = forwardRef<ComposerHandle, Props>(function Home({ health, busy, onSend, onStop }, ref) {
  const ready = health ? health.ok : true;
  return (
    <div className="home view">
      <div className="home__inner">
        <div className="mono-label mono-label--accent home__eyebrow">/ Live web search</div>
        <h1 className="display">
          Ask anything.
          <br />
          <span className="hl">Get answers from the live web.</span>
        </h1>
        <p className="lead">
          {BRAND} searches the web while you wait, cites every source, and remembers your past chats by date.
        </p>
        {ready ? (
          <>
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
            <div className="home__hints">
              <span className="mono-label mono-label--dim">Enter to send</span>
              <span className="mono-label mono-label--dim">Shift + Enter for a new line</span>
              {health && <span className="mono-label mono-label--dim">Up to {health.limits.maxInputWords} words</span>}
            </div>
          </>
        ) : (
          <Setup missing={health?.missing ?? []} />
        )}
      </div>
    </div>
  );
});
