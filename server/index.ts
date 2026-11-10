import { config, missingConfig } from './config.js';
import { createServices } from './container.js';
import { connectDatabase } from './db/connect.js';
import { MongoStore } from './db/mongoStore.js';
import { createApp } from './http/app.js';
import { fixedClock, systemClock } from './lib/clock.js';
import { createLogger } from './lib/logger.js';

const logger = createLogger(config.logLevel);
const clock = config.fixedNow ? fixedClock(config.fixedNow) : systemClock;

// Under `npm run dev` the embedded MongoDB runs as its own process (scripts/dev-db.ts),
// so API hot-reloads don't restart the database. Elsewhere we start it in-process if needed.
const devManagedDb = process.argv.includes('--wait-for-db');
const db = await connectDatabase({
  uri: config.mongoUri,
  logger,
  waitMs: devManagedDb ? 180_000 : 1_500,
  startEmbeddedIfMissing: !devManagedDb,
});

const services = createServices(config, new MongoStore(), clock, logger);
const app = createApp({ config, services, logger, database: db.kind });

const server = app.listen(config.port, () => {
  logger.info(`API ready on http://localhost:${config.port}`, {
    model: config.llm.chatModel,
    search: services.search?.providerNames.join('>') ?? 'none',
    ...(config.fixedNow && { clock: `pinned to ${config.fixedNow}` }),
  });
  const missing = missingConfig();
  if (missing.length) logger.warn(`Missing ${missing.join(', ')}. Copy .env.example to .env and fill it in.`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);
  server.close();
  // Let in-flight memory enrichment finish, but don't hang forever.
  await Promise.race([services.queue.drain(), new Promise((r) => setTimeout(r, 5_000))]);
  await db.close().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
