import { MonitoredSite } from '../db/models/MonitoredSite.model.js';
import { MonitoringService } from '../services/monitoring.service.js';
import { logger } from '../config/logger.js';

export class MonitoringWorker {
  private static interval: NodeJS.Timeout | null = null;
  private static readonly CHECK_INTERVAL = 60000; // 1 minute

  static start() {
    if (this.interval) {
      logger.warn('Monitoring worker already running');
      return;
    }

    logger.info('Starting monitoring worker...');
    
    // Run immediately on start
    this.checkAllSites();

    // Then run periodically
    this.interval = setInterval(() => {
      this.checkAllSites();
    }, this.CHECK_INTERVAL);

    logger.info(`Monitoring worker started (checking every ${this.CHECK_INTERVAL / 1000}s)`);
  }

  static stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('Monitoring worker stopped');
    }
  }

  private static async checkAllSites() {
    try {
      const sites = await MonitoredSite.find({});
      
      if (sites.length === 0) {
        return;
      }

      const now = Date.now();
      
      // Filter sites that need checking based on their individual intervals
      const sitesToCheck = sites.filter(site => {
        const lastCheckedTime = new Date(site.lastChecked).getTime();
        const intervalMs = site.checkInterval * 1000;
        return (now - lastCheckedTime) >= intervalMs;
      });

      if (sitesToCheck.length === 0) {
        return;
      }

      logger.info('Checking monitored sites', { checking: sitesToCheck.length, total: sites.length });

      // Check all sites in parallel
      const updates = sitesToCheck.map(site => 
        MonitoringService.updateSiteHealth(site._id.toString())
          .catch(err => logger.error(`Error checking ${site.url}:`, { error: err.message }))
      );
      
      await Promise.allSettled(updates);

      logger.info('Site check complete', { checked: sitesToCheck.length });
    } catch (error: any) {
      logger.error('Error in monitoring worker check', { error: error.message });
    }
  }
}
