type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const color: Record<Level, string> = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' };

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

/** Small structured logger: key=value fields, one line per event, so stage timings are greppable. */
export function createLogger(minLevel: Level = 'info', bindings: Record<string, unknown> = {}): Logger {
  const log = (level: Level, msg: string, fields?: Record<string, unknown>) => {
    if (order[level] < order[minLevel]) return;
    const all = { ...bindings, ...fields };
    const kv = Object.entries(all)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ');
    const line = `${color[level]}${level.toUpperCase().padEnd(5)}\x1b[0m ${msg}${kv ? '  \x1b[90m' + kv + '\x1b[0m' : ''}`;
    (level === 'error' ? console.error : console.log)(line);
  };
  return {
    debug: (m, f) => log('debug', m, f),
    info: (m, f) => log('info', m, f),
    warn: (m, f) => log('warn', m, f),
    error: (m, f) => log('error', m, f),
    child: (b) => createLogger(minLevel, { ...bindings, ...b }),
  };
}

/** Logger that drops everything; used by tests. */
export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => silentLogger,
};
