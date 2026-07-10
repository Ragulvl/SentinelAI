import mongoose from 'mongoose';
import { User } from '../src/db/models/User.model.js';
import dotenv from 'dotenv';

dotenv.config();

async function testPhoneSave() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/security-scanner';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find a test user (you can replace with your actual user ID)
    const testUser = await User.findOne({});
    
    if (!testUser) {
      console.log('❌ No users found in database. Please create a user first.');
      process.exit(1);
    }

    console.log(`\n📱 Testing phone number save for user: ${testUser.username}`);
    console.log(`   GitHub ID: ${testUser.githubId}`);

    // Test saving a phone number
    const testPhoneNumber = '+1234567890';
    
    await User.findOneAndUpdate(
      { githubId: testUser.githubId },
      { 
        $set: { 
          whatsappNumber: testPhoneNumber,
          whatsappNotificationsEnabled: true
        } 
      }
    );

    console.log(`✅ Phone number saved: ${testPhoneNumber}`);

    // Verify it was saved
    const updatedUser = await User.findOne({ githubId: testUser.githubId });
    
    console.log('\n📊 Verification:');
    console.log(`   WhatsApp Number: ${updatedUser?.whatsappNumber}`);
    console.log(`   WhatsApp Enabled: ${updatedUser?.whatsappNotificationsEnabled}`);
    console.log(`   Push Enabled: ${updatedUser?.notificationsEnabled}`);
    console.log(`   Has Push Subscription: ${!!updatedUser?.pushSubscription}`);

    if (updatedUser?.whatsappNumber === testPhoneNumber) {
      console.log('\n✅ SUCCESS: Phone number was saved correctly!');
    } else {
      console.log('\n❌ FAILED: Phone number was not saved correctly');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

testPhoneSave();
