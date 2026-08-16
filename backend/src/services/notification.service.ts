import webpush from 'web-push';
import { User } from '../db/models/User.model.js';
import { TelegramService } from './telegram.service.js';

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: any;
  url?: string;
}

export class NotificationService {
  private static vapidPublicKey: string;
  private static vapidPrivateKey: string;

  static initialize() {
    this.vapidPublicKey  = process.env.VAPID_PUBLIC_KEY  || '';
    this.vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';

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

    if (TelegramService.isConfigured()) {
      console.log('✅ Telegram notifications initialized');
      // Register webhook on startup
      const backendUrl = process.env.BACKEND_URL || process.env.RENDER_EXTERNAL_URL;
      if (backendUrl) {
        TelegramService.setWebhook(`${backendUrl}/api/telegram/webhook`).catch(() => {});
      }
    } else {
      console.warn('⚠️  Telegram bot token not configured. Telegram notifications disabled.');
    }
  }

  // Generate VAPID keys (run once and save to .env)
  static generateVapidKeys() {
    const vapidKeys = webpush.generateVAPIDKeys();
    console.log('VAPID Public Key:', vapidKeys.publicKey);
    console.log('VAPID Private Key:', vapidKeys.privateKey);
    return vapidKeys;
  }

  // ── Push notifications ─────────────────────────────────────────────────────

  static async savePushSubscription(userId: number, subscription: any) {
    try {
      await User.findOneAndUpdate(
        { githubId: userId },
        { $set: { pushSubscription: subscription, notificationsEnabled: true } }
      );
      console.log(`✅ Push subscription saved for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Error saving push subscription:', error);
      return false;
    }
  }

  static async removePushSubscription(userId: number) {
    await User.findOneAndUpdate(
      { githubId: userId },
      { $unset: { pushSubscription: 1 }, $set: { notificationsEnabled: false } }
    );
    return true;
  }

  static async sendPushNotification(userId: number, payload: NotificationPayload) {
    try {
      const user = await User.findOne({ githubId: userId });
      if (!user?.pushSubscription || !user.notificationsEnabled) return false;

      await webpush.sendNotification(
        user.pushSubscription,
        JSON.stringify({
          title: payload.title,
          body:  payload.body,
          icon:  payload.icon  || '/image.png',
          badge: payload.badge || '/image.png',
          data:  payload.data  || {},
          url:   payload.url   || '/',
        })
      );
      console.log(`✅ Push notification sent to user ${userId}`);
      return true;
    } catch (error: any) {
      console.error('Error sending push notification:', error);
      if (error.statusCode === 410) {
        // Subscription expired — clean it up
        await User.findOneAndUpdate({ githubId: userId }, { $unset: { pushSubscription: 1 } });
      }
      return false;
    }
  }

  // ── Telegram notifications ─────────────────────────────────────────────────

  static async sendTelegramNotification(userId: number, message: string): Promise<boolean> {
    try {
      const user = await User.findOne({ githubId: userId });
      if (!user?.telegramChatId || !user.telegramNotificationsEnabled) {
        console.log(`No Telegram chat_id for user ${userId}`);
        return false;
      }
      return await TelegramService.sendMessage(user.telegramChatId, message);
    } catch (error: any) {
      console.error('Error sending Telegram notification:', error.message);
      return false;
    }
  }

  // ── Combined send ──────────────────────────────────────────────────────────

  static async sendNotification(userId: number, payload: NotificationPayload, message?: string) {
    const text = message || `${payload.title}\n\n${payload.body}`;
    const [pushResult, telegramResult] = await Promise.allSettled([
      this.sendPushNotification(userId, payload),
      this.sendTelegramNotification(userId, text),
    ]);

    const push     = pushResult.status     === 'fulfilled' && pushResult.value;
    const telegram = telegramResult.status === 'fulfilled' && telegramResult.value;

    return { push, telegram, success: push || telegram };
  }

  // ── Preferences ────────────────────────────────────────────────────────────

  static async getNotificationPreferences(userId: number) {
    const user = await User.findOne({ githubId: userId });
    return {
      pushEnabled:       user?.notificationsEnabled           || false,
      telegramEnabled:   user?.telegramNotificationsEnabled   || false,
      hasPushSubscription: !!user?.pushSubscription,
      hasTelegramChatId:   !!user?.telegramChatId,
      telegramChatId:      user?.telegramChatId || null,
    };
  }

  static async updateNotificationPreferences(
    userId: number,
    preferences: { pushEnabled?: boolean; telegramEnabled?: boolean }
  ) {
    const update: any = {};
    if (preferences.pushEnabled     !== undefined) update.notificationsEnabled         = preferences.pushEnabled;
    if (preferences.telegramEnabled !== undefined) update.telegramNotificationsEnabled = preferences.telegramEnabled;
    await User.findOneAndUpdate({ githubId: userId }, { $set: update });
    return true;
  }

  // ── Legacy WhatsApp shim (kept for backward compat, routes to Telegram) ────

  /** @deprecated Use sendTelegramNotification instead */
  static async sendWhatsAppNotification(userId: number, message: string): Promise<boolean> {
    return this.sendTelegramNotification(userId, message);
  }

  /** @deprecated */
  static async saveWhatsAppNumber(userId: number, phoneNumber: string) {
    console.warn('saveWhatsAppNumber is deprecated — use Telegram linking instead');
    return false;
  }

  /** @deprecated */
  static async removeWhatsAppNumber(userId: number) {
    console.warn('removeWhatsAppNumber is deprecated — use Telegram unlinking instead');
    return false;
  }
}
