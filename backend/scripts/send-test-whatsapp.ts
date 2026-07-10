import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

async function sendTestWhatsAppMessage() {
  console.log('📱 Sending Test WhatsApp Message\n');

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
  const toNumber = process.argv[2]; // Get phone number from command line

  if (!accountSid || !authToken || !fromNumber) {
    console.error('❌ Missing Twilio credentials in .env file');
    console.log('Required variables:');
    console.log('  TWILIO_ACCOUNT_SID');
    console.log('  TWILIO_AUTH_TOKEN');
    console.log('  TWILIO_WHATSAPP_NUMBER');
    process.exit(1);
  }

  if (!toNumber) {
    console.error('❌ Please provide a phone number');
    console.log('Usage: npm run send-test-whatsapp +1234567890');
    process.exit(1);
  }

  try {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const message = `🤖 Test Message from Security Scanner Bot

This is a test message to verify WhatsApp integration is working.

Send "hi" to start using the bot!

Timestamp: ${new Date().toISOString()}`;

    console.log(`Sending message to: ${toNumber}`);
    console.log(`From: ${fromNumber}\n`);

    const response = await axios.post(
      twilioUrl,
      new URLSearchParams({
        From: `whatsapp:${fromNumber}`,
        To: `whatsapp:${toNumber}`,
        Body: message,
      }),
      {
        auth: {
          username: accountSid,
          password: authToken,
        },
      }
    );

    console.log('✅ Message sent successfully!');
    console.log('Message SID:', response.data.sid);
    console.log('Status:', response.data.status);
    console.log('Date Created:', response.data.date_created);

  } catch (error: any) {
    console.error('❌ Failed to send message:', error.message);
    if (error.response) {
      console.error('Error details:', error.response.data);
    }
    process.exit(1);
  }
}

sendTestWhatsAppMessage();
