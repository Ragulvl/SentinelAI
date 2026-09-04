// DNS override: only needed on Windows to resolve mongodb+srv:// addresses.
// On Vercel/Linux this is NOT needed and actually breaks Vercel's internal
// DNS resolution, causing FUNCTION_INVOCATION_FAILED on every cold start.
if (!process.env.VERCEL && process.platform === 'win32') {
  const { setServers } = await import('node:dns');
  setServers(['8.8.8.8', '8.8.4.4']);
}

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { config, missingEnvVars } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase } from './config/database.js';
import authRoutes from './routes/auth.routes.js';
import scanRoutes from './routes/scan.routes.js';
import monitoringRoutes from './routes/monitoring.routes.js';
import websiteScanRoutes from './routes/websiteScan.routes.js';
import sandboxScanRoutes from './routes/sandboxScan.routes.js';
import historyRoutes from './routes/history.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import telegramRoutes from './routes/telegram.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { MonitoringWorker } from './workers/monitoring.worker.js';
import { NotificationService } from './services/notification.service.js';

const app = express();

// Trust Vercel/proxy headers so rate limiter uses real client IPs (not internal Vercel IPs)
app.set('trust proxy', 1);

// ── Security headers (fixes CSP unsafe-inline, adds Permissions-Policy) ──────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:       ["'self'"],
      scriptSrc:        ["'self'"],                 // No unsafe-inline
      styleSrc:         ["'self'", "'unsafe-inline'"], // Styles need inline for most UIs
      imgSrc:           ["'self'", 'data:', 'https:'],
      connectSrc:       ["'self'"],
      fontSrc:          ["'self'", 'https:', 'data:'],
      objectSrc:        ["'none'"],
      frameSrc:         ["'none'"],
      frameAncestors:   ["'none'"],                // Clickjacking protection
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,   // Needed for some API clients
  permittedCrossDomainPolicies: false,
  // Permissions-Policy header (fixes missing header finding)
  // helmet sets this via the 'permissionsPolicy' option in v7+
}));

// Set Permissions-Policy explicitly (helmet covers most, this ensures full coverage)
app.use((_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
  );
  next();
});

// ── Rate limiting ──────────────────────────────────────────────────────────────
// Auth endpoints: 50 req / 15 min per real IP (trust proxy enabled above)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again later.' },
  skip: (req) => config.nodeEnv === 'development',
});

// General API: permissive (100 req / 15 min)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again later.' },
  skip: (req) => config.nodeEnv === 'development',
});

// CORS configuration - support production, Vercel previews, and local dev
const frontendUrl = config.frontendUrl.replace(/\/$/, '');
const isDev = config.nodeEnv !== 'production';

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Vercel internal proxy)
    if (!origin) return callback(null, true);

    const normalizedOrigin = origin.replace(/\/$/, '');

    // In development: allow any localhost port
    if (isDev && /^http:\/\/localhost(:\d+)?$/.test(normalizedOrigin)) {
      return callback(null, true);
    }

    // In production: allow exact match or any *.vercel.app preview deployment
    const isAllowed =
      normalizedOrigin === frontendUrl ||
      normalizedOrigin.endsWith('.vercel.app');

    if (isAllowed) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked', { origin: normalizedOrigin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routes — rate limiters applied per route group
app.use('/api/auth',         authLimiter, authRoutes);
app.use('/api/scan',         apiLimiter,  scanRoutes);
app.use('/api/monitoring',   apiLimiter,  monitoringRoutes);
app.use('/api/website-scan', apiLimiter,  websiteScanRoutes);
app.use('/api/sandbox',      apiLimiter,  sandboxScanRoutes);
app.use('/api/history',      apiLimiter,  historyRoutes);
app.use('/api/notifications', apiLimiter, notificationRoutes);
app.use('/api/telegram',      apiLimiter, telegramRoutes);
app.use('/api/admin',         apiLimiter, adminRoutes); // Super admin — protected by requireAdmin middleware

// ── Startup env-var guard ────────────────────────────────────────────────────
// If critical env vars are missing, all routes return 503 with a diagnostic
// message. This prevents FUNCTION_INVOCATION_FAILED on Vercel (which occurs
// when the module throws at load time) while still surfacing the root cause.
if (missingEnvVars.length > 0) {
  app.use((_req, res) => {
    res.status(503).json({
      error: 'Service misconfigured',
      missing: missingEnvVars,
      fix: 'Set the listed environment variables in your Vercel dashboard and redeploy.',
    });
  });
}

// Health check
app.get('/health', (_req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({
    status: missingEnvVars.length > 0 ? 'misconfigured' : 'ok',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    environment: config.nodeEnv,
    ...(missingEnvVars.length > 0 && { missingEnvVars }),
  });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { message: err.message, status: err.status, stack: err.stack });
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Connect to MongoDB and start server
const startServer = async () => {
  try {
    // Try to connect to database, but don't fail if it's not available
    try {
      await connectDatabase();
    } catch (dbError: any) {
      logger.warn('Database connection failed — server will continue without DB', { error: dbError.message });
    }
    
    // Initialize notification service
    NotificationService.initialize();
    
    const port = config.port;
    // Bind to 0.0.0.0 in production or if RENDER environment variable is set
    const isProduction = config.nodeEnv === 'production' || process.env.RENDER === 'true';
    const host = isProduction ? '0.0.0.0' : '127.0.0.1';
    
    logger.info('Binding server', { host, port, mode: isProduction ? 'production' : 'development' });
    
    app.listen(port, host, () => {
      logger.info('Backend server started', {
        url: `http://${host}:${port}`,
        frontendUrl: config.frontendUrl,
        githubOAuth: !!config.github.clientId,
        env: config.nodeEnv,
        db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      });
      
      // Start monitoring worker only if DB is connected
      if (mongoose.connection.readyState === 1) {
        MonitoringWorker.start();

        // Telegram bot starts automatically when TELEGRAM_BOT_TOKEN is set
        // (webhook is registered inside NotificationService.initialize())
        if (process.env.TELEGRAM_BOT_TOKEN) {
          logger.info('✅ Telegram bot active');
        } else {
          logger.warn('Telegram bot not started — TELEGRAM_BOT_TOKEN not configured');
        }
      } else {
        logger.warn('Monitoring worker not started — no database connection');
      }

      // Keep-warm ping — prevents Render free-tier cold starts (spins down after 15 min idle)
      // Pings the health endpoint every 14 minutes so the bot always responds instantly
      if (isProduction) {
        const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL;
        if (selfUrl) {
          setInterval(async () => {
            try {
              const http = await import('http');
              const https = await import('https');
              const url = new URL(`${selfUrl}/health`);
              const client = url.protocol === 'https:' ? https : http;
              client.get(url.toString(), (res) => {
                logger.debug('Keep-warm ping', { status: res.statusCode });
              }).on('error', () => {});
            } catch { /* non-critical */ }
          }, 14 * 60 * 1000); // every 14 minutes
          logger.info('Keep-warm ping enabled', { url: `${selfUrl}/health` });
        }
      }

    });
  } catch (error: any) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  MonitoringWorker.stop();
  NotificationService.stopPolling();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received — shutting down gracefully');
  MonitoringWorker.stop();
  NotificationService.stopPolling();
  process.exit(0);
});

// In Vercel serverless: export app (no listen needed — Vercel handles routing)
// In traditional server (Render/local): call startServer() which calls app.listen()
if (process.env.VERCEL) {
  // Connect DB eagerly so first request doesn't time out
  connectDatabase().catch(err => console.error('DB connect failed:', err));
} else {
  startServer();
}

export default app;
