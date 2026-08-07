/**
 * Minimal structured logger for the SentinelAI backend.
 *
 * Outputs JSON lines in production (NODE_ENV=production) so log
 * aggregators (Datadog, Render, Vercel) can ingest them as structured
 * events.  In development it falls back to coloured console output so
 * the terminal stays readable during local dev.
 *
 * Usage:
 *   import { logger } from '../config/logger.js';
 *   logger.info('Server started', { port: 5000 });
 *   logger.warn('Rate limit hit', { key: '...', attempt: 3 });
 *   logger.error('Scan failed', { scanId, error: err.message });
 */

type Level = 'debug' | 'info' | 'warn' | 'error';
type Meta = Record<string, unknown>;

const LEVEL_RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

// Respect LOG_LEVEL env var; default to 'info'
const MIN_LEVEL: Level = (process.env.LOG_LEVEL as Level) ?? 'info';

const IS_PROD = process.env.NODE_ENV === 'production';

// ANSI colours for dev mode
const DEV_COLOURS: Record<Level, string> = {
  debug: '\x1b[90m', // grey
  info:  '\x1b[36m', // cyan
  warn:  '\x1b[33m', // yellow
  error: '\x1b[31m', // red
};
const RESET = '\x1b[0m';

function emit(level: Level, message: string, meta?: Meta): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[MIN_LEVEL]) return;

  if (IS_PROD) {
    // Structured JSON line — one object per log entry
    const entry = {
      ts: new Date().toISOString(),
      level,
      msg: message,
      ...(meta ?? {}),
    };
    const out = level === 'error' ? process.stderr : process.stdout;
    out.write(JSON.stringify(entry) + '\n');
  } else {
    // Human-readable dev output
    const colour = DEV_COLOURS[level];
    const prefix = `${colour}[${level.toUpperCase().padEnd(5)}]${RESET}`;
    const ts = new Date().toISOString().replace('T', ' ').replace('Z', '');
    const metaPart = meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    const line = `${ts} ${prefix} ${message}${metaPart}`;
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }
}

export const logger = {
  debug: (msg: string, meta?: Meta) => emit('debug', msg, meta),
  info:  (msg: string, meta?: Meta) => emit('info',  msg, meta),
  warn:  (msg: string, meta?: Meta) => emit('warn',  msg, meta),
  error: (msg: string, meta?: Meta) => emit('error', msg, meta),
};
