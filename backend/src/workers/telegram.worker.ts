import { User } from '../db/models/User.model.js';
import { TelegramService } from '../services/telegram.service.js';
import { RepoScannerService } from '../services/repoScanner.service.js';
import { WebsiteScannerService } from '../services/websiteScanner.service.js';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
}

interface UserSession {
  userId: number;
  chatId: string;
  state: 'idle' | 'awaiting_scan_type' | 'awaiting_repo_selection' | 'awaiting_website_url';
  lastActivity: Date;
  repositories?: Array<{ name: string; fullName: string; description: string; defaultBranch: string }>;
}

export class TelegramWorker {
  private static sessions: Map<string, UserSession> = new Map();
  private static readonly SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes
  private static processedUpdates: Set<number> = new Set();

  /**
   * Process an incoming Telegram update (from webhook)
   */
  static async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (!update.message) return;

    const { message } = update;
    const chatId = String(message.chat.id);
    const text = (message.text || '').trim();

    // Deduplicate
    if (this.processedUpdates.has(update.update_id)) return;
    this.processedUpdates.add(update.update_id);
    if (this.processedUpdates.size > 1000) {
      const first = Array.from(this.processedUpdates)[0];
      this.processedUpdates.delete(first);
    }

    console.log(`📨 Telegram message from chat ${chatId}: ${text}`);

    // Handle /start — links Telegram chat_id to the user's account
    if (text === '/start' || text.startsWith('/start ')) {
      await this.handleStart(chatId, message.from);
      return;
    }

    // Find linked user
    const user = await User.findOne({ telegramChatId: chatId });
    if (!user) {
      await TelegramService.sendMessage(
        chatId,
        '❌ <b>Not linked yet.</b>\n\nPlease link your Telegram by visiting:\n' +
        '🔗 <b>https://sentinalsec.vercel.app/settings</b> → Notifications → Connect Telegram'
      );
      return;
    }

    // Get or create session
    let session = this.sessions.get(chatId);
    if (!session) {
      session = { userId: user.githubId, chatId, state: 'idle', lastActivity: new Date() };
      this.sessions.set(chatId, session);
    }
    session.lastActivity = new Date();

    await this.processMessage(session, text, user);
  }

  /**
   * Handle /start command — link chat_id to user account
   */
  private static async handleStart(chatId: string, from: { id: number; first_name: string; username?: string }) {
    // Check if already linked
    const existing = await User.findOne({ telegramChatId: chatId });
    if (existing) {
      await TelegramService.sendMessage(
        chatId,
        `✅ <b>Already linked!</b>\n\nHello ${existing.name}! Your Telegram is connected to SentinelAI.\n\nSend <b>/help</b> to see available commands.`
      );
      return;
    }

    await TelegramService.sendMessage(
      chatId,
      `👋 <b>Welcome to SentinelAI Alerts!</b>\n\n` +
      `Your Telegram Chat ID is: <code>${chatId}</code>\n\n` +
      `To receive security alerts, visit:\n` +
      `🔗 <b>https://sentinalsec.vercel.app/settings</b>\n\n` +
      `Go to <b>Notifications → Connect Telegram</b> and enter your Chat ID above.\n\n` +
      `Once linked, you'll receive:\n` +
      `🚨 Security vulnerability alerts\n` +
      `📊 Scan completion reports\n` +
      `⬇️ Site down/up notifications\n` +
      `🔒 SSL certificate warnings`
    );
  }

  /**
   * Process commands from linked users
   */
  private static async processMessage(session: UserSession, text: string, user: any): Promise<void> {
    const lower = text.toLowerCase();

    if (lower === '/help' || lower === 'help') {
      await TelegramService.sendMessage(
        session.chatId,
        `<b>SentinelAI Commands</b>\n\n` +
        `/scan — Scan a GitHub repository\n` +
        `/status — Check monitoring status\n` +
        `/help — Show this help message\n\n` +
        `Or visit <b>https://sentinalsec.vercel.app</b> for the full dashboard.`
      );
      return;
    }

    if (lower === '/status' || lower === 'status') {
      await TelegramService.sendMessage(
        session.chatId,
        `✅ <b>SentinelAI is running</b>\n\n` +
        `Logged in as: <b>${user.name}</b> (@${user.username})\n` +
        `Dashboard: https://sentinalsec.vercel.app`
      );
      return;
    }

    // Default: guide them to the dashboard
    await TelegramService.sendMessage(
      session.chatId,
      `I received your message. Visit the dashboard to manage scans:\n🔗 https://sentinalsec.vercel.app\n\nSend /help for available commands.`
    );
  }

  /**
   * Clean up expired sessions
   */
  static cleanupSessions(): void {
    const now = Date.now();
    for (const [chatId, session] of this.sessions.entries()) {
      if (now - session.lastActivity.getTime() > this.SESSION_TIMEOUT) {
        this.sessions.delete(chatId);
      }
    }
  }

  static isConfigured(): boolean {
    return TelegramService.isConfigured();
  }
}
