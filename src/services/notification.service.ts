import { API_BASE_URL } from '@/config/api';

export interface NotificationPreferences {
  pushEnabled: boolean;
  telegramEnabled: boolean;
  hasPushSubscription: boolean;
  hasTelegramChatId: boolean;
  telegramChatId: string | null;
}

class NotificationServiceClass {
  private swRegistration: ServiceWorkerRegistration | null = null;

  // Initialize service worker for push notifications
  async initializeServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Worker not supported');
      return false;
    }

    try {
      this.swRegistration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered');
      return true;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return false;
    }
  }

  // Request notification permission
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('Notifications not supported');
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  // Subscribe to push notifications
  async subscribeToPush(): Promise<boolean> {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Unauthorized');
      }

      // Ensure service worker is registered
      if (!this.swRegistration) {
        await this.initializeServiceWorker();
      }

      if (!this.swRegistration) {
        throw new Error('Service Worker not available');
      }

      // Request permission
      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        throw new Error('Notification permission denied');
      }

      // Get VAPID public key from server
      const response = await fetch(`${API_BASE_URL}/api/notifications/push/vapid-key`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to get VAPID key');
      }

      const { publicKey } = await response.json();

      // Subscribe to push
      const subscription = await this.swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(publicKey),
      });

      // Send subscription to server
      const saveResponse = await fetch(`${API_BASE_URL}/api/notifications/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({ subscription }),
      });

      if (!saveResponse.ok) {
        throw new Error('Failed to save subscription');
      }

      console.log('Push notifications enabled');
      return true;
    } catch (error) {
      console.error('Error subscribing to push:', error);
      return false;
    }
  }

  // Unsubscribe from push notifications
  async unsubscribeFromPush(): Promise<boolean> {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Unauthorized');
      }

      if (!this.swRegistration) {
        return true;
      }

      const subscription = await this.swRegistration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }

      const response = await fetch(`${API_BASE_URL}/api/notifications/push/unsubscribe`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to unsubscribe');
      }

      console.log('Push notifications disabled');
      return true;
    } catch (error) {
      console.error('Error unsubscribing from push:', error);
      return false;
    }
  }

  // Link Telegram — sends chat_id to backend which verifies it by messaging the user
  async linkTelegram(chatId: string): Promise<boolean> {
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Unauthorized');

      const response = await fetch(`${API_BASE_URL}/api/telegram/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        credentials: 'include',
        body: JSON.stringify({ chatId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to link Telegram');
      }

      console.log('Telegram notifications enabled');
      return true;
    } catch (error) {
      console.error('Error linking Telegram:', error);
      throw error;
    }
  }

  // Unlink Telegram
  async unlinkTelegram(): Promise<boolean> {
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Unauthorized');

      const response = await fetch(`${API_BASE_URL}/api/telegram/unlink`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to unlink Telegram');
      console.log('Telegram notifications disabled');
      return true;
    } catch (error) {
      console.error('Error unlinking Telegram:', error);
      return false;
    }
  }

  // Get bot status (bot username for linking)
  async getTelegramBotStatus(): Promise<{ configured: boolean; botUsername: string | null }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/telegram/status`);
      if (!res.ok) return { configured: false, botUsername: null };
      return res.json();
    } catch {
      return { configured: false, botUsername: null };
    }
  }

  // Get notification preferences
  async getPreferences(): Promise<NotificationPreferences> {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Unauthorized');
    }

    const response = await fetch(`${API_BASE_URL}/api/notifications/preferences`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch preferences');
    }

    return response.json();
  }

  // Update notification preferences
  async updatePreferences(preferences: {
    pushEnabled?: boolean;
    telegramEnabled?: boolean;
  }): Promise<void> {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Unauthorized');
    }

    const response = await fetch(`${API_BASE_URL}/api/notifications/preferences`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: 'include',
      body: JSON.stringify(preferences),
    });

    if (!response.ok) {
      throw new Error('Failed to update preferences');
    }
  }

  // Send test notification
  async sendTestNotification(): Promise<void> {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Unauthorized');
    }

    const response = await fetch(`${API_BASE_URL}/api/notifications/test`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to send test notification');
    }

    const result = await response.json();
    return result;
  }

  // Helper function to convert VAPID key
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

export const notificationService = new NotificationServiceClass();
