import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HealthInfo } from '../shared/types';
import { api } from './api';
import { BRAND, Logo } from './brand';
import { Composer, type ComposerHandle } from './components/Composer';
import { GlowGrid } from './components/GlowGrid';
import { Home } from './components/Home';
import { HowItWorks } from './components/HowItWorks';
import { Sidebar } from './components/Sidebar';
import { TurnView } from './components/TurnView';
import { useChat } from './useChat';

type View = 'chat' | 'how';

export function App() {
  const chat = useChat();
  const [health, setHealth] = useState<HealthInfo>();
  const [view, setView] = useState<View>(() => (window.location.hash === '#/how' ? 'how' : 'chat'));
  const [drawer, setDrawer] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const stick = useRef(true);

  // Health also carries usage (messages left today), so refresh it after every answer.
  useEffect(() => {
    if (!chat.busy) api.health().then(setHealth).catch(() => {});
  }, [chat.busy]);

  const inThread = chat.turns.length > 0 || !!chat.threadId;
  const showHome = view === 'chat' && !inThread;

  const goChat = useCallback(() => {
    setView('chat');
    setDrawer(false);
    if (window.location.hash === '#/how') window.history.pushState(null, '', window.location.pathname);
  }, []);

  const newChat = useCallback(() => {
    chat.newChat();
    goChat();
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [chat, goChat]);

  // Ctrl/Cmd+K: new chat. "/": focus the input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        newChat();
      } else if (e.key === '/' && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        composerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newChat]);

  // Follow the answer as it streams, unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (el && view === 'chat' && inThread && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat.turns, view, inThread]);

  const onScroll = () => {
    const el = mainRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };

  const send = (text: string) => {
    stick.current = true;
    void chat.send(text);
    requestAnimationFrame(() => mainRef.current?.scrollTo({ top: mainRef.current.scrollHeight, behavior: 'smooth' }));
  };

  return (
    <div className="app">
      <GlowGrid visible={showHome || view === 'how'} />
      <Sidebar
        threads={chat.threads}
        activeId={chat.threadId}
        health={health}
        open={drawer}
        onClose={() => setDrawer(false)}
        onNew={newChat}
        onOpen={(id) => {
          goChat();
          void chat.openThread(id);
        }}
        onDelete={(id) => void chat.removeThread(id)}
        onHow={() => {
          setView('how');
          setDrawer(false);
          window.history.pushState(null, '', '#/how');
          mainRef.current?.scrollTo({ top: 0 });
        }}
        howActive={view === 'how'}
      />

      <main className="main" ref={mainRef} onScroll={onScroll}>
        <header className="topbar">
          <button className="icon-btn" onClick={() => setDrawer(true)} aria-label="Open chats">
            <svg viewBox="0 0 20 20" aria-hidden>
              <path d="M3 6h14M3 10h14M3 14h9" />
            </svg>
          </button>
          <span className="topbar__brand">
            <Logo size={18} />
            {BRAND}
          </span>
          <button className="icon-btn" onClick={newChat} aria-label="New chat">
            <svg viewBox="0 0 20 20" aria-hidden>
              <path d="M10 4v12M4 10h12" />
            </svg>
          </button>
        </header>

        {view === 'how' ? (
          <HowItWorks />
        ) : showHome ? (
          <Home ref={composerRef} health={health} busy={chat.busy} onSend={send} onStop={chat.stop} />
        ) : (
          <div className="thread-view view">
            <div className="chat">
              {chat.loadError && <div className="alert">{chat.loadError}</div>}
              {chat.turns.map((t) => (
                <TurnView key={t.key} turn={t} onRetry={chat.retry} />
              ))}
            </div>
            <div className="dock">
              <div className="dock__inner">
                <Composer
                  ref={composerRef}
                  busy={chat.busy}
                  disabled={health ? !health.ok : false}
                  onSend={send}
                  onStop={chat.stop}
                  autoFocus
                  placeholder="Ask a follow-up…"
                  maxWords={health?.limits.maxInputWords}
                />
                <p className="dock__hint">Scout searches the live web and can still be wrong. Check the sources.</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
