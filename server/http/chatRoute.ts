import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AgentEvent } from '../../shared/types.js';
import { countWords, missingConfig, type AppConfig } from '../config.js';
import type { Services } from '../container.js';
import type { Logger } from '../lib/logger.js';
import { userIdOf } from './middleware.js';

const ChatBody = z.object({
  message: z.string().trim().min(1).max(8_000),
  threadId: z.string().max(64).optional(),
  timezone: z.string().max(64).optional(),
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Messages this user sent in the last 24 hours. */
export function usedToday(services: Services, userId: string): Promise<number> {
  return services.store.countTurnsSince(userId, new Date(services.clock.now().getTime() - DAY_MS));
}

/** POST /api/chat → Server-Sent Events stream of AgentEvents. */
export function chatHandler(services: Services, limits: AppConfig['limits'], logger: Logger) {
  // One turn at a time per thread, so answers can't interleave.
  const busyThreads = new Set<string>();

  return async (req: Request, res: Response) => {
    const body = ChatBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'Send {"message": "..."}' });
      return;
    }
    const agent = services.agent;
    if (!agent) {
      res.status(503).json({ error: `Add ${missingConfig().join(' and ')} to .env and restart.` });
      return;
    }
    const { message, threadId, timezone } = body.data;

    // Usage limits: checked before any model or search call is made.
    const words = countWords(message);
    if (words > limits.maxInputWords) {
      res.status(413).json({ error: `Please keep questions under ${limits.maxInputWords} words (this one has ${words}).` });
      return;
    }
    if ((await usedToday(services, userIdOf(res))) >= limits.dailyMessages) {
      res.status(429).json({ error: `You've reached the limit of ${limits.dailyMessages} messages in 24 hours. Please try again later.` });
      return;
    }

    if (threadId && busyThreads.has(threadId)) {
      res.status(409).json({ error: 'Still answering the previous message in this chat.' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) controller.abort();
    });
    const send = (event: AgentEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
    let lockedThread: string | undefined;

    try {
      for await (const event of agent.run({ userId: userIdOf(res), threadId, message, timezone: timezone ?? 'UTC' }, controller.signal)) {
        if (event.type === 'thread') {
          lockedThread = event.threadId;
          busyThreads.add(event.threadId);
        }
        send(event);
      }
    } catch (err) {
      logger.error('chat stream crashed', { error: err instanceof Error ? err.message : String(err) });
      if (!controller.signal.aborted) send({ type: 'error', message: 'Something went wrong. Please try again.', retryable: true });
    } finally {
      clearInterval(heartbeat);
      if (lockedThread) busyThreads.delete(lockedThread);
      res.end();
    }
  };
}
