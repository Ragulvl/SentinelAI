import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDatabase } from '../src/config/database.js';
import { User } from '../src/db/models/User.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function debugWhatsAppSession() {
  console.log('🔍 WhatsApp Session Debugger\n');

  try {
    // Connect to database
    await connectDatabase();
    console.log('✅ Connected to database\n');

    // Get phone number from command line
    const phoneNumber = process.argv[2];
    
    if (!phoneNumber) {
      console.log('Usage: npm run debug:whatsapp +1234567890');
      process.exit(1);
    }

    console.log(`Searching for user with phone: ${phoneNumber}\n`);

    // Find user
    const user = await User.findOne({ whatsappNumber: phoneNumber });

    if (!user) {
      console.log('❌ User not found!');
      console.log('\nPossible issues:');
      console.log('1. Phone number not registered in the app');
      console.log('2. Phone number format incorrect (should be E.164: +1234567890)');
      console.log('3. User registered with different number');
      console.log('\nTo fix:');
      console.log('1. Log into web app');
      console.log('2. Go to Profile → Notifications');
      console.log('3. Add WhatsApp number');
      process.exit(1);
    }

    console.log('✅ User found!\n');
    console.log('User Details:');
    console.log('─────────────────────────────────────');
    console.log(`GitHub ID: ${user.githubId}`);
    console.log(`Username: ${user.username || 'N/A'}`);
    console.log(`WhatsApp Number: ${user.whatsappNumber}`);
    console.log(`WhatsApp Enabled: ${user.whatsappNotificationsEnabled ? 'Yes' : 'No'}`);
    console.log(`Push Enabled: ${user.notificationsEnabled ? 'Yes' : 'No'}`);
    console.log(`Has GitHub Token: ${user.githubAccessToken ? 'Yes' : 'No'}`);
    console.log(`Created: ${user.createdAt}`);
    console.log('─────────────────────────────────────\n');

    // Check if user can use the bot
    const issues: string[] = [];

    if (!user.whatsappNotificationsEnabled) {
      issues.push('⚠️  WhatsApp notifications are disabled');
    }

    if (!user.githubAccessToken) {
      issues.push('⚠️  No GitHub access token (repo scans will fail)');
    }

    if (issues.length > 0) {
      console.log('⚠️  Potential Issues:');
      issues.forEach(issue => console.log(`   ${issue}`));
      console.log();
    } else {
      console.log('✅ User is fully configured and ready to use the bot!\n');
    }

    // Check recent scans
    const { Scan } = await import('../src/db/models/Scan.model.js');
    const recentScans = await Scan.find({ userId: user.githubId })
      .sort({ createdAt: -1 })
      .limit(5);

    if (recentScans.length > 0) {
      console.log('Recent Scans:');
      console.log('─────────────────────────────────────');
      recentScans.forEach((scan, index) => {
        console.log(`${index + 1}. ${scan.repoFullName}`);
        console.log(`   Status: ${scan.status}`);
        console.log(`   Created: ${scan.createdAt}`);
        if (scan.completedAt) {
          console.log(`   Completed: ${scan.completedAt}`);
        }
        console.log();
      });
    } else {
      console.log('No recent scans found.\n');
    }

    // Test Twilio configuration
    console.log('Twilio Configuration:');
    console.log('─────────────────────────────────────');
    console.log(`Account SID: ${process.env.TWILIO_ACCOUNT_SID ? '✅ Set' : '❌ Not set'}`);
    console.log(`Auth Token: ${process.env.TWILIO_AUTH_TOKEN ? '✅ Set' : '❌ Not set'}`);
    console.log(`WhatsApp Number: ${process.env.TWILIO_WHATSAPP_NUMBER || '❌ Not set'}`);
    console.log('─────────────────────────────────────\n');

    console.log('✅ Debug complete!');
    console.log('\nNext Steps:');
    console.log('1. Make sure backend is running: npm run dev');
    console.log('2. Send "hi" to your Twilio WhatsApp number');
    console.log('3. Check backend logs for processing messages');

    process.exit(0);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

debugWhatsAppSession();
