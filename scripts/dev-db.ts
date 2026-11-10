// Runs the embedded MongoDB as its own process so API reloads don't restart it.
// Does nothing when MONGODB_URI is set.
import { connect } from 'node:net';
import { config } from '../server/config.js';
import { EMBEDDED_PORT, EMBEDDED_URI, startEmbeddedMongo } from '../server/db/embedded.js';

const portInUse = () =>
  new Promise<boolean>((resolve) => {
    const socket = connect({ port: EMBEDDED_PORT, host: '127.0.0.1' });
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => resolve(false));
  });

if (config.mongoUri) {
  console.log('Using MONGODB_URI from .env, embedded MongoDB not needed.');
  process.exit(0);
}

if (await portInUse()) {
  console.log(`MongoDB already running on ${EMBEDDED_URI}, reusing it.`);
  setInterval(() => {}, 1 << 30);
} else {
  console.log('Starting embedded MongoDB (first run downloads it once, about a minute)…');
  const server = await startEmbeddedMongo().catch((err: unknown) => {
    console.error(
      `\nCould not start the embedded MongoDB: ${err instanceof Error ? err.message : String(err)}\n` +
        'Fix: set MONGODB_URI in .env to any MongoDB 6+ (a free MongoDB Atlas cluster works), then run `npm run dev` again.\n',
    );
    process.exit(1);
  });
  console.log(`Embedded MongoDB ready on ${EMBEDDED_URI} (data in .data/mongo)`);
  const stop = async () => {
    await server.stop({ doCleanup: false }).catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}
