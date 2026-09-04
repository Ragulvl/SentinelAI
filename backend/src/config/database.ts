import mongoose from 'mongoose';
import { config } from './env.js';

// Whether we are running inside a serverless function (Vercel, etc.)
// process.exit() must NEVER be called in serverless — it causes FUNCTION_INVOCATION_FAILED.
const IS_SERVERLESS = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

export const connectDatabase = async () => {
  try {
    const mongoUri = config.mongoUri;

    console.log('🔄 Connecting to MongoDB...');
    // Hide credentials in logs (CWE-209)
    console.log(`📍 URI: ${mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//*****:*****@')}`);

    await mongoose.connect(mongoUri, {
      // Vercel serverless functions have a cold-start budget.
      // 10 s is enough for Atlas; 30 s would eat the whole Hobby timeout.
      serverSelectionTimeoutMS: IS_SERVERLESS ? 8000 : 30000,
      socketTimeoutMS: IS_SERVERLESS ? 10000 : 45000,
      family: 4, // Use IPv4, skip IPv6 probing
    });

    console.log('✅ MongoDB connected successfully');
    console.log(`📦 Database: ${mongoose.connection.name}`);
    console.log(`🌐 Host: ${mongoose.connection.host}`);
  } catch (error: any) {
    // CWE-209: Do not leak connection details in error messages
    console.error('❌ MongoDB connection error: Failed to connect to database');
    console.error('💡 Please check:');
    console.error('   1. MONGO_URI environment variable is set correctly');
    console.error('   2. MongoDB Atlas cluster is running');
    console.error('   3. Network access allows connections from this IP (or 0.0.0.0/0)');
    console.error('   4. Database user credentials are correct');

    if (IS_SERVERLESS) {
      // In serverless environments, NEVER call process.exit().
      // process.exit() in a Vercel function = FUNCTION_INVOCATION_FAILED for ALL requests.
      // The app continues to run; endpoints that need DB will return 503 gracefully.
      console.error('⚠️  Serverless: running without DB — DB-dependent endpoints will fail gracefully.');
    } else if (config.nodeEnv === 'production') {
      // Traditional server in production — log and continue (systemd/PM2 will restart if needed)
      console.error('⚠️  Production: running without database connection!');
    } else {
      // Local development — exit fast so the developer knows immediately
      console.error('💥 Development: exiting. Fix MONGO_URI and restart.');
      process.exit(1);
    }
  }
};

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected');
});

mongoose.connection.on('error', (error) => {
  console.error('❌ MongoDB error:', error);
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});
