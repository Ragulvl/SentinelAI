import { Request, Response } from 'express';
import { NotificationService } from '../services/notification.service.js';
import '../types/auth.js';

export class NotificationController {
  // Subscribe to push notifications
  static async subscribePush(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      const { subscription } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!subscription) {
        return res.status(400).json({ error: 'Subscription data required' });
      }

      await NotificationService.savePushSubscription(userId, subscription);
      
      res.json({ message: 'Push notifications enabled' });
    } catch (error: any) {
      console.error('Error subscribing to push:', error);
      res.status(500).json({ error: 'Failed to enable push notifications' });
    }
  }

  // Unsubscribe from push notifications
  static async unsubscribePush(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await NotificationService.removePushSubscription(userId);
      
      res.json({ message: 'Push notifications disabled' });
    } catch (error: any) {
      console.error('Error unsubscribing from push:', error);
      res.status(500).json({ error: 'Failed to disable push notifications' });
    }
  }

  // Save WhatsApp number
  static async saveWhatsApp(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      const { phoneNumber } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number required' });
      }

      // Validate phone number format (basic validation)
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(phoneNumber)) {
        return res.status(400).json({ error: 'Invalid phone number format. Use E.164 format (e.g., +1234567890)' });
      }

      await NotificationService.saveWhatsAppNumber(userId, phoneNumber);
      
      res.json({ message: 'WhatsApp notifications enabled' });
    } catch (error: any) {
      console.error('Error saving WhatsApp number:', error);
      res.status(500).json({ error: 'Failed to enable WhatsApp notifications' });
    }
  }

  // Remove WhatsApp number
  static async removeWhatsApp(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await NotificationService.removeWhatsAppNumber(userId);
      
      res.json({ message: 'WhatsApp notifications disabled' });
    } catch (error: any) {
      console.error('Error removing WhatsApp number:', error);
      res.status(500).json({ error: 'Failed to disable WhatsApp notifications' });
    }
  }

  // Get notification preferences
  static async getPreferences(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const preferences = await NotificationService.getNotificationPreferences(userId);
      
      res.json(preferences);
    } catch (error: any) {
      console.error('Error fetching preferences:', error);
      res.status(500).json({ error: 'Failed to fetch notification preferences' });
    }
  }

  // Update notification preferences
  static async updatePreferences(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      const { pushEnabled, whatsappEnabled } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await NotificationService.updateNotificationPreferences(userId, {
        pushEnabled,
        whatsappEnabled,
      });
      
      res.json({ message: 'Preferences updated' });
    } catch (error: any) {
      console.error('Error updating preferences:', error);
      res.status(500).json({ error: 'Failed to update preferences' });
    }
  }

  // Send test notification
  static async sendTest(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const result = await NotificationService.sendNotification(
        userId,
        {
          title: '🔔 Test Notification',
          body: 'This is a test notification from your Security Scanner',
          url: '/monitoring',
        },
        '🔔 Test Notification: This is a test notification from your Security Scanner'
      );
      
      res.json({ 
        message: 'Test notification sent',
        results: result,
      });
    } catch (error: any) {
      console.error('Error sending test notification:', error);
      res.status(500).json({ error: 'Failed to send test notification' });
    }
  }

  // Get VAPID public key for push subscription
  static getVapidPublicKey(req: Request, res: Response) {
    const publicKey = process.env.VAPID_PUBLIC_KEY || '';
    
    if (!publicKey) {
      return res.status(503).json({ error: 'Push notifications not configured' });
    }

    res.json({ publicKey });
  }
}
