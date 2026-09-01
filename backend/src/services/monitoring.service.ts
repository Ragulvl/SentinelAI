import axios from 'axios';
import https from 'https';
import net from 'net';
import dns from 'dns/promises';
import { MonitoredSite, IMonitoredSite, IIncident } from '../db/models/MonitoredSite.model.js';
import { NotificationService } from './notification.service.js';

interface HealthCheckResult {
  status: 'up' | 'down' | 'degraded';
  responseTime: number;
  statusCode: number | null;
  sslValid: boolean;
  sslExpiry: Date | null;
  sslDaysLeft: number | null;
  error?: string;
  keywordFound?: boolean;
  redirected?: boolean;
  contentType?: string;
}

const HISTORY_LENGTH  = 90;
const TIMEOUT_MS      = 10000;
const DEGRADED_MS     = 2000;
const NOTIF_COOLDOWN  = 300000; // 5 min

export class MonitoringService {

  // -- URL validation (pre-add check) ---------------------------------------
  static async validateUrl(rawUrl: string): Promise<{ ok: boolean; normalized: string; error?: string }> {
    let normalized = rawUrl.trim();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    let hostname: string;
    try {
      hostname = new URL(normalized).hostname;
    } catch {
      return { ok: false, normalized, error: 'Invalid URL format' };
    }
    if (!hostname || hostname.length < 3 || !hostname.includes('.')) {
      return { ok: false, normalized, error: 'URL must contain a valid domain name' };
    }
    // DNS resolution check — confirms the host actually exists
    try {
      await dns.lookup(hostname);
    } catch {
      return { ok: false, normalized, error: `Cannot resolve hostname "${hostname}" — check the URL is correct` };
    }
    return { ok: true, normalized };
  }

  // -- Live health check -----------------------------------------------------
  static async checkSiteHealth(
    url: string,
    opts?: {
      keyword?: string;
      keywordPresent?: boolean;
      expectedStatus?: number;
      monitorType?: string;
      port?: number;
    }
  ): Promise<HealthCheckResult> {
    const { keyword, keywordPresent = true, expectedStatus = 200, monitorType = 'http', port } = opts || {};

    if (monitorType === 'port' && port) {
      return this.checkPort(url, port);
    }

    const startTime = Date.now();
    try {
      const response = await axios.get(url, {
        timeout: TIMEOUT_MS,
        maxRedirects: 5,
        // Allow self-signed certs (we handle SSL validity ourselves)
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        // Accept any status so axios doesn't throw on 4xx/5xx
        validateStatus: () => true,
        // Needed to check keyword
        responseType: 'text',
        headers: {
          'User-Agent': 'SentinelAI-Monitor/2.0 (+https://sentinalsec.vercel.app)',
          Accept: 'text/html,application/json,*/*',
        },
      });

      const responseTime = Date.now() - startTime;
      const statusCode   = response.status;
      const body         = response.data as string;
      const contentType  = response.headers['content-type'] || '';
      const redirected   = response.request?.res?.responseUrl !== url;

      // Determine keyword match
      let keywordFound: boolean | undefined;
      if (monitorType === 'keyword' && keyword) {
        keywordFound = body.toLowerCase().includes(keyword.toLowerCase());
      }

      // Determine status
      const expectedOk     = statusCode === (expectedStatus || 200);
      const keywordOk      = keywordFound === undefined || keywordFound === keywordPresent;
      const isSlowResponse = responseTime > DEGRADED_MS;

      let status: 'up' | 'down' | 'degraded';
      if (!expectedOk || !keywordOk) {
        status = 'down';
      } else if (isSlowResponse) {
        status = 'degraded';
      } else {
        status = 'up';
      }

      // SSL check
      const sslInfo = await this.checkSSL(url);

      return {
        status,
        responseTime,
        statusCode,
        sslValid: sslInfo.valid,
        sslExpiry: sslInfo.expiry,
        sslDaysLeft: sslInfo.daysLeft,
        keywordFound,
        redirected,
        contentType,
      };
    } catch (error: any) {
      return {
        status: 'down',
        responseTime: Date.now() - startTime,
        statusCode: null,
        sslValid: false,
        sslExpiry: null,
        sslDaysLeft: null,
        error: error.code === 'ECONNREFUSED' ? 'Connection refused'
             : error.code === 'ETIMEDOUT'    ? 'Request timed out'
             : error.code === 'ENOTFOUND'    ? 'Host not found'
             : error.message?.slice(0, 100) ?? 'Unknown error',
      };
    }
  }

  // -- Port check ------------------------------------------------------------
  private static checkPort(url: string, port: number): Promise<HealthCheckResult> {
    const host = new URL(url).hostname;
    const start = Date.now();
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(5000);
      socket.connect(port, host, () => {
        socket.destroy();
        resolve({ status: 'up', responseTime: Date.now() - start, statusCode: null, sslValid: true, sslExpiry: null, sslDaysLeft: null });
      });
      socket.on('timeout', () => { socket.destroy(); resolve({ status: 'down', responseTime: 5000, statusCode: null, sslValid: false, sslExpiry: null, sslDaysLeft: null, error: 'Connection timed out' }); });
      socket.on('error', (e) => resolve({ status: 'down', responseTime: Date.now() - start, statusCode: null, sslValid: false, sslExpiry: null, sslDaysLeft: null, error: e.message }));
    });
  }

  // -- SSL certificate check -------------------------------------------------
  private static async checkSSL(url: string): Promise<{ valid: boolean; expiry: Date | null; daysLeft: number | null }> {
    try {
      if (!url.startsWith('https://')) return { valid: false, expiry: null, daysLeft: null };
      const urlObj = new URL(url);

      return new Promise((resolve) => {
        const req = https.request(
          { host: urlObj.hostname, port: 443, path: '/', method: 'GET',
            rejectUnauthorized: false, servername: urlObj.hostname,
            headers: { Host: urlObj.host, 'User-Agent': 'SentinelAI-Monitor/2.0' } },
          (res) => {
            res.on('data', () => {}); res.on('end', () => {});
            const cert = (res.socket as any).getPeerCertificate?.();
            if (cert?.valid_to) {
              const expiry   = new Date(cert.valid_to);
              const daysLeft = Math.floor((expiry.getTime() - Date.now()) / 86400000);
              resolve({ valid: daysLeft > 0, expiry, daysLeft });
            } else {
              resolve({ valid: true, expiry: null, daysLeft: null });
            }
          }
        );
        req.on('error', () => resolve({ valid: true, expiry: null, daysLeft: null }));
        req.setTimeout(6000, () => { req.destroy(); resolve({ valid: true, expiry: null, daysLeft: null }); });
        req.end();
      });
    } catch {
      return { valid: true, expiry: null, daysLeft: null };
    }
  }

  // -- Add site --------------------------------------------------------------
  static async addSite(
    userId: number,
    url: string,
    opts?: {
      name?: string;
      checkInterval?: number;
      monitorType?: 'http' | 'keyword' | 'port';
      keyword?: string;
      keywordPresent?: boolean;
      expectedStatus?: number;
      port?: number;
    }
  ): Promise<IMonitoredSite> {
    const { name, checkInterval = 60, monitorType = 'http', keyword, keywordPresent = true, expectedStatus = 200, port } = opts || {};

    // Validate & normalize URL
    const validation = await this.validateUrl(url);
    if (!validation.ok) {
      throw new Error(validation.error || 'Invalid URL');
    }
    const normalizedUrl = validation.normalized;

    const siteName     = name || new URL(normalizedUrl).hostname;
    const validInterval = Math.max(30, Math.min(3600, checkInterval));

    const existing = await MonitoredSite.findOne({ userId, url: normalizedUrl });
    if (existing) throw new Error('This URL is already being monitored');

    // Live check before saving
    const health = await this.checkSiteHealth(normalizedUrl, { keyword, keywordPresent, expectedStatus, monitorType, port });

    const site = await MonitoredSite.create({
      userId,
      url: normalizedUrl,
      name: siteName,
      monitorType,
      keyword:        keyword || null,
      keywordPresent,
      expectedStatus,
      port:           port || null,
      status:         health.status,
      statusCode:     health.statusCode,
      responseTime:   health.responseTime,
      uptime:         health.status === 'up' ? 100 : 0,
      sslValid:       health.sslValid,
      sslExpiry:      health.sslExpiry,
      sslDaysLeft:    health.sslDaysLeft,
      lastChecked:    new Date(),
      responseHistory: [health.responseTime],
      statusHistory:   [health.status],
      incidents:       health.status === 'down' ? [{
        startedAt: new Date(), resolvedAt: null, duration: null,
        type: 'down', error: health.error
      }] : [],
      checkInterval:  validInterval,
    });

    return site;
  }

  // -- Get sites -------------------------------------------------------------
  static async getUserSites(userId: number): Promise<IMonitoredSite[]> {
    return MonitoredSite.find({ userId }).sort({ createdAt: -1 });
  }

  // -- Update site health ----------------------------------------------------
  static async updateSiteHealth(siteId: string): Promise<IMonitoredSite | null> {
    const site = await MonitoredSite.findById(siteId);
    if (!site) return null;

    const previousStatus = site.status;
    const health = await this.checkSiteHealth(site.url, {
      keyword: site.keyword,
      keywordPresent: site.keywordPresent,
      expectedStatus: site.expectedStatus,
      monitorType: site.monitorType,
      port: site.port ?? undefined,
    });

    // Extend histories (cap at HISTORY_LENGTH)
    const responseHistory = [...site.responseHistory, health.responseTime].slice(-HISTORY_LENGTH);
    const statusHistory   = [...site.statusHistory,   health.status      ].slice(-HISTORY_LENGTH);

    // Uptime = percentage of 'up' checks
    const upCount = statusHistory.filter(s => s === 'up').length;
    const uptime  = parseFloat(((upCount / statusHistory.length) * 100).toFixed(2));

    // Incident tracking
    let incidents = [...site.incidents];
    const openIncident = incidents.find(i => i.resolvedAt === null);

    if (health.status === 'down' || health.status === 'degraded') {
      if (!openIncident) {
        // New incident
        incidents.push({ startedAt: new Date(), resolvedAt: null, duration: null, type: health.status, error: health.error });
      }
    } else if (health.status === 'up' && openIncident) {
      // Resolve open incident
      const idx = incidents.indexOf(openIncident);
      const resolvedAt = new Date();
      const duration   = Math.round((resolvedAt.getTime() - openIncident.startedAt.getTime()) / 1000);
      incidents[idx]   = { ...openIncident, resolvedAt, duration };
    }
    // Keep last 50 incidents
    incidents = incidents.slice(-50);

    site.status         = health.status;
    site.statusCode     = health.statusCode;
    site.responseTime   = health.responseTime;
    site.uptime         = uptime;
    site.sslValid       = health.sslValid;
    site.sslExpiry      = health.sslExpiry;
    site.sslDaysLeft    = health.sslDaysLeft;
    site.lastChecked    = new Date();
    site.responseHistory = responseHistory;
    site.statusHistory   = statusHistory;
    site.incidents       = incidents as IIncident[];

    await site.save();

    await this.checkAndSendNotifications(site, previousStatus, health);

    return site;
  }

  // -- Remove / interval / refresh -------------------------------------------
  static async removeSite(userId: number, siteId: string): Promise<boolean> {
    const result = await MonitoredSite.deleteOne({ _id: siteId, userId });
    return result.deletedCount > 0;
  }

  static async updateCheckInterval(userId: number, siteId: string, checkInterval: number): Promise<IMonitoredSite | null> {
    const valid = Math.max(30, Math.min(3600, checkInterval));
    return MonitoredSite.findOneAndUpdate({ _id: siteId, userId }, { checkInterval: valid }, { new: true });
  }

  static async refreshAllUserSites(userId: number): Promise<IMonitoredSite[]> {
    const sites = await this.getUserSites(userId);
    await Promise.allSettled(sites.map(s => this.updateSiteHealth(s._id.toString())));
    return this.getUserSites(userId);
  }

  // -- Cron endpoint (called by GitHub Actions) ------------------------------
  static async runCronCheck(): Promise<{ checked: number }> {
    const now  = Date.now();
    const sites = await MonitoredSite.find({});
    const due   = sites.filter(s => {
      const age = now - new Date(s.lastChecked).getTime();
      return age >= s.checkInterval * 1000;
    });
    await Promise.allSettled(due.map(s => this.updateSiteHealth(s._id.toString())));
    return { checked: due.length };
  }

  // -- Notifications ---------------------------------------------------------
  private static async checkAndSendNotifications(
    site: IMonitoredSite,
    previousStatus: string,
    health: HealthCheckResult
  ) {
    const now = Date.now();
    const lastNotif = site.lastNotificationSent?.getTime() || 0;
    if (now - lastNotif < NOTIF_COOLDOWN) return;

    if (health.status === 'down' && previousStatus !== 'down') {
      await this.sendSiteNotification(site, 'down', {
        title: `?? ${site.name} is DOWN`,
        body: `${site.url} not responding — HTTP ${health.statusCode ?? 'N/A'} — ${health.error ?? 'Timeout'}`,
        url: '/monitoring',
      });
    } else if (health.status === 'degraded' && previousStatus === 'up') {
      await this.sendSiteNotification(site, 'degraded', {
        title: `?? ${site.name} is Degraded`,
        body: `${site.url} responding slowly (${health.responseTime}ms)`,
        url: '/monitoring',
      });
    } else if (health.status === 'up' && (previousStatus === 'down' || previousStatus === 'degraded')) {
      await this.sendSiteNotification(site, 'recovered', {
        title: `? ${site.name} Recovered`,
        body: `${site.url} is back online`,
        url: '/monitoring',
      });
    }

    if (health.sslDaysLeft !== null && health.sslDaysLeft <= 30 && health.sslDaysLeft > 0) {
      await this.sendSiteNotification(site, 'ssl_expiring', {
        title: `?? SSL Expiring Soon`,
        body: `SSL for ${site.url} expires in ${health.sslDaysLeft} days`,
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
      await NotificationService.sendNotification(site.userId, payload, payload.body);
      site.lastNotificationSent  = new Date();
      site.lastNotificationType  = type;
      site.notificationsSent     = (site.notificationsSent || 0) + 1;
      await site.save();
    } catch (e) {
      console.error('Notification error:', e);
    }
  }
}
