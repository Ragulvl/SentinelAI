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
router.post('/:siteId/refresh',             MonitoringController.refreshSite);
router.patch('/:siteId/interval',           MonitoringController.updateCheckInterval);
router.delete('/:siteId',                   MonitoringController.removeSite);

export default router;
