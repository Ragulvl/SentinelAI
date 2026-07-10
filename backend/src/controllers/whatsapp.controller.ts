import { Request, Response } from 'express';
import { WhatsAppWorker } from '../workers/whatsapp.worker.js';

export class WhatsAppController {
  /**
   * Handle incoming WhatsApp webhook from Twilio
   */
  static async handleWebhook(req: Request, res: Response) {
    try {
      const { From, Body, MessageSid, Timestamp } = req.body;

      if (!From || !Body) {
        return res.status(400).send('Missing required fields');
      }

      // Extract phone number (remove 'whatsapp:' prefix)
      const phoneNumber = From.replace('whatsapp:', '');

      // Process message asynchronously
      WhatsAppWorker.handleWebhookMessage({
        from: phoneNumber,
        body: Body,
        timestamp: Timestamp || new Date().toISOString(),
        messageId: MessageSid,
      }).catch(error => {
        console.error('Error processing webhook message:', error);
      });

      // Respond immediately to Twilio
      res.status(200).send('OK');
    } catch (error: any) {
      console.error('Error handling webhook:', error);
      res.status(500).send('Internal server error');
    }
  }

  /**
   * Get WhatsApp worker status
   */
  static getStatus(req: Request, res: Response) {
    const isConfigured = !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_NUMBER
    );

    res.json({
      configured: isConfigured,
      running: WhatsAppWorker.isRunning(),
      activeSessions: WhatsAppWorker.getActiveSessionCount(),
    });
  }
}
