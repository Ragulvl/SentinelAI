import dotenv from 'dotenv';

try {
  dotenv.config();
} catch (error) {
  console.error('Warning: Error loading .env file:', (error as Error).message);
}

// ── Required environment variable guard ────────────────────────────────────
// Collect missing vars and report them all at once instead of throwing at
// module load time. Throwing at module load crashes Vercel serverless functions
// before any request can be handled (FUNCTION_INVOCATION_FAILED), making it
// impossible to even reach /health to diagnose the problem.
const MISSING_ENV: string[] = [];

function requireEnv(key: string, fallback?: string): string {
  const val = process.env[key] || fallback;
  if (!val) MISSING_ENV.push(key);
  return val ?? '';
}

export const config = {
  port: Number(process.env.PORT) || 5000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/sentinelai',
  github: {
    clientId:    process.env.GITHUB_CLIENT_ID     || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    callbackUrl: process.env.GITHUB_CALLBACK_URL   || 'http://localhost:5000/api/auth/github/callback',
  },
  groq: {
    apiKey:  process.env.GROQ_API_KEY  || '',
    apiUrl:  process.env.GROQ_API_URL  || 'https://api.groq.com/openai/v1',
    apiKeys: (process.env.GROQ_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean),
  },
  gemini: {
    apiKeys: (process.env.GEMINI_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean),
    apiUrl:  process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta',
  },
  jwt: {
    // CWE-798: JWT_SECRET is required. We no longer throw at module load (would crash
    // Vercel serverless before any request is handled). Instead we record the missing
    // var and the runtime guard in jwt.service.ts returns 503 if it's absent.
    secret:    requireEnv('JWT_SECRET'),
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as string,
  },
  nodeEnv: process.env.NODE_ENV || 'development',
};

// Export the list so index.ts / health endpoint can surface it clearly
export const missingEnvVars: readonly string[] = MISSING_ENV;

// Warn immediately so Vercel function logs show the problem
if (MISSING_ENV.length > 0) {
  console.error(
    `[SentinelAI] FATAL: Missing required environment variables: ${MISSING_ENV.join(', ')}. ` +
    'All auth endpoints will return 503 until these are set in the Vercel dashboard.'
  );
}
