import dotenv from 'dotenv';

try {
  dotenv.config();
} catch (error) {
  console.error('Warning: Error loading .env file:', (error as Error).message);
}

export const config = {
  port: Number(process.env.PORT) || 5000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/sentinelai',
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    callbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:5000/api/auth/github/callback',
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    apiUrl: process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1',
    apiKeys: (process.env.GROQ_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean),
  },
  gemini: {
    apiKeys: (process.env.GEMINI_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean),
    apiUrl: process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta',
  },

  jwt: {
    // CWE-798: No insecure fallback — app fails fast if JWT_SECRET is missing
    secret: process.env.JWT_SECRET || (() => { throw new Error('FATAL: JWT_SECRET environment variable is not set'); })(),
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as string,
  },
  nodeEnv: process.env.NODE_ENV || 'development',
};
