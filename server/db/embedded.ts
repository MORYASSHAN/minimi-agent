import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

export const EMBEDDED_PORT = 27018;
export const EMBEDDED_URI = `mongodb://127.0.0.1:${EMBEDDED_PORT}/minimi`;

// Local MongoDB for development, kept in .data/mongo between runs.
export async function startEmbeddedMongo(): Promise<MongoMemoryServer> {
  const dbPath = resolve('.data/mongo');
  mkdirSync(dbPath, { recursive: true });
  return MongoMemoryServer.create({
    instance: { port: EMBEDDED_PORT, dbPath, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  });
}
