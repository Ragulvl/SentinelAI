import { Request, Response } from 'express';
import { MonitoringService } from '../services/monitoring.service.js';
import '../types/auth.js';

export class MonitoringController {

  // POST /api/monitoring/check  — live test any URL before saving (no auth needed for quick check)
  static async testUrl(req: Request, res: Response) {
    try {
      const { url, monitorType, keyword, keywordPresent, expectedStatus, port } = req.body;
      if (!url) return res.status(400).json({ error: 'URL is required' });

      const validation = await MonitoringService.validateUrl(url);
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error, reachable: false });
      }

      const result = await MonitoringService.checkSiteHealth(validation.normalized, {
        monitorType, keyword, keywordPresent, expectedStatus, port,
      });

      return res.json({
        reachable:    result.status !== 'down',
        status:       result.status,
        statusCode:   result.statusCode,
        responseTime: result.responseTime,
        sslValid:     result.sslValid,
        sslDaysLeft:  result.sslDaysLeft,
        keywordFound: result.keywordFound,
        error:        result.error,
        normalizedUrl: validation.normalized,
      });
    } catch (error: any) {
      console.error('URL test error:', error);
      res.status(500).json({ error: 'Failed to test URL' });
    }
  }

  // GET /api/monitoring
  static async getSites(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const sites = await MonitoringService.getUserSites(userId);
      res.json(sites);
    } catch {
      res.status(500).json({ error: 'Failed to fetch sites' });
    }
  }

  // POST /api/monitoring
  static async addSite(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { url, name, checkInterval, monitorType, keyword, keywordPresent, expectedStatus, port } = req.body;
      if (!url) return res.status(400).json({ error: 'URL is required' });

      const site = await MonitoringService.addSite(userId, url, {
        name, checkInterval, monitorType, keyword, keywordPresent, expectedStatus, port,
      });
      res.status(201).json(site);
    } catch (error: any) {
      console.error('Error adding site:', error);
      res.status(400).json({ error: error.message || 'Failed to add site' });
    }
  }

  // POST /api/monitoring/:siteId/refresh
  static async refreshSite(req: Request, res: Response) {
    try {
      const { siteId } = req.params;
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const site = await MonitoringService.updateSiteHealth(siteId);
      if (!site) return res.status(404).json({ error: 'Site not found' });
      if (site.userId !== userId) return res.status(403).json({ error: 'Forbidden' });
      res.json(site);
    } catch {
      res.status(500).json({ error: 'Failed to refresh site' });
    }
  }

  // POST /api/monitoring/refresh
  static async refreshAllSites(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const sites = await MonitoringService.refreshAllUserSites(userId);
      res.json(sites);
    } catch {
      res.status(500).json({ error: 'Failed to refresh sites' });
    }
  }

  // DELETE /api/monitoring/:siteId
  static async removeSite(req: Request, res: Response) {
    try {
      const { siteId } = req.params;
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const ok = await MonitoringService.removeSite(userId, siteId);
      if (!ok) return res.status(404).json({ error: 'Site not found' });
      res.json({ message: 'Site removed' });
    } catch {
      res.status(500).json({ error: 'Failed to remove site' });
    }
  }

  // PATCH /api/monitoring/:siteId/interval
  static async updateCheckInterval(req: Request, res: Response) {
    try {
      const { siteId } = req.params;
      const { checkInterval } = req.body;
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!checkInterval || checkInterval < 30 || checkInterval > 3600) {
        return res.status(400).json({ error: 'Interval must be 30–3600 seconds' });
      }
      const site = await MonitoringService.updateCheckInterval(userId, siteId, checkInterval);
      if (!site) return res.status(404).json({ error: 'Site not found' });
      res.json(site);
    } catch {
      res.status(500).json({ error: 'Failed to update interval' });
    }
  }

  // POST /api/monitoring/cron  — called by GitHub Actions every 5 min
  static async runCron(req: Request, res: Response) {
    try {
      const secret = req.headers['x-cron-secret'];
      if (!secret || secret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const result = await MonitoringService.runCronCheck();
      console.log(`[Cron] Checked ${result.checked} sites`);
      res.json({ ok: true, ...result });
    } catch (error: any) {
      console.error('Cron error:', error);
      res.status(500).json({ error: 'Cron failed' });
    }
  }
}
