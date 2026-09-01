import { Router } from 'express';
import { MonitoringController } from '../controllers/monitoring.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// Public cron endpoint — authenticated via CRON_SECRET header, NOT user JWT
router.post('/cron', MonitoringController.runCron);

// Live URL test — requires auth to prevent abuse
router.post('/check', authMiddleware, MonitoringController.testUrl);

// All routes below require user auth
router.use(authMiddleware);

router.get('/',                                              MonitoringController.getSites);
router.post('/',                                             MonitoringController.addSite);
router.post('/refresh',                                      MonitoringController.refreshAllSites);
router.post('/:siteId([a-zA-Z0-9_-]+)/refresh',             MonitoringController.refreshSite);
router.patch('/:siteId([a-zA-Z0-9_-]+)/interval',           MonitoringController.updateCheckInterval);
router.delete('/:siteId([a-zA-Z0-9_-]+)',                   MonitoringController.removeSite);

export default router;
