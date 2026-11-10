import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent, MemoryNote, SearchStep, Source, ThreadSummary, TurnDTO, TurnTimings } from '../shared/types';
import { api, streamChat } from './api';

export interface UiTurn {
  key: string;
  question: string;
  answer: string;
  status: 'thinking' | 'streaming' | 'complete' | 'aborted' | 'error';
  sources: Source[];
  citedSourceIds: number[];
  searches: SearchStep[];
  memory?: MemoryNote;
  timings?: TurnTimings;
  error?: { message: string; retryable: boolean };
}

const fromDTO = (t: TurnDTO): UiTurn => ({ ...t, key: t.id, status: t.status });

const threadFromHash = () => /^#\/c\/([a-f0-9]{24})$/.exec(window.location.hash)?.[1];

export function useChat() {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [threadId, setThreadId] = useState<string | undefined>();
  const [turns, setTurns] = useState<UiTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const abortRef = useRef<AbortController | null>(null);
  const threadIdRef = useRef<string | undefined>(undefined);
  threadIdRef.current = threadId;

  const refreshThreads = useCallback(async () => {
    try {
      setThreads(await api.threads());
    } catch {
      setThreads((t) => t ?? []);
    }
  }, []);

  const openThread = useCallback(async (id: string) => {
    abortRef.current?.abort();
    setThreadId(id);
    setLoadError(undefined);
    if (window.location.hash !== `#/c/${id}`) window.history.pushState(null, '', `#/c/${id}`);
    try {
      const detail = await api.thread(id);
      if (threadIdRef.current === id) setTurns(detail.turns.map(fromDTO));
    } catch {
      setLoadError("Couldn't load that conversation.");
      setTurns([]);
    }
  }, []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    setThreadId(undefined);
    setTurns([]);
    setLoadError(undefined);
    if (window.location.hash.startsWith('#/c/')) window.history.pushState(null, '', window.location.pathname);
  }, []);

  useEffect(() => {
    void refreshThreads();
    const id = threadFromHash();
    if (id) void openThread(id);
    const onPop = () => {
      const next = threadFromHash();
      if (next && next !== threadIdRef.current) void openThread(next);
      if (!next && window.location.hash === '') newChat();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [refreshThreads, openThread, newChat]);

  const patch = (key: string, fn: (t: UiTurn) => UiTurn) => setTurns((ts) => ts.map((t) => (t.key === key ? fn(t) : t)));

  const send = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text || busy) return;
      const key = `local-${Date.now()}`;
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setTurns((ts) => [
        ...ts,
        { key, question: text, answer: '', status: 'thinking', sources: [], citedSourceIds: [], searches: [] },
      ]);

      // Batch token deltas into one render per animation frame.
      let pending = '';
      let frame = 0;
      const flush = () => {
        frame = 0;
        if (!pending) return;
        const chunk = pending;
        pending = '';
        patch(key, (t) => ({ ...t, status: 'streaming', answer: t.answer + chunk }));
      };

      const onEvent = (e: AgentEvent) => {
        switch (e.type) {
          case 'thread':
            if (threadIdRef.current !== e.threadId) {
              setThreadId(e.threadId);
              threadIdRef.current = e.threadId;
              window.history.pushState(null, '', `#/c/${e.threadId}`);
              void refreshThreads();
            }
            break;
          case 'memory':
            patch(key, (t) => ({ ...t, memory: e.memory }));
            break;
          case 'search':
            patch(key, (t) => {
              const exists = t.searches.some((s) => s.id === e.step.id);
              return { ...t, searches: exists ? t.searches.map((s) => (s.id === e.step.id ? e.step : s)) : [...t.searches, e.step] };
            });
            break;
          case 'sources':
            patch(key, (t) => ({ ...t, sources: [...t.sources, ...e.sources.filter((s) => !t.sources.some((x) => x.id === s.id))] }));
            break;
          case 'text':
            pending += e.delta;
            frame ||= requestAnimationFrame(flush);
            break;
          case 'text_reset':
            pending = '';
            patch(key, (t) => ({ ...t, answer: '', status: 'thinking' }));
            break;
          case 'done':
            pending = '';
            patch(key, (t) => ({ ...t, key: e.turnId, answer: e.answer, status: 'complete', citedSourceIds: e.citedSourceIds, timings: e.timings }));
            break;
          case 'error':
            patch(key, (t) => ({ ...t, status: 'error', error: { message: e.message, retryable: e.retryable } }));
            break;
        }
      };

      try {
        await streamChat({ message: text, threadId: threadIdRef.current }, controller.signal, onEvent);
      } catch (err) {
        if (controller.signal.aborted) {
          flush();
          patch(key, (t) => (t.status === 'complete' ? t : { ...t, status: 'aborted' }));
        } else {
          patch(key, (t) => ({
            ...t,
            status: 'error',
            error: { message: err instanceof Error ? err.message : 'Connection lost.', retryable: true },
          }));
        }
      } finally {
        if (frame) cancelAnimationFrame(frame);
        setBusy(false);
        abortRef.current = null;
        void refreshThreads();
        // Titles are written by the background memory job a moment later.
        setTimeout(() => void refreshThreads(), 4_000);
      }
    },
    [busy, refreshThreads],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const retry = useCallback(
    (key: string) => {
      const turn = turns.find((t) => t.key === key);
      if (!turn) return;
      setTurns((ts) => ts.filter((t) => t.key !== key));
      void send(turn.question);
    },
    [turns, send],
  );

  const removeThread = useCallback(
    async (id: string) => {
      await api.deleteThread(id).catch(() => {});
      if (threadIdRef.current === id) newChat();
      void refreshThreads();
    },
    [newChat, refreshThreads],
  );

  return { threads, threadId, turns, busy, loadError, send, stop, retry, openThread, newChat, removeThread, refreshThreads };
}
