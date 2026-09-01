// Vercel serverless function entry point.
// Vercel automatically recognizes files in api/ as serverless functions.
// This file re-exports the compiled Express app from dist/ so Vercel can
// invoke it as a request handler on every incoming request.
//
// The rewrite in vercel.json routes all traffic here:
//   { "source": "/(.*)", "destination": "/api/index" }
//
// Express app is a valid Node.js request handler: (req, res) => void
// Vercel calls it directly for each serverless invocation.
import app from '../dist/index.js';

export default app;
