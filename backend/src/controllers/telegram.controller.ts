import { Request, Response } from 'express';
import { TelegramWorker } from '../workers/telegram.worker.js';
import { TelegramService } from '../services/telegram.service.js';
import { User } from '../db/models/User.model.js';
import '../types/auth.js';

export class TelegramController {
  /**
   * Receive updates from Telegram (webhook POST)
   */
  static async handleWebhook(req: Request, res: Response) {
    try {
      // Always respond 200 immediately — Telegram expects fast ACK
      res.sendStatus(200);
      await TelegramWorker.handleUpdate(req.body);
    } catch (error: any) {
      console.error('Error handling Telegram webhook:', error.message);
    }
  }

  /**
   * Link Telegram chat_id to the authenticated user's account
   * Called from the frontend Settings page after user gets their chat_id from the bot
   */
  static async linkTelegram(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      const { chatId } = req.body;

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!chatId) return res.status(400).json({ error: 'chatId is required' });

      // Verify this chat_id is real by sending a confirmation message
      const confirmed = await TelegramService.sendMessage(
        String(chatId),
        `✅ <b>SentinelAI linked successfully!</b>\n\nYou will now receive security alerts here.\n\nSend /help to see available commands.`
      );

      if (!confirmed) {
        return res.status(400).json({
          error: 'Could not reach that chat ID. Make sure you sent /start to the bot first.',
        });
      }

      await User.findOneAndUpdate(
        { githubId: userId },
        { $set: { telegramChatId: String(chatId), telegramNotificationsEnabled: true } }
      );

      res.json({ message: 'Telegram notifications enabled' });
    } catch (error: any) {
      console.error('Error linking Telegram:', error);
      res.status(500).json({ error: 'Failed to link Telegram' });
    }
  }

  /**
   * Unlink Telegram from the user's account
   */
  static async unlinkTelegram(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      await User.findOneAndUpdate(
        { githubId: userId },
        { $unset: { telegramChatId: 1 }, $set: { telegramNotificationsEnabled: false } }
      );

      res.json({ message: 'Telegram notifications disabled' });
    } catch (error: any) {
      console.error('Error unlinking Telegram:', error);
      res.status(500).json({ error: 'Failed to unlink Telegram' });
    }
  }

  /**
   * Get Telegram bot status and bot username for linking
   */
  static async getStatus(req: Request, res: Response) {
    const configured = TelegramService.isConfigured();
    let botUsername: string | null = null;

    if (configured) {
      const info = await TelegramService.getBotInfo();
      botUsername = info?.username || null;
    }

    res.json({ configured, botUsername });
  }
}
