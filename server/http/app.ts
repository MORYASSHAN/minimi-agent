import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { missingConfig, type AppConfig } from '../config.js';
import type { Services } from '../container.js';
import type { Logger } from '../lib/logger.js';
import { chatHandler, usedToday } from './chatRoute.js';
import { identity, rateLimit, userIdOf } from './middleware.js';
import { threadRoutes } from './threadRoutes.js';
import type { HealthInfo } from '../../shared/types.js';

export interface AppDeps {
  config: AppConfig;
  services: Services;
  logger: Logger;
  database: 'external' | 'embedded';
}

export function createApp(deps: AppDeps) {
  const { services, config, logger } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());
  app.use('/api', identity);

  app.get('/api/health', async (_req, res) => {
    const info: HealthInfo = {
      ok: missingConfig().length === 0,
      model: config.llm.chatModel,
      searchProviders: services.search?.providerNames ?? [],
      missing: missingConfig(),
      database: deps.database,
      limits: {
        maxInputWords: config.limits.maxInputWords,
        dailyMessages: config.limits.dailyMessages,
        usedToday: await usedToday(services, userIdOf(res)),
      },
    };
    res.json(info);
  });

  app.use('/api/threads', threadRoutes(services.store));
  app.post('/api/chat', rateLimit(20, 60_000), chatHandler(services, config.limits, logger));

  // Production: serve the built React app from the same origin.
  const clientDir = resolve('dist/client');
  if (existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve(clientDir, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('request failed', { error: err instanceof Error ? err.message : String(err) });
    if (!res.headersSent) res.status(500).json({ error: 'Internal error' });
  });

  return app;
}
