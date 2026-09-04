// MINIMAL DIAGNOSTIC — no imports from src/, just returns env info as JSON
// If THIS fails, the issue is @vercel/node itself, not our app
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function handler(req: any, res: any): void {
  try {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        _ping: true,
        node: process.version,
        vercel: process.env.VERCEL,
        nodeEnv: process.env.NODE_ENV,
        ts: new Date().toISOString(),
      }),
    );
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ _ping_error: err?.message || String(err) }));
  }
}
