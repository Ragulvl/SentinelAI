// Vercel Function entry point — @vercel/node auto-detects and compiles this.
// Files in api/ are automatically treated as Vercel Serverless Functions.
// This re-exports the Express app from src/index.ts which handles:
//   - all middleware and route registration
//   - database connection (via process.env.VERCEL check)
export { default } from '../src/index';
