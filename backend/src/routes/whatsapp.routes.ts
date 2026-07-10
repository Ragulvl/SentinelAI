import { Router } from 'express';
import { WhatsAppController } from '../controllers/whatsapp.controller.js';

const router = Router();

// Webhook endpoint for Twilio WhatsApp messages
router.post('/webhook', WhatsAppController.handleWebhook);

// Status endpoint
router.get('/status', WhatsAppController.getStatus);

export default router;
