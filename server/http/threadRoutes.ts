import { Router } from 'express';
import type { ThreadDetail, ThreadSummary, TurnDTO } from '../../shared/types.js';
import type { ConversationStore, ThreadRecord, TurnRecord } from '../memory/store.js';
import { userIdOf } from './middleware.js';

const toSummary = (t: ThreadRecord): ThreadSummary => ({
  id: t.id,
  title: t.title,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
});

const toTurnDTO = (t: TurnRecord): TurnDTO => ({
  id: t.id,
  question: t.question,
  answer: t.answer,
  status: t.status === 'pending' ? 'aborted' : t.status,
  createdAt: t.createdAt.toISOString(),
  sources: t.sources,
  citedSourceIds: t.citedSourceIds,
  searches: t.searches,
  memory: t.memory,
  timings: t.timings,
});

export function threadRoutes(store: ConversationStore) {
  const router = Router();

  router.get('/', async (_req, res) => {
    const threads = await store.listThreads(userIdOf(res), 100);
    res.json(threads.map(toSummary));
  });

  router.get('/:id', async (req, res) => {
    const thread = await store.getThread(userIdOf(res), req.params.id);
    if (!thread) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const turns = await store.listTurns(thread.id);
    const detail: ThreadDetail = { ...toSummary(thread), turns: turns.map(toTurnDTO) };
    res.json(detail);
  });

  router.delete('/:id', async (req, res) => {
    const ok = await store.deleteThread(userIdOf(res), req.params.id);
    res.status(ok ? 204 : 404).end();
  });

  return router;
}
