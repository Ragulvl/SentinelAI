import webpush from 'web-push';

console.log('🔑 Generating VAPID keys for Web Push notifications...\n');

const vapidKeys = webpush.generateVAPIDKeys();

console.log('Add these to your .env file:\n');
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log('\nFor WhatsApp notifications (optional), add:');
console.log('TWILIO_ACCOUNT_SID=your_twilio_account_sid');
console.log('TWILIO_AUTH_TOKEN=your_twilio_auth_token');
console.log('TWILIO_WHATSAPP_NUMBER=+14155238886');
