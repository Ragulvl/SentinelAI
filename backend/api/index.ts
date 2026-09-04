// DIAGNOSTIC WRAPPER — deployed temporarily to surface the real runtime error.
// Instead of FUNCTION_INVOCATION_FAILED (opaque 500), returns the actual error as JSON.
import type { IncomingMessage, ServerResponse } from 'http';

// Capture any initialization error so we can return it as JSON
let app: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;
let initError: { message: string; stack: string } | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../src/index');
  // Handle both CommonJS module.exports = app AND ES module exports.default = app
  app = (mod && mod.__esModule ? mod.default : mod) || mod;
  console.log('[diagnostic] App loaded OK, type:', typeof app);
} catch (err: unknown) {
  const e = err as Error;
  initError = { message: e.message || String(err), stack: e.stack || '' };
  console.error('[diagnostic] INIT ERROR:', e.message, e.stack);
}

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (initError) {
    (res as NodeJS.WritableStream & { statusCode: number; setHeader: (k: string, v: string) => void }).statusCode = 500;
    (res as unknown as { setHeader: (k: string, v: string) => void }).setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        _diagnostic: true,
        error: 'INIT_FAILED',
        message: initError.message,
        stack: initError.stack.substring(0, 800),
      }),
    );
    return;
  }
  if (!app) {
    res.end(JSON.stringify({ _diagnostic: true, error: 'NO_HANDLER' }));
    return;
  }
  app(req, res);
}
