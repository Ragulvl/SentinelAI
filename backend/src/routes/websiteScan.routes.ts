import { Router, Request, Response, NextFunction } from 'express';
import { WebsiteScanController } from '../controllers/websiteScan.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireSuperAdmin } from '../middleware/admin.middleware.js';

const router = Router();

// SSE streaming endpoints — must be BEFORE authMiddleware because
// EventSource sends cookies (withCredentials:true); auth is via httpOnly cookie or ?token= fallback
router.get('/pentest/stream', WebsiteScanController.penetrationTestStream);
router.get('/loadtest/stream', WebsiteScanController.loadTestStream);

// All routes below require authentication
router.use(authMiddleware);

// CWE-20: Domain presence validation middleware
const requireDomain = (req: Request, res: Response, next: NextFunction) => {
  if (!req.body?.domain) {
    return res.status(400).json({ error: 'Missing required field: domain' });
  }
  next();
};

// ─── Domain Verification (any authenticated user) ────────────────────────────
router.post('/verify/initiate', requireDomain, WebsiteScanController.initiateVerification);
router.post('/verify/check', WebsiteScanController.verifyDomain);
router.get('/verify/domains', WebsiteScanController.getVerifiedDomains);
router.get('/verify/status', WebsiteScanController.checkDomainVerification);
// CWE-639: Restrict domain param to hostname-safe characters
router.delete('/verify/domains/:domain', WebsiteScanController.deleteDomain);

// ─── Bypass routes — SUPERADMIN ONLY ────────────────────────────────────────
// These skip the normal DNS/file/meta ownership challenge.
// Restricted to SUPERADMIN only — not even regular admins can bypass,
// because only the app owner (superadmin) can legitimately skip verification.
router.post('/verify/add-owned', requireSuperAdmin, WebsiteScanController.addOwnedDomain);
router.post('/verify/self',      requireSuperAdmin, WebsiteScanController.verifySelf);

// ─── Scan routes (requires verified domain) ──────────────────────────────────
// Scan a website
router.post('/scan', WebsiteScanController.scanWebsite);

// Penetration testing (requires verified domain) - ACTIVE ATTACK MODE
router.post('/pentest', WebsiteScanController.penetrationTest);

// Load testing (requires verified domain) - STRESS TESTING
router.post('/loadtest', WebsiteScanController.loadTest);

// Resilience test (requires verified domain)
router.post('/test-resilience', WebsiteScanController.testResilience);

// API Health Monitoring
router.get('/api-health', WebsiteScanController.getApiHealth);
router.post('/api-reset', WebsiteScanController.resetApiKeys);

// Scan history
router.get('/history', WebsiteScanController.getScanHistory);

// CWE-434: Restrict scanId to MongoDB ObjectId hex format
router.get('/:scanId', WebsiteScanController.getScanById);
router.delete('/:scanId', WebsiteScanController.deleteScan);

export default router;
