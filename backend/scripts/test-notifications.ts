import { NotificationService } from '../src/services/notification.service.js';
import { connectDatabase } from '../src/config/database.js';
import mongoose from 'mongoose';

async function testNotifications() {
  try {
    console.log('🔔 Testing Notification System...\n');

    // Connect to database
    await connectDatabase();
    console.log('✅ Connected to database\n');

    // Initialize notification service
    NotificationService.initialize();
    console.log('✅ Notification service initialized\n');

    // Test configuration
    console.log('📋 Configuration:');
    console.log(`   VAPID Public Key: ${process.env.VAPID_PUBLIC_KEY ? '✅ Set' : '❌ Not set'}`);
    console.log(`   VAPID Private Key: ${process.env.VAPID_PRIVATE_KEY ? '✅ Set' : '❌ Not set'}`);
    console.log(`   Twilio Account SID: ${process.env.TWILIO_ACCOUNT_SID ? '✅ Set' : '❌ Not set'}`);
    console.log(`   Twilio Auth Token: ${process.env.TWILIO_AUTH_TOKEN ? '✅ Set' : '❌ Not set'}`);
    console.log(`   Twilio WhatsApp Number: ${process.env.TWILIO_WHATSAPP_NUMBER || '❌ Not set'}`);
    console.log(`   Twilio Content SID: ${process.env.TWILIO_CONTENT_SID || '❌ Not set (optional)'}`);
    console.log('');

    // Check if user ID is provided
    const userId = process.argv[2];
    if (!userId) {
      console.log('ℹ️  To test sending notifications to a specific user:');
      console.log('   npm run test:notifications <userId>\n');
      console.log('✅ Configuration test complete!');
      process.exit(0);
    }

    // Test sending notification
    console.log(`📤 Sending test notification to user ${userId}...\n`);
    
    const result = await NotificationService.sendNotification(
      parseInt(userId),
      {
        title: '🔔 Test Notification',
        body: 'This is a test notification from your Security Scanner',
        url: '/monitoring',
      },
      '🔔 Test Notification: This is a test notification from your Security Scanner'
    );

    console.log('📊 Results:');
    console.log(`   Push Notification: ${result.push ? '✅ Sent' : '❌ Failed/Not configured'}`);
    console.log(`   WhatsApp Notification: ${result.whatsapp ? '✅ Sent' : '❌ Failed/Not configured'}`);
    console.log(`   Overall Success: ${result.success ? '✅ Yes' : '❌ No'}`);
    console.log('');

    if (!result.success) {
      console.log('⚠️  No notifications were sent. Make sure:');
      console.log('   1. User has configured their notification preferences');
      console.log('   2. User has enabled push notifications or added WhatsApp number');
      console.log('   3. All environment variables are set correctly');
    } else {
      console.log('✅ Test notification sent successfully!');
    }

  } catch (error) {
    console.error('❌ Error testing notifications:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

testNotifications();
