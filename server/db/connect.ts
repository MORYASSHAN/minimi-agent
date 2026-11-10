import mongoose from 'mongoose';
import type { Logger } from '../lib/logger.js';
import { EMBEDDED_URI, startEmbeddedMongo } from './embedded.js';
import { ThreadModel, TurnModel } from './models.js';

export interface DbHandle {
  kind: 'external' | 'embedded';
  close(): Promise<void>;
}

interface ConnectOptions {
  uri?: string;
  logger: Logger;
  /** How long to wait for an embedded mongod started by another process (`npm run dev`). */
  waitMs: number;
  /** Start an in-process embedded mongod if none is reachable (one-off scripts, `npm start`). */
  startEmbeddedIfMissing: boolean;
}

export async function connectDatabase(opts: ConnectOptions): Promise<DbHandle> {
  mongoose.set('strictQuery', true);

  if (opts.uri) {
    await mongoose.connect(opts.uri, { serverSelectionTimeoutMS: 10_000 });
    await syncIndexes();
    opts.logger.info('connected to MongoDB', { kind: 'external' });
    return { kind: 'external', close: () => mongoose.disconnect() };
  }

  const deadline = Date.now() + opts.waitMs;
  let announced = false;
  for (;;) {
    try {
      await mongoose.connect(EMBEDDED_URI, { serverSelectionTimeoutMS: 1_500 });
      await syncIndexes();
      opts.logger.info('connected to MongoDB', { kind: 'embedded', uri: EMBEDDED_URI });
      return { kind: 'embedded', close: () => mongoose.disconnect() };
    } catch {
      await mongoose.disconnect().catch(() => {});
      if (Date.now() > deadline) break;
      if (!announced) {
        opts.logger.info('waiting for embedded MongoDB (first run downloads it once, ~1 min)…');
        announced = true;
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }

  if (!opts.startEmbeddedIfMissing) {
    throw new Error('MongoDB is not reachable. Set MONGODB_URI or run `npm run dev` (it starts an embedded MongoDB).');
  }
  opts.logger.info('starting embedded MongoDB in-process…');
  const server = await startEmbeddedMongo();
  await mongoose.connect(EMBEDDED_URI, { serverSelectionTimeoutMS: 10_000 });
  await syncIndexes();
  opts.logger.info('connected to MongoDB', { kind: 'embedded', uri: EMBEDDED_URI });
  return {
    kind: 'embedded',
    close: async () => {
      await mongoose.disconnect();
      await server.stop({ doCleanup: false });
    },
  };
}

async function syncIndexes(): Promise<void> {
  await Promise.all([ThreadModel.syncIndexes(), TurnModel.syncIndexes()]);
}
