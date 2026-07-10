import { useState, useEffect } from "react";
import { Bell, BellOff, MessageSquare, Send, Check, X } from "lucide-react";
import { notificationService, NotificationPreferences } from "@/services/notification.service";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

export const NotificationSettings = () => {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [countryCode, setCountryCode] = useState("+1");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isEditingWhatsApp, setIsEditingWhatsApp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      setIsLoading(true);
      
      // Check if token exists
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No token found in localStorage');
        setPreferences(null);
        toast({
          title: "Login Required",
          description: "Please login again to configure notifications",
          variant: "destructive",
        });
        return;
      }

      const prefs = await notificationService.getPreferences();
      setPreferences(prefs);
      if (prefs.whatsappNumber) {
        setWhatsappNumber(prefs.whatsappNumber);
        // Parse existing number to extract country code and phone number
        const match = prefs.whatsappNumber.match(/^(\+\d{1,4})(\d+)$/);
        if (match) {
          setCountryCode(match[1]);
          setPhoneNumber(match[2]);
        }
      }
    } catch (error: any) {
      console.error('Error loading preferences:', error);
      
      // If unauthorized, user needs to login
      if (error.message.includes('Unauthorized') || error.message.includes('401')) {
        toast({
          title: "Session Expired",
          description: "Please login again to configure notifications",
          variant: "destructive",
        });
        setPreferences(null);
      } else {
        toast({
          title: "Error",
          description: "Failed to load notification preferences",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePush = async () => {
    if (!preferences) return;

    try {
      if (preferences.pushEnabled) {
        // Disable push
        await notificationService.unsubscribeFromPush();
        await notificationService.updatePreferences({ pushEnabled: false });
        toast({
          title: "Push Notifications Disabled",
          description: "You will no longer receive push notifications",
        });
      } else {
        // Enable push
        const success = await notificationService.subscribeToPush();
        if (success) {
          await notificationService.updatePreferences({ pushEnabled: true });
          toast({
            title: "Push Notifications Enabled",
            description: "You will now receive push notifications for site issues",
          });
        } else {
          toast({
            title: "Failed to Enable",
            description: "Could not enable push notifications. Please check your browser settings.",
            variant: "destructive",
          });
          return;
        }
      }
      await loadPreferences();
    } catch (error) {
      console.error('Error toggling push:', error);
      toast({
        title: "Error",
        description: "Failed to update push notification settings",
        variant: "destructive",
      });
    }
  };

  const handleSaveWhatsApp = async () => {
    if (!phoneNumber.trim() || !/^\d+$/.test(phoneNumber)) {
      toast({
        title: "Invalid Number",
        description: "Please enter a valid phone number (digits only)",
        variant: "destructive",
      });
      return;
    }

    const fullNumber = `${countryCode}${phoneNumber}`;

    try {
      setIsSaving(true);
      await notificationService.saveWhatsAppNumber(fullNumber);
      await notificationService.updatePreferences({ whatsappEnabled: true });
      toast({
        title: "WhatsApp Enabled",
        description: "You will now receive WhatsApp notifications",
      });
      setIsEditingWhatsApp(false);
      await loadPreferences();
    } catch (error: any) {
      console.error('Error saving WhatsApp:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save WhatsApp number",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveWhatsApp = async () => {
    try {
      await notificationService.removeWhatsAppNumber();
      await notificationService.updatePreferences({ whatsappEnabled: false });
      setWhatsappNumber("");
      setPhoneNumber("");
      setCountryCode("+1");
      toast({
        title: "WhatsApp Disabled",
        description: "WhatsApp notifications have been disabled",
      });
      await loadPreferences();
    } catch (error) {
      console.error('Error removing WhatsApp:', error);
      toast({
        title: "Error",
        description: "Failed to remove WhatsApp number",
        variant: "destructive",
      });
    }
  };

  const handleSendTest = async () => {
    try {
      await notificationService.sendTestNotification();
      toast({
        title: "Test Sent",
        description: "Check your notifications!",
      });
    } catch (error) {
      console.error('Error sending test:', error);
      toast({
        title: "Error",
        description: "Failed to send test notification",
        variant: "destructive",
      });
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
        <p className="text-xs text-muted-foreground">
          Please login to configure notification settings
        </p>
      </div>
    );
  }

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
              <div className="text-sm font-medium text-foreground">Push Notifications</div>
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
        {!preferences.hasPushSubscription && !preferences.pushEnabled && (
          <p className="text-xs text-muted-foreground pl-8">
            Enable to receive browser notifications when your sites go down
          </p>
        )}
      </div>

      {/* WhatsApp Notifications */}
      <div className="space-y-3 pt-3 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className={`w-5 h-5 ${preferences.whatsappEnabled ? "text-green-500" : "text-muted-foreground"}`} />
            <div>
              <div className="text-sm font-medium text-foreground">WhatsApp Notifications</div>
              <div className="text-xs text-muted-foreground">
                {preferences.hasWhatsAppNumber ? preferences.whatsappNumber : "Not configured"}
              </div>
            </div>
          </div>
          {preferences.hasWhatsAppNumber && !isEditingWhatsApp && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEditingWhatsApp(true)}
                className="text-xs text-primary hover:underline"
              >
                Edit
              </button>
              <button
                onClick={handleRemoveWhatsApp}
                className="text-xs text-destructive hover:underline"
              >
                Remove
              </button>
            </div>
          )}
        </div>

        <AnimatePresence>
          {(!preferences.hasWhatsAppNumber || isEditingWhatsApp) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="pl-8 space-y-2"
            >
              <div className="flex gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="px-3 py-2 rounded-md bg-secondary border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm font-mono"
                >
                  <option value="+1">🇺🇸 +1</option>
                  <option value="+44">🇬🇧 +44</option>
                  <option value="+91">🇮🇳 +91</option>
                  <option value="+86">🇨🇳 +86</option>
                  <option value="+81">🇯🇵 +81</option>
                  <option value="+49">🇩🇪 +49</option>
                  <option value="+33">🇫🇷 +33</option>
                  <option value="+39">🇮🇹 +39</option>
                  <option value="+34">🇪🇸 +34</option>
                  <option value="+7">🇷🇺 +7</option>
                  <option value="+55">🇧🇷 +55</option>
                  <option value="+52">🇲🇽 +52</option>
                  <option value="+61">🇦🇺 +61</option>
                  <option value="+82">🇰🇷 +82</option>
                  <option value="+62">🇮🇩 +62</option>
                  <option value="+63">🇵🇭 +63</option>
                  <option value="+66">🇹🇭 +66</option>
                  <option value="+84">🇻🇳 +84</option>
                  <option value="+60">🇲🇾 +60</option>
                  <option value="+65">🇸🇬 +65</option>
                  <option value="+971">🇦🇪 +971</option>
                  <option value="+966">🇸🇦 +966</option>
                  <option value="+27">🇿🇦 +27</option>
                  <option value="+234">🇳🇬 +234</option>
                  <option value="+20">🇪🇬 +20</option>
                  <option value="+92">🇵🇰 +92</option>
                  <option value="+880">🇧🇩 +880</option>
                  <option value="+90">🇹🇷 +90</option>
                  <option value="+98">🇮🇷 +98</option>
                  <option value="+64">🇳🇿 +64</option>
                </select>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    setPhoneNumber(value);
                  }}
                  placeholder="1234567890"
                  className="flex-1 px-3 py-2 rounded-md bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm font-mono"
                />
                <button
                  onClick={handleSaveWhatsApp}
                  disabled={isSaving}
                  className="px-3 py-2 rounded-md bg-primary text-black hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                </button>
                {isEditingWhatsApp && (
                  <button
                    onClick={() => {
                      setIsEditingWhatsApp(false);
                      const match = preferences.whatsappNumber?.match(/^(\+\d{1,4})(\d+)$/);
                      if (match) {
                        setCountryCode(match[1]);
                        setPhoneNumber(match[2]);
                      }
                    }}
                    className="px-3 py-2 rounded-md border border-border text-foreground hover:bg-secondary transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Select your country code and enter your phone number (digits only)
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="pt-3 border-t border-border">
        <p className="text-xs text-muted-foreground">
          You'll receive notifications when:
        </p>
        <ul className="text-xs text-muted-foreground space-y-1 mt-2 pl-4">
          <li>• A monitored site goes down</li>
          <li>• A site becomes degraded (slow response)</li>
          <li>• A site recovers from downtime</li>
          <li>• SSL certificate is expiring soon</li>
        </ul>
      </div>
    </div>
  );
};
