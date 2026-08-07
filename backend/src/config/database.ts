import mongoose from 'mongoose';
import { config } from './env.js';

export const connectDatabase = async () => {
  try {
  const mongoUri = config.mongoUri;
    
    console.log('🔄 Connecting to MongoDB...');
    console.log(`📍 URI: ${mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//*****:*****@')}`); // Hide credentials in logs
    
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 30000, // 30 seconds timeout
      socketTimeoutMS: 45000,
      family: 4, // Use IPv4, skip trying IPv6
    });
    
    console.log('✅ MongoDB connected successfully');
    console.log(`📦 Database: ${mongoose.connection.name}`);
    console.log(`🌐 Host: ${mongoose.connection.host}`);
  } catch (error: any) {
    // CWE-209: Avoid leaking raw error messages that may contain connection details
    console.error('❌ MongoDB connection error: Failed to connect to database');
    console.error('💡 Please check:');
    console.error('   1. MongoDB URI is correct');
    console.error('   2. MongoDB cluster is running');
    console.error('   3. Network access is allowed from this IP');
    console.error('   4. Database user credentials are correct');
    
    // In production, we might want to retry or use a fallback
    if (config.nodeEnv === 'production') {
      console.error('⚠️  Running without database connection in production!');
      // Don't exit in production, let the app run without DB for health checks
    } else {
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
