import mongoose from 'mongoose';
import { User } from '../src/db/models/User.model.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkUserNotifications() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/security-scanner';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get username from command line or use first user
    const username = process.argv[2];
    
    let user;
    if (username) {
      user = await User.findOne({ username });
      if (!user) {
        console.log(`❌ User '${username}' not found`);
        process.exit(1);
      }
    } else {
      user = await User.findOne({});
      if (!user) {
        console.log('❌ No users found in database');
        process.exit(1);
      }
    }

    console.log('👤 User Information:');
    console.log(`   Username: ${user.username}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   GitHub ID: ${user.githubId}`);
    console.log(`   Name: ${user.name}`);
    
    console.log('\n📱 Push Notifications:');
    console.log(`   Enabled: ${user.notificationsEnabled ? '✅' : '❌'}`);
    console.log(`   Has Subscription: ${user.pushSubscription ? '✅' : '❌'}`);
    if (user.pushSubscription) {
      console.log(`   Endpoint: ${user.pushSubscription.endpoint?.substring(0, 50)}...`);
    }
    
    console.log('\n💬 WhatsApp Notifications:');
    console.log(`   Enabled: ${user.whatsappNotificationsEnabled ? '✅' : '❌'}`);
    console.log(`   Phone Number: ${user.whatsappNumber || 'Not set'}`);
    
    console.log('\n📊 Summary:');
    const activeChannels = [];
    if (user.notificationsEnabled && user.pushSubscription) {
      activeChannels.push('Push');
    }
    if (user.whatsappNotificationsEnabled && user.whatsappNumber) {
      activeChannels.push('WhatsApp');
    }
    
    if (activeChannels.length > 0) {
      console.log(`   Active Channels: ${activeChannels.join(', ')}`);
    } else {
      console.log('   No notification channels configured');
    }

    console.log('\n💡 Usage:');
    console.log('   Check specific user: npx tsx scripts/check-user-notifications.ts <username>');
    console.log('   Check first user: npx tsx scripts/check-user-notifications.ts');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkUserNotifications();
