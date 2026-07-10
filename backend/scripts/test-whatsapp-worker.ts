import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:10000';

async function testWhatsAppWorker() {
  console.log('🧪 Testing WhatsApp Worker\n');

  try {
    // 1. Check worker status
    console.log('1️⃣ Checking worker status...');
    const statusResponse = await axios.get(`${BACKEND_URL}/api/whatsapp/status`);
    console.log('Status:', statusResponse.data);
    
    if (!statusResponse.data.configured) {
      console.log('\n❌ WhatsApp worker is not configured!');
      console.log('Please add Twilio credentials to backend/.env:');
      console.log('  TWILIO_ACCOUNT_SID=your_account_sid');
      console.log('  TWILIO_AUTH_TOKEN=your_auth_token');
      console.log('  TWILIO_WHATSAPP_NUMBER=+14155238886');
      return;
    }

    if (!statusResponse.data.running) {
      console.log('\n⚠️  WhatsApp worker is configured but not running!');
      console.log('Make sure the backend server is running.');
      return;
    }

    console.log('✅ Worker is configured and running\n');

    // 2. Test webhook endpoint
    console.log('2️⃣ Testing webhook endpoint...');
    const testMessage = {
      From: 'whatsapp:+1234567890',
      Body: 'hi',
      MessageSid: `TEST_${Date.now()}`,
      Timestamp: new Date().toISOString(),
    };

    try {
      const webhookResponse = await axios.post(
        `${BACKEND_URL}/api/whatsapp/webhook`,
        testMessage
      );
      console.log('Webhook response:', webhookResponse.status, webhookResponse.statusText);
      console.log('✅ Webhook endpoint is working\n');
    } catch (error: any) {
      if (error.response?.status === 400) {
        console.log('⚠️  Webhook returned 400 (expected for test number)\n');
      } else {
        throw error;
      }
    }

    // 3. Check health
    console.log('3️⃣ Checking backend health...');
    const healthResponse = await axios.get(`${BACKEND_URL}/health`);
    console.log('Health:', healthResponse.data);
    console.log('✅ Backend is healthy\n');

    // 4. Summary
    console.log('📊 Test Summary:');
    console.log('  ✅ Worker Status: OK');
    console.log('  ✅ Webhook Endpoint: OK');
    console.log('  ✅ Backend Health: OK');
    console.log(`  📱 Active Sessions: ${statusResponse.data.activeSessions}`);
    
    console.log('\n🎉 All tests passed!');
    console.log('\n📝 Next Steps:');
    console.log('  1. Configure Twilio webhook URL in Twilio Console');
    console.log('  2. Register your WhatsApp number in the app');
    console.log('  3. Send "hi" to your Twilio WhatsApp number');
    console.log(`  4. Webhook URL: ${BACKEND_URL}/api/whatsapp/webhook`);

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run tests
testWhatsAppWorker();
