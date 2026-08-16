import axios from 'axios';

const TELEGRAM_API = `https://api.telegram.org/bot`;

export class TelegramService {
  private static get token(): string {
    return process.env.TELEGRAM_BOT_TOKEN || '';
  }

  static isConfigured(): boolean {
    return !!this.token;
  }

  /**
   * Send a text message to a Telegram chat
   */
  static async sendMessage(chatId: string, text: string): Promise<boolean> {
    if (!this.token) {
      console.warn('⚠️  Telegram bot token not configured');
      return false;
    }

    try {
      await axios.post(`${TELEGRAM_API}${this.token}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
      console.log(`✅ Telegram message sent to chat ${chatId}`);
      return true;
    } catch (error: any) {
      const errData = error?.response?.data;
      console.error(`❌ Telegram sendMessage failed:`, errData?.description || error.message);
      return false;
    }
  }

  /**
   * Register a webhook URL so Telegram pushes updates to your server
   */
  static async setWebhook(webhookUrl: string): Promise<boolean> {
    if (!this.token) return false;
    try {
      const res = await axios.post(`${TELEGRAM_API}${this.token}/setWebhook`, {
        url: webhookUrl,
        allowed_updates: ['message'],
      });
      console.log(`✅ Telegram webhook set: ${webhookUrl}`, res.data);
      return true;
    } catch (error: any) {
      console.error('❌ Failed to set Telegram webhook:', error?.response?.data || error.message);
      return false;
    }
  }

  /**
   * Remove the webhook (for development polling)
   */
  static async deleteWebhook(): Promise<boolean> {
    if (!this.token) return false;
    try {
      await axios.post(`${TELEGRAM_API}${this.token}/deleteWebhook`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get basic bot info (validates token)
   */
  static async getBotInfo(): Promise<any | null> {
    if (!this.token) return null;
    try {
      const res = await axios.get(`${TELEGRAM_API}${this.token}/getMe`);
      return res.data.result;
    } catch (error: any) {
      console.error('❌ Failed to get bot info:', error?.response?.data || error.message);
      return null;
    }
  }
}
