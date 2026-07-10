import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Push notification routes
router.post('/push/subscribe', NotificationController.subscribePush);
router.post('/push/unsubscribe', NotificationController.unsubscribePush);
router.get('/push/vapid-key', NotificationController.getVapidPublicKey);

// WhatsApp notification routes
router.post('/whatsapp/save', NotificationController.saveWhatsApp);
router.delete('/whatsapp/remove', NotificationController.removeWhatsApp);

// Preferences
router.get('/preferences', NotificationController.getPreferences);
router.put('/preferences', NotificationController.updatePreferences);

// Test notification
router.post('/test', NotificationController.sendTest);

export default router;
