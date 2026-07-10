import axios from 'axios';
import https from 'https';
import { MonitoredSite, IMonitoredSite } from '../db/models/MonitoredSite.model.js';
import { NotificationService } from './notification.service.js';

interface HealthCheckResult {
  status: 'up' | 'down' | 'degraded';
  responseTime: number;
  sslValid: boolean;
  sslExpiry: Date | null;
  error?: string;
}

export class MonitoringService {
  private static readonly TIMEOUT = 10000; // 10 seconds
  private static readonly DEGRADED_THRESHOLD = 500; // 500ms
  private static readonly HISTORY_LENGTH = 12;
  private static readonly NOTIFICATION_COOLDOWN = 300000; // 5 minutes between notifications

  static async checkSiteHealth(url: string): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(url, {
        timeout: this.TIMEOUT,
        validateStatus: (status) => status < 500,
        maxRedirects: 5,
        httpsAgent: new https.Agent({
          rejectUnauthorized: false, // Allow self-signed certs for checking
        }),
      });

      const responseTime = Date.now() - startTime;
      const status = response.status >= 200 && response.status < 400 
        ? (responseTime > this.DEGRADED_THRESHOLD ? 'degraded' : 'up')
        : 'degraded';

      // Check SSL certificate
      const sslInfo = await this.checkSSL(url);

      return {
        status,
        responseTime,
        sslValid: sslInfo.valid,
        sslExpiry: sslInfo.expiry,
      };
    } catch (error: any) {
      return {
        status: 'down',
        responseTime: 0,
        sslValid: false,
        sslExpiry: null,
        error: error.message,
      };
    }
  }

  private static async checkSSL(url: string): Promise<{ valid: boolean; expiry: Date | null }> {
    try {
      if (!url.startsWith('https://')) {
        return { valid: false, expiry: null };
      }

      const urlObj = new URL(url);
      
      return new Promise((resolve) => {
        const options = {
          host: urlObj.hostname,
          port: 443,
          method: 'GET',
          rejectUnauthorized: false,
        };

        const req = https.request(options, (res) => {
          const cert = (res.socket as any).getPeerCertificate();
          
          if (cert && cert.valid_to) {
            const expiry = new Date(cert.valid_to);
            const now = new Date();
            const valid = expiry > now;
            
            resolve({ valid, expiry });
          } else {
            resolve({ valid: false, expiry: null });
          }
        });

        req.on('error', () => {
          resolve({ valid: false, expiry: null });
        });

        req.end();
      });
    } catch (error) {
      return { valid: false, expiry: null };
    }
  }

  static async addSite(userId: number, url: string, name?: string, checkInterval: number = 60): Promise<IMonitoredSite> {
    // Normalize URL
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
    
    // Generate name if not provided
    const siteName = name || new URL(normalizedUrl).hostname;

    // Validate check interval
    const validInterval = Math.max(30, Math.min(3600, checkInterval));

    // Check if site already exists for this user
    const existing = await MonitoredSite.findOne({ userId, url: normalizedUrl });
    if (existing) {
      throw new Error('Site already being monitored');
    }

    // Perform initial health check
    const healthCheck = await this.checkSiteHealth(normalizedUrl);

    // Create monitored site
    const site = await MonitoredSite.create({
      userId,
      url: normalizedUrl,
      name: siteName,
      status: healthCheck.status,
      responseTime: healthCheck.responseTime,
      uptime: healthCheck.status === 'up' ? 100 : 0,
      sslValid: healthCheck.sslValid,
      sslExpiry: healthCheck.sslExpiry,
      lastChecked: new Date(),
      responseHistory: [healthCheck.responseTime],
      statusHistory: [healthCheck.status],
      checkInterval: validInterval,
    });

    return site;
  }

  static async getUserSites(userId: number): Promise<IMonitoredSite[]> {
    return MonitoredSite.find({ userId }).sort({ createdAt: -1 });
  }

  static async updateSiteHealth(siteId: string): Promise<IMonitoredSite | null> {
    const site = await MonitoredSite.findById(siteId);
    if (!site) return null;

    const previousStatus = site.status;
    const healthCheck = await this.checkSiteHealth(site.url);

    // Update response history (keep last 12)
    const responseHistory = [...site.responseHistory, healthCheck.responseTime].slice(-this.HISTORY_LENGTH);
    
    // Update status history (keep last 12)
    const statusHistory = [...site.statusHistory, healthCheck.status].slice(-this.HISTORY_LENGTH);

    // Calculate uptime based on status history
    const upCount = statusHistory.filter(s => s === 'up').length;
    const uptime = (upCount / statusHistory.length) * 100;

    site.status = healthCheck.status;
    site.responseTime = healthCheck.responseTime;
    site.uptime = parseFloat(uptime.toFixed(2));
    site.sslValid = healthCheck.sslValid;
    site.sslExpiry = healthCheck.sslExpiry;
    site.lastChecked = new Date();
    site.responseHistory = responseHistory;
    site.statusHistory = statusHistory;

    await site.save();

    // Check if we should send notifications
    await this.checkAndSendNotifications(site, previousStatus, healthCheck);

    return site;
  }

  static async removeSite(userId: number, siteId: string): Promise<boolean> {
    const result = await MonitoredSite.deleteOne({ _id: siteId, userId });
    return result.deletedCount > 0;
  }

  static async updateCheckInterval(userId: number, siteId: string, checkInterval: number): Promise<IMonitoredSite | null> {
    // Validate check interval
    const validInterval = Math.max(30, Math.min(3600, checkInterval));
    
    const site = await MonitoredSite.findOneAndUpdate(
      { _id: siteId, userId },
      { checkInterval: validInterval },
      { new: true }
    );
    
    return site;
  }

  static async refreshAllUserSites(userId: number): Promise<IMonitoredSite[]> {
    const sites = await this.getUserSites(userId);
    
    // Update all sites in parallel
    const updates = sites.map(site => this.updateSiteHealth(site._id.toString()));
    await Promise.all(updates);

    // Return updated sites
    return this.getUserSites(userId);
  }

  // Check and send notifications based on site status changes
  private static async checkAndSendNotifications(
    site: IMonitoredSite,
    previousStatus: string,
    healthCheck: HealthCheckResult
  ) {
    const now = Date.now();
    const lastNotification = site.lastNotificationSent?.getTime() || 0;
    const cooldownPassed = (now - lastNotification) > this.NOTIFICATION_COOLDOWN;

    // Site went down
    if (healthCheck.status === 'down' && previousStatus !== 'down' && cooldownPassed) {
      await this.sendSiteNotification(site, 'down', {
        title: `🚨 ${site.name} is DOWN`,
        body: `Your website ${site.url} is not responding. Error: ${healthCheck.error || 'Timeout'}`,
        url: '/monitoring',
      });
    }

    // Site became degraded
    if (healthCheck.status === 'degraded' && previousStatus === 'up' && cooldownPassed) {
      await this.sendSiteNotification(site, 'degraded', {
        title: `⚠️ ${site.name} is Degraded`,
        body: `Your website ${site.url} is responding slowly (${healthCheck.responseTime}ms)`,
        url: '/monitoring',
      });
    }

    // Site recovered
    if (healthCheck.status === 'up' && (previousStatus === 'down' || previousStatus === 'degraded')) {
      await this.sendSiteNotification(site, 'recovered', {
        title: `✅ ${site.name} Recovered`,
        body: `Your website ${site.url} is back online and responding normally`,
        url: '/monitoring',
      });
    }

    // SSL certificate expiring soon (within 30 days)
    if (healthCheck.sslExpiry) {
      const daysUntilExpiry = Math.floor(
        (healthCheck.sslExpiry.getTime() - now) / (1000 * 60 * 60 * 24)
      );

      if (daysUntilExpiry <= 30 && daysUntilExpiry > 0 && cooldownPassed) {
        if (site.lastNotificationType !== 'ssl_expiring' || daysUntilExpiry <= 7) {
          await this.sendSiteNotification(site, 'ssl_expiring', {
            title: `🔒 SSL Certificate Expiring Soon`,
            body: `SSL certificate for ${site.url} expires in ${daysUntilExpiry} days`,
            url: '/monitoring',
          });
        }
      }
    }

    // SSL certificate invalid
    if (!healthCheck.sslValid && site.url.startsWith('https://') && cooldownPassed) {
      await this.sendSiteNotification(site, 'ssl_expiring', {
        title: `🔓 SSL Certificate Invalid`,
        body: `SSL certificate for ${site.url} is invalid or expired`,
        url: '/monitoring',
      });
    }
  }

  private static async sendSiteNotification(
    site: IMonitoredSite,
    type: 'down' | 'degraded' | 'ssl_expiring' | 'recovered',
    payload: { title: string; body: string; url: string }
  ) {
    try {
      // Prepare WhatsApp message with better formatting
      let whatsappMessage = payload.body;
      
      // For content template, prepare variables
      let contentVariables: Record<string, string> | undefined;
      
      if (type === 'down') {
        whatsappMessage = `🚨 *ALERT: Website Down*\n\n${site.name}\n${site.url}\n\nStatus: Not responding\nTime: ${new Date().toLocaleString()}\n\nPlease check your website immediately.`;
        contentVariables = {
          "1": site.name,
          "2": "Down - Not responding"
        };
      } else if (type === 'degraded') {
        whatsappMessage = `⚠️ *WARNING: Slow Response*\n\n${site.name}\n${site.url}\n\nResponse Time: ${site.responseTime}ms\nTime: ${new Date().toLocaleString()}\n\nYour website is responding slowly.`;
        contentVariables = {
          "1": site.name,
          "2": `Degraded - ${site.responseTime}ms`
        };
      } else if (type === 'recovered') {
        whatsappMessage = `✅ *RECOVERED: Website Back Online*\n\n${site.name}\n${site.url}\n\nStatus: Operational\nTime: ${new Date().toLocaleString()}\n\nYour website is back to normal.`;
        contentVariables = {
          "1": site.name,
          "2": "Recovered - Online"
        };
      } else if (type === 'ssl_expiring') {
        const daysUntilExpiry = site.sslExpiry 
          ? Math.floor((site.sslExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : 0;
        whatsappMessage = `🔒 *SSL ALERT: Certificate Issue*\n\n${site.name}\n${site.url}\n\n${daysUntilExpiry > 0 ? `Expires in: ${daysUntilExpiry} days` : 'Status: Invalid/Expired'}\nTime: ${new Date().toLocaleString()}\n\nPlease renew your SSL certificate.`;
        contentVariables = {
          "1": site.name,
          "2": daysUntilExpiry > 0 ? `Expires in ${daysUntilExpiry} days` : "Invalid/Expired"
        };
      }

      // Send notification through all channels
      await NotificationService.sendNotification(site.userId, payload, whatsappMessage);

      // Update site notification tracking
      site.lastNotificationSent = new Date();
      site.lastNotificationType = type;
      site.notificationsSent = (site.notificationsSent || 0) + 1;
      await site.save();

      console.log(`📧 Notification sent for ${site.name}: ${type}`);
    } catch (error) {
      console.error(`Error sending notification for ${site.name}:`, error);
    }
  }
}
