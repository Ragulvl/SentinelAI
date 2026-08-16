import { Router } from 'express';
import { TelegramController } from '../controllers/telegram.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// Telegram webhook — no auth (Telegram calls this directly)
router.post('/webhook', TelegramController.handleWebhook);

// Bot status — public (used by frontend to show bot username)
router.get('/status', TelegramController.getStatus);

// Link/unlink — requires user auth
router.post('/link', authMiddleware, TelegramController.linkTelegram);
router.delete('/unlink', authMiddleware, TelegramController.unlinkTelegram);

export default router;
