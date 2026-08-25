import { Router, Request, Response, NextFunction } from 'express';
import { WebsiteScanController } from '../controllers/websiteScan.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// CWE-20: Domain presence validation middleware
const requireDomain = (req: Request, res: Response, next: NextFunction) => {
  if (!req.body?.domain) {
    return res.status(400).json({ error: 'Missing required field: domain' });
  }
  next();
};

// Domain Verification Routes
router.post('/verify/initiate', requireDomain, WebsiteScanController.initiateVerification);
router.post('/verify/check', WebsiteScanController.verifyDomain);
router.get('/verify/domains', WebsiteScanController.getVerifiedDomains);
router.get('/verify/status', WebsiteScanController.checkDomainVerification);
// CWE-639: Restrict domain param to hostname-safe characters
router.delete('/verify/domains/:domain([a-zA-Z0-9._-]+)', WebsiteScanController.deleteDomain);

// Add domain as owned (bypass verification)
router.post('/verify/add-owned', WebsiteScanController.addOwnedDomain);

// Scan a website (requires verified domain)
router.post('/scan', WebsiteScanController.scanWebsite);

// Penetration testing (requires verified domain) - ACTIVE ATTACK MODE
router.post('/pentest', WebsiteScanController.penetrationTest);

// SSE streaming pentest — real-time results as each test completes
router.get('/pentest/stream', WebsiteScanController.penetrationTestStream);

// Load testing (requires verified domain) - STRESS TESTING
router.post('/loadtest', WebsiteScanController.loadTest);

// Resilience test (requires verified domain)
router.post('/test-resilience', WebsiteScanController.testResilience);

// API Health Monitoring
router.get('/api-health', WebsiteScanController.getApiHealth);
router.post('/api-reset', WebsiteScanController.resetApiKeys);

// Get scan history
router.get('/history', WebsiteScanController.getScanHistory);

// CWE-434: Restrict scanId to MongoDB ObjectId hex format
router.get('/:scanId([a-f0-9]{24})', WebsiteScanController.getScanById);
router.delete('/:scanId([a-f0-9]{24})', WebsiteScanController.deleteScan);

export default router;
