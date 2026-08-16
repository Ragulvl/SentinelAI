import { User } from '../db/models/User.model.js';
import { TelegramService } from '../services/telegram.service.js';
import { MonitoredSite } from '../db/models/MonitoredSite.model.js';
import { Scan } from '../db/models/Scan.model.js';

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

export class TelegramWorker {
  private static processedUpdates = new Set<number>();

  static async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (!update.message) return;

    const { message } = update;
    const chatId = String(message.chat.id);
    const rawText = message.text;
    if (!rawText) return;                          // ignore non-text messages (stickers, photos, etc.)
    const text = rawText.trim();
    const cmd  = text.split(' ')[0].toLowerCase().replace('@sentinal_ai_alert_bot', '');

    // Deduplicate
    if (this.processedUpdates.has(update.update_id)) return;
    this.processedUpdates.add(update.update_id);
    if (this.processedUpdates.size > 500) {
      this.processedUpdates.delete(Array.from(this.processedUpdates)[0]);
    }

    console.log(`📨 Telegram [${chatId}]: ${text}`);

    // Route commands — always fire typing indicator first for instant feedback
    await TelegramService.sendTyping(chatId);

    switch (cmd) {
      case '/start':   return this.cmdStart(chatId, message.from);
      case '/help':    return this.cmdHelp(chatId);
      case '/status':  return this.cmdStatus(chatId);
      case '/sites':   return this.cmdSites(chatId);
      case '/alerts':  return this.cmdAlerts(chatId);
      case '/report':  return this.cmdReport(chatId);
      case '/scan':    return this.cmdScan(chatId);
      case '/pause':   return this.cmdPause(chatId);
      case '/resume':  return this.cmdResume(chatId);
      case '/unlink':  return this.cmdUnlink(chatId);
      default:         return this.cmdUnknown(chatId);
    }

  }

  // ── /start ─────────────────────────────────────────────────────────────────
  private static async cmdStart(chatId: string, from: { id: number; first_name: string }) {
    const existing = await User.findOne({ telegramChatId: chatId });

    if (existing) {
      await TelegramService.sendMessage(chatId,
        `Welcome back, <b>${existing.name}</b>.\n\n` +
        `Your account is linked. Send /help to see what you can do.`
      );
      return;
    }

    await TelegramService.sendMessage(chatId,
      `<b>SentinelAI Alerts</b>\n\n` +
      `Your Chat ID: <code>${chatId}</code>\n\n` +
      `To receive security alerts:\n` +
      `1. Go to <b>sentinalsec.vercel.app</b>\n` +
      `2. Open Settings → Notifications\n` +
      `3. Select Telegram and enter your Chat ID\n\n` +
      `Once linked, you will get instant alerts for:\n` +
      `— Code vulnerabilities\n` +
      `— Site downtime\n` +
      `— SSL certificate issues\n\n` +
      `Send /help to see all commands.`
    );
  }

  // ── /help ──────────────────────────────────────────────────────────────────
  private static async cmdHelp(chatId: string) {
    await TelegramService.sendMessage(chatId,
      `<b>SentinelAI — Commands</b>\n\n` +
      `/status — Overall monitoring status\n` +
      `/sites — List all monitored websites\n` +
      `/alerts — Recent security alerts\n` +
      `/report — Latest code scan report\n` +
      `/scan — Run a new repository scan\n` +
      `/pause — Pause notifications\n` +
      `/resume — Resume notifications\n` +
      `/unlink — Disconnect this Telegram\n` +
      `/help — Show this message\n\n` +
      `Dashboard: sentinalsec.vercel.app`
    );
  }

  // ── /status ────────────────────────────────────────────────────────────────
  private static async cmdStatus(chatId: string) {
    const user = await User.findOne({ telegramChatId: chatId });
    if (!user) return this.notLinked(chatId);

    try {
      const sites = await MonitoredSite.find({ userId: user.githubId }).lean();
      if (!sites.length) {
        await TelegramService.sendMessage(chatId,
          `<b>Monitoring Status</b>\n\nNo sites configured yet.\n\nAdd a site at sentinalsec.vercel.app/monitoring`
        );
        return;
      }

      const up       = sites.filter(s => s.status === 'up').length;
      const down     = sites.filter(s => s.status === 'down').length;
      const degraded = sites.filter(s => s.status === 'degraded').length;

      const overall = down > 0 ? '🔴 Incident Active' : degraded > 0 ? '🟡 Degraded' : '🟢 All Systems Operational';

      await TelegramService.sendMessage(chatId,
        `<b>Monitoring Status</b>\n\n` +
        `${overall}\n\n` +
        `Up: ${up}   Down: ${down}   Degraded: ${degraded}\n` +
        `Total monitored: ${sites.length}\n\n` +
        `Use /sites for details.`
      );
    } catch {
      await TelegramService.sendMessage(chatId, 'Could not fetch status. Try again shortly.');
    }
  }

  // ── /sites ─────────────────────────────────────────────────────────────────
  private static async cmdSites(chatId: string) {
    const user = await User.findOne({ telegramChatId: chatId });
    if (!user) return this.notLinked(chatId);

    try {
      const sites = await MonitoredSite.find({ userId: user.githubId }).lean();
      if (!sites.length) {
        await TelegramService.sendMessage(chatId,
          `No monitored sites yet.\n\nAdd one at sentinalsec.vercel.app/monitoring`
        );
        return;
      }

      const icon = (s: string) => s === 'up' ? '🟢' : s === 'down' ? '🔴' : '🟡';

      const lines = sites.map(s =>
        `${icon(s.status)} <b>${s.name}</b>\n` +
        `   ${s.url}\n` +
        `   Response: ${s.responseTime ?? '—'}ms`
      ).join('\n\n');

      await TelegramService.sendMessage(chatId, `<b>Monitored Sites</b>\n\n${lines}`);
    } catch {
      await TelegramService.sendMessage(chatId, 'Could not fetch sites. Try again shortly.');
    }
  }

  // ── /alerts ────────────────────────────────────────────────────────────────
  private static async cmdAlerts(chatId: string) {
    const user = await User.findOne({ telegramChatId: chatId });
    if (!user) return this.notLinked(chatId);

    try {
      const scans = await Scan.find({ userId: user.githubId, status: 'completed' })
        .sort({ completedAt: -1 })
        .limit(3)
        .lean();

      if (!scans.length) {
        await TelegramService.sendMessage(chatId, 'No completed scans yet.\n\nRun /scan to start one.');
        return;
      }

      const lines = scans.map(s => {
        const sev = s.summary?.critical > 0 ? '🔴' : s.summary?.high > 0 ? '🟠' : '🟢';
        return (
          `${sev} <b>${s.repoName}</b>\n` +
          `   Critical: ${s.summary?.critical ?? 0}  High: ${s.summary?.high ?? 0}  ` +
          `Medium: ${s.summary?.medium ?? 0}  Low: ${s.summary?.low ?? 0}\n` +
          `   ${new Date(s.completedAt!).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}`
        );
      }).join('\n\n');

      await TelegramService.sendMessage(chatId,
        `<b>Recent Scan Alerts</b>\n\n${lines}\n\nFull reports: sentinalsec.vercel.app/history`
      );
    } catch {
      await TelegramService.sendMessage(chatId, 'Could not fetch alerts. Try again shortly.');
    }
  }

  // ── /report ────────────────────────────────────────────────────────────────
  private static async cmdReport(chatId: string) {
    const user = await User.findOne({ telegramChatId: chatId });
    if (!user) return this.notLinked(chatId);

    try {
      const scan = await Scan.findOne({ userId: user.githubId, status: 'completed' })
        .sort({ completedAt: -1 })
        .lean();

      if (!scan) {
        await TelegramService.sendMessage(chatId, 'No scan reports found.\n\nRun /scan to start one.');
        return;
      }

      const topVulns = (scan.vulnerabilities ?? [])
        .filter((v: any) => v.severity === 'critical' || v.severity === 'high')
        .slice(0, 5);

      const vulnLines = topVulns.length
        ? topVulns.map((v: any, i: number) =>
            `${i + 1}. [${v.severity.toUpperCase()}] ${v.title}\n   ${v.file}:${v.line}`
          ).join('\n')
        : 'No critical or high severity issues.';

      await TelegramService.sendMessage(chatId,
        `<b>Latest Scan Report</b>\n\n` +
        `<b>Repo:</b> ${scan.repoFullName}\n` +
        `<b>Scanned:</b> ${new Date(scan.completedAt!).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}\n\n` +
        `<b>Summary</b>\n` +
        `Critical: ${scan.summary?.critical ?? 0}\n` +
        `High:     ${scan.summary?.high ?? 0}\n` +
        `Medium:   ${scan.summary?.medium ?? 0}\n` +
        `Low:      ${scan.summary?.low ?? 0}\n\n` +
        `<b>Top Issues</b>\n${vulnLines}\n\n` +
        `Full report: sentinalsec.vercel.app/results?scanId=${scan._id}`
      );
    } catch {
      await TelegramService.sendMessage(chatId, 'Could not fetch report. Try again shortly.');
    }
  }

  // ── /scan ──────────────────────────────────────────────────────────────────
  private static async cmdScan(chatId: string) {
    const user = await User.findOne({ telegramChatId: chatId });
    if (!user) return this.notLinked(chatId);

    await TelegramService.sendMessage(chatId,
      `<b>Start a Scan</b>\n\n` +
      `To run a security scan, visit the dashboard and select a repository:\n\n` +
      `sentinalsec.vercel.app/scan\n\n` +
      `When the scan completes, you will receive a full report here automatically.`
    );
  }

  // ── /pause ─────────────────────────────────────────────────────────────────
  private static async cmdPause(chatId: string) {
    const user = await User.findOne({ telegramChatId: chatId });
    if (!user) return this.notLinked(chatId);

    await User.findOneAndUpdate(
      { telegramChatId: chatId },
      { $set: { telegramNotificationsEnabled: false } }
    );
    await TelegramService.sendMessage(chatId,
      'Notifications paused.\n\nSend /resume to turn them back on.'
    );
  }

  // ── /resume ────────────────────────────────────────────────────────────────
  private static async cmdResume(chatId: string) {
    const user = await User.findOne({ telegramChatId: chatId });
    if (!user) return this.notLinked(chatId);

    await User.findOneAndUpdate(
      { telegramChatId: chatId },
      { $set: { telegramNotificationsEnabled: true } }
    );
    await TelegramService.sendMessage(chatId,
      'Notifications resumed.\n\nYou will receive alerts for all monitored activity.'
    );
  }

  // ── /unlink ────────────────────────────────────────────────────────────────
  private static async cmdUnlink(chatId: string) {
    const user = await User.findOne({ telegramChatId: chatId });
    if (!user) {
      await TelegramService.sendMessage(chatId, 'No account linked to this chat.');
      return;
    }

    await User.findOneAndUpdate(
      { telegramChatId: chatId },
      { $unset: { telegramChatId: 1 }, $set: { telegramNotificationsEnabled: false } }
    );
    await TelegramService.sendMessage(chatId,
      'Account unlinked.\n\nYou will no longer receive notifications here.\n\nSend /start to link again.'
    );
  }

  // ── Unknown command ────────────────────────────────────────────────────────
  private static async cmdUnknown(chatId: string) {
    const user = await User.findOne({ telegramChatId: chatId });
    if (!user) return this.notLinked(chatId);
    await TelegramService.sendMessage(chatId, 'Unknown command. Send /help to see available commands.');
  }

  // ── Not linked message ─────────────────────────────────────────────────────
  private static async notLinked(chatId: string) {
    await TelegramService.sendMessage(chatId,
      `Account not linked.\n\n` +
      `Send /start to get your Chat ID, then link it at:\n` +
      `sentinalsec.vercel.app → Settings → Notifications`
    );
  }
}
