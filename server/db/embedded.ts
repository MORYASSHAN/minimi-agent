import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

export const EMBEDDED_PORT = 27018;
export const EMBEDDED_URI = `mongodb://127.0.0.1:${EMBEDDED_PORT}/minimi`;

/**
 * Zero-setup local MongoDB for development: a real mongod (downloaded once and cached),
 * persisted to ./.data/mongo so memory survives restarts. Production uses MONGODB_URI.
 */
export async function startEmbeddedMongo(): Promise<MongoMemoryServer> {
  const dbPath = resolve('.data/mongo');
  mkdirSync(dbPath, { recursive: true });
  return MongoMemoryServer.create({
    instance: { port: EMBEDDED_PORT, dbPath, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  });
}
