import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const COOKIE = 'mid_uid';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Anonymous identity: a random id in an httpOnly cookie. Every query is scoped by it,
 * so adding real auth later means replacing this one middleware.
 */
export function identity(req: Request, res: Response, next: NextFunction) {
  let id = req.cookies?.[COOKIE] as string | undefined;
  if (!id || !UUID.test(id)) {
    id = randomUUID();
    res.cookie(COOKIE, id, { httpOnly: true, sameSite: 'lax', maxAge: 365 * 24 * 3600 * 1000, path: '/' });
  }
  res.locals.userId = id;
  next();
}

export function userIdOf(res: Response): string {
  return res.locals.userId as string;
}

/** Fixed-window limiter per user. In-memory; use Redis for multiple instances. */
export function rateLimit(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (_req: Request, res: Response, next: NextFunction) => {
    const key = userIdOf(res);
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
      return next();
    }
    if (++entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      res.status(429).json({ error: 'Too many requests. Give it a few seconds.' });
      return;
    }
    next();
  };
}
