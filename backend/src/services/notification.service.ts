import axios from 'axios';
import webpush from 'web-push';
import { User } from '../db/models/User.model.js';

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: any;
  url?: string;
}

interface WhatsAppMessage {
  to: string;
  message: string;
}

export class NotificationService {
  private static vapidPublicKey: string;
  private static vapidPrivateKey: string;
  private static whatsappApiUrl: string;
  private static whatsappApiKey: string;

  static initialize() {
    // Initialize VAPID keys for web push
    this.vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
    this.vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
    this.whatsappApiUrl = process.env.WHATSAPP_API_URL || 'https://api.whatsapp.com/send';
    this.whatsappApiKey = process.env.WHATSAPP_API_KEY || '';

    if (this.vapidPublicKey && this.vapidPrivateKey) {
      webpush.setVapidDetails(
        'mailto:admin@securityscanner.com',
        this.vapidPublicKey,
        this.vapidPrivateKey
      );
      console.log('✅ Web Push notifications initialized');
    } else {
      console.warn('⚠️  VAPID keys not configured. Push notifications disabled.');
    }
  }

  // Generate VAPID keys (run once and save to .env)
  static generateVapidKeys() {
    const vapidKeys = webpush.generateVAPIDKeys();
    console.log('VAPID Public Key:', vapidKeys.publicKey);
    console.log('VAPID Private Key:', vapidKeys.privateKey);
    return vapidKeys;
  }

  // Save push subscription for a user
  static async savePushSubscription(userId: number, subscription: any) {
    try {
      await User.findOneAndUpdate(
        { githubId: userId },
        { 
          $set: { 
            pushSubscription: subscription,
            notificationsEnabled: true
          } 
        }
      );
      console.log(`✅ Push subscription saved for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Error saving push subscription:', error);
      return false;
    }
  }

  // Save WhatsApp number for a user
  static async saveWhatsAppNumber(userId: number, phoneNumber: string) {
    try {
      await User.findOneAndUpdate(
        { githubId: userId },
        { 
          $set: { 
            whatsappNumber: phoneNumber,
            whatsappNotificationsEnabled: true
          } 
        }
      );
      console.log(`✅ WhatsApp number saved for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Error saving WhatsApp number:', error);
      return false;
    }
  }

  // Send push notification to a user
  static async sendPushNotification(userId: number, payload: NotificationPayload) {
    try {
      const user = await User.findOne({ githubId: userId });
      
      if (!user || !user.pushSubscription || !user.notificationsEnabled) {
        console.log(`No push subscription for user ${userId}`);
        return false;
      }

      const notificationPayload = JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon || '/image.png',
        badge: payload.badge || '/image.png',
        data: payload.data || {},
        url: payload.url || '/',
      });

      await webpush.sendNotification(
        user.pushSubscription,
        notificationPayload
      );

      console.log(`✅ Push notification sent to user ${userId}`);
      return true;
    } catch (error: any) {
      console.error('Error sending push notification:', error);
      
      // If subscription is invalid, remove it
      if (error.statusCode === 410) {
        await User.findOneAndUpdate(
          { githubId: userId },
          { $unset: { pushSubscription: 1 } }
        );
      }
      
      return false;
    }
  }

  // Send WhatsApp notification
  static async sendWhatsAppNotification(userId: number, message: string, contentVariables?: Record<string, string>) {
    try {
      const user = await User.findOne({ githubId: userId });
      
      if (!user || !user.whatsappNumber || !user.whatsappNotificationsEnabled) {
        console.log(`No WhatsApp number for user ${userId}`);
        return false;
      }

      // Using Twilio WhatsApp API
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
        
        // Prepare message data
        const messageData: any = {
          From: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
          To: `whatsapp:${user.whatsappNumber}`,
        };

        // Use content template if available, otherwise use plain text
        if (process.env.TWILIO_CONTENT_SID && contentVariables) {
          messageData.ContentSid = process.env.TWILIO_CONTENT_SID;
          messageData.ContentVariables = JSON.stringify(contentVariables);
        } else {
          messageData.Body = message;
        }

        const response = await axios.post(
          twilioUrl,
          new URLSearchParams(messageData),
          {
            auth: {
              username: process.env.TWILIO_ACCOUNT_SID,
              password: process.env.TWILIO_AUTH_TOKEN,
            },
          }
        );

        console.log(`✅ WhatsApp notification sent to user ${userId}`);
        return true;
      }

      // Fallback to generic WhatsApp API
      if (this.whatsappApiKey) {
        await axios.post(
          this.whatsappApiUrl,
          {
            phone: user.whatsappNumber,
            message: message,
          },
          {
            headers: {
              'Authorization': `Bearer ${this.whatsappApiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        console.log(`✅ WhatsApp notification sent to user ${userId}`);
        return true;
      }

      console.warn('⚠️  WhatsApp API not configured');
      return false;
    } catch (error) {
      console.error('Error sending WhatsApp notification:', error);
      return false;
    }
  }

  // Send notification through all enabled channels
  static async sendNotification(userId: number, payload: NotificationPayload, message?: string) {
    const results = await Promise.allSettled([
      this.sendPushNotification(userId, payload),
      this.sendWhatsAppNotification(userId, message || payload.body),
    ]);

    const pushResult = results[0].status === 'fulfilled' && results[0].value;
    const whatsappResult = results[1].status === 'fulfilled' && results[1].value;

    return {
      push: pushResult,
      whatsapp: whatsappResult,
      success: pushResult || whatsappResult,
    };
  }

  // Get user notification preferences
  static async getNotificationPreferences(userId: number) {
    const user = await User.findOne({ githubId: userId });
    
    return {
      pushEnabled: user?.notificationsEnabled || false,
      whatsappEnabled: user?.whatsappNotificationsEnabled || false,
      hasPushSubscription: !!user?.pushSubscription,
      hasWhatsAppNumber: !!user?.whatsappNumber,
      whatsappNumber: user?.whatsappNumber || null,
    };
  }

  // Update notification preferences
  static async updateNotificationPreferences(
    userId: number,
    preferences: {
      pushEnabled?: boolean;
      whatsappEnabled?: boolean;
    }
  ) {
    const updateData: any = {};
    
    if (preferences.pushEnabled !== undefined) {
      updateData.notificationsEnabled = preferences.pushEnabled;
    }
    
    if (preferences.whatsappEnabled !== undefined) {
      updateData.whatsappNotificationsEnabled = preferences.whatsappEnabled;
    }

    await User.findOneAndUpdate(
      { githubId: userId },
      { $set: updateData }
    );

    return true;
  }

  // Remove push subscription
  static async removePushSubscription(userId: number) {
    await User.findOneAndUpdate(
      { githubId: userId },
      { $unset: { pushSubscription: 1 } }
    );
    return true;
  }

  // Remove WhatsApp number
  static async removeWhatsAppNumber(userId: number) {
    await User.findOneAndUpdate(
      { githubId: userId },
      { $unset: { whatsappNumber: 1 } }
    );
    return true;
  }
}
