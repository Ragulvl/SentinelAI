import { setServers } from 'node:dns';
// Fix: Node.js on Windows fails DNS SRV lookups for mongodb+srv://
// Force Google's public DNS to resolve MongoDB Atlas cluster correctly
setServers(['8.8.8.8', '8.8.4.4']);

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase } from './config/database.js';
import authRoutes from './routes/auth.routes.js';
import scanRoutes from './routes/scan.routes.js';
import monitoringRoutes from './routes/monitoring.routes.js';
import websiteScanRoutes from './routes/websiteScan.routes.js';
import sandboxScanRoutes from './routes/sandboxScan.routes.js';
import historyRoutes from './routes/history.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import whatsappRoutes from './routes/whatsapp.routes.js';
import { MonitoringWorker } from './workers/monitoring.worker.js';
import { WhatsAppWorker } from './workers/whatsapp.worker.js';
import { NotificationService } from './services/notification.service.js';

const app = express();

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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/website-scan', websiteScanRoutes);
app.use('/api/sandbox', sandboxScanRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// Health check
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: dbStatus,
    environment: config.nodeEnv
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
    const host = isProduction ? '0.0.0.0' : 'localhost';
    
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
        
        // Start WhatsApp worker if Twilio is configured
        if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
          WhatsAppWorker.start();
        } else {
          logger.warn('WhatsApp worker not started — Twilio not configured');
        }
      } else {
        logger.warn('Monitoring worker not started — no database connection');
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
  WhatsAppWorker.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received — shutting down gracefully');
  MonitoringWorker.stop();
  WhatsAppWorker.stop();
  process.exit(0);
});

startServer();
