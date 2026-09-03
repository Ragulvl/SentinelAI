import { useState, useEffect } from "react";
import { Bell, BellOff, Send, Check, X, ExternalLink } from "lucide-react";
import { notificationService, NotificationPreferences } from "@/services/notification.service";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

export const NotificationSettings = () => {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chatId, setChatId] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);

  useEffect(() => {
    loadPreferences();
    loadBotStatus();
  }, []);

  const loadBotStatus = async () => {
    const status = await notificationService.getTelegramBotStatus();
    setBotUsername(status.botUsername);
  };

  const loadPreferences = async () => {
    try {
      setIsLoading(true);
            if (!token) {
        setPreferences(null);
        toast({ title: "Login Required", description: "Please login again to configure notifications", variant: "destructive" });
        return;
      }
      const prefs = await notificationService.getPreferences();
      setPreferences(prefs);
    } catch (error: any) {
      console.error("Error loading preferences:", error);
      if (error.message.includes("Unauthorized") || error.message.includes("401")) {
        toast({ title: "Session Expired", description: "Please login again", variant: "destructive" });
        setPreferences(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePush = async () => {
    if (!preferences) return;
    try {
      if (preferences.pushEnabled) {
        await notificationService.unsubscribeFromPush();
        await notificationService.updatePreferences({ pushEnabled: false });
        toast({ title: "Push Notifications Disabled" });
      } else {
        const success = await notificationService.subscribeToPush();
        if (success) {
          await notificationService.updatePreferences({ pushEnabled: true });
          toast({ title: "Push Notifications Enabled", description: "You'll receive browser alerts for site issues" });
        } else {
          toast({ title: "Failed to Enable", description: "Check your browser notification settings", variant: "destructive" });
          return;
        }
      }
      await loadPreferences();
    } catch (error) {
      toast({ title: "Error", description: "Failed to update push settings", variant: "destructive" });
    }
  };

  const handleLinkTelegram = async () => {
    if (!chatId.trim() || !/^\d+$/.test(chatId.trim())) {
      toast({ title: "Invalid Chat ID", description: "Chat ID must be a number (e.g. 123456789)", variant: "destructive" });
      return;
    }
    try {
      setIsLinking(true);
      await notificationService.linkTelegram(chatId.trim());
      toast({
        title: "✅ Telegram Linked!",
        description: "Check Telegram — you should have received a confirmation message",
      });
      setIsEditing(false);
      setChatId("");
      await loadPreferences();
    } catch (error: any) {
      toast({ title: "Failed to Link", description: error.message || "Make sure you sent /start to the bot first", variant: "destructive" });
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkTelegram = async () => {
    try {
      await notificationService.unlinkTelegram();
      toast({ title: "Telegram Unlinked", description: "Telegram notifications have been disabled" });
      await loadPreferences();
    } catch (error) {
      toast({ title: "Error", description: "Failed to unlink Telegram", variant: "destructive" });
    }
  };

  const handleSendTest = async () => {
    try {
      await notificationService.sendTestNotification();
      toast({ title: "Test Sent!", description: "Check your Telegram and browser notifications" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to send test notification", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-secondary rounded w-1/3"></div>
          <div className="h-10 bg-secondary rounded"></div>
          <div className="h-10 bg-secondary rounded"></div>
        </div>
      </div>
    );
  }

  if (!preferences) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-center">
        <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-sm font-medium text-foreground mb-2">Login Required</h3>
        <p className="text-xs text-muted-foreground">Please login to configure notification settings</p>
      </div>
    );
  }

  const telegramBotLink = botUsername ? `https://t.me/${botUsername}` : "https://t.me/";

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-foreground">Notification Settings</h3>
        <button
          onClick={handleSendTest}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-foreground text-sm hover:bg-secondary transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          Test
        </button>
      </div>

      {/* Push Notifications */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {preferences.pushEnabled ? (
              <Bell className="w-5 h-5 text-primary" />
            ) : (
              <BellOff className="w-5 h-5 text-muted-foreground" />
            )}
            <div>
              <div className="text-sm font-medium text-foreground">Browser Push Notifications</div>
              <div className="text-xs text-muted-foreground">
                {preferences.pushEnabled ? "Enabled" : "Disabled"}
              </div>
            </div>
          </div>
          <button
            onClick={handleTogglePush}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              preferences.pushEnabled ? "bg-primary" : "bg-secondary"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                preferences.pushEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Telegram Notifications */}
      <div className="space-y-3 pt-3 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Telegram logo icon */}
            <svg
              className={`w-5 h-5 ${preferences.telegramEnabled ? "text-[#2AABEE]" : "text-muted-foreground"}`}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.48 13.801l-2.95-.924c-.642-.2-.654-.642.136-.953l11.527-4.444c.537-.194 1.006.131.37.768z" />
            </svg>
            <div>
              <div className="text-sm font-medium text-foreground">Telegram Notifications</div>
              <div className="text-xs text-muted-foreground">
                {preferences.hasTelegramChatId
                  ? `Connected • Chat ID: ${preferences.telegramChatId}`
                  : "Not connected"}
              </div>
            </div>
          </div>
          {preferences.hasTelegramChatId && !isEditing && (
            <div className="flex items-center gap-2">
              <button onClick={() => setIsEditing(true)} className="text-xs text-primary hover:underline">
                Change
              </button>
              <button onClick={handleUnlinkTelegram} className="text-xs text-destructive hover:underline">
                Unlink
              </button>
            </div>
          )}
        </div>

        <AnimatePresence>
          {(!preferences.hasTelegramChatId || isEditing) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="pl-8 space-y-3"
            >
              {/* Step-by-step instructions */}
              <div className="rounded-md bg-secondary/50 border border-border p-3 space-y-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">How to connect Telegram:</p>
                <ol className="space-y-1 list-decimal pl-4">
                  <li>
                    Open{" "}
                    <a
                      href={telegramBotLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#2AABEE] hover:underline inline-flex items-center gap-1"
                    >
                      {botUsername ? `@${botUsername}` : "the SentinelAI bot"}
                      <ExternalLink className="w-3 h-3" />
                    </a>{" "}
                    on Telegram
                  </li>
                  <li>Send <code className="bg-secondary px-1 rounded">/start</code> to the bot</li>
                  <li>The bot will reply with your <strong>Chat ID</strong></li>
                  <li>Paste it below and click ✓</li>
                </ol>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value.replace(/\D/g, ""))}
                  placeholder="Your Telegram Chat ID (e.g. 123456789)"
                  className="flex-1 px-3 py-2 rounded-md bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#2AABEE]/50 text-sm font-mono"
                />
                <button
                  onClick={handleLinkTelegram}
                  disabled={isLinking || !chatId.trim()}
                  className="px-3 py-2 rounded-md bg-[#2AABEE] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isLinking ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                </button>
                {isEditing && (
                  <button
                    onClick={() => { setIsEditing(false); setChatId(""); }}
                    className="px-3 py-2 rounded-md border border-border text-foreground hover:bg-secondary transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* What triggers notifications */}
      <div className="pt-3 border-t border-border">
        <p className="text-xs text-muted-foreground">You'll receive alerts when:</p>
        <ul className="text-xs text-muted-foreground space-y-1 mt-2 pl-4">
          <li>• 🚨 Security vulnerabilities found in a scan</li>
          <li>• ⬇️ A monitored site goes down</li>
          <li>• ⚠️ A site becomes degraded (slow response)</li>
          <li>• ✅ A site recovers from downtime</li>
          <li>• 🔒 SSL certificate is expiring soon</li>
        </ul>
      </div>
    </div>
  );
};
