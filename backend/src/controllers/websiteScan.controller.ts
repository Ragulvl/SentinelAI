import { Request, Response } from 'express';
import { WebsiteScannerService } from '../services/websiteScanner.service.js';
import { PenetrationTestingService } from '../services/penetrationTesting.service.js';
import type { PentestProgressEvent } from '../services/penetrationTesting.service.js';
import { WebsiteScan } from '../db/models/WebsiteScan.model.js';
import { DomainVerificationService } from '../services/domainVerification.service.js';
import '../types/auth.js';
import jwt from 'jsonwebtoken';

export class WebsiteScanController {
  static async scanWebsite(req: Request, res: Response) {
    try {
      const { url, credentials } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      // Check if domain is verified
      const isVerified = await DomainVerificationService.isDomainVerified(userId, url);
      
      if (!isVerified) {
        const domain = DomainVerificationService.extractDomain(url);
        return res.status(403).json({ 
          error: 'Domain not verified',
          message: `You must verify ownership of ${domain} before scanning. Please verify your domain first.`,
          domain,
          requiresVerification: true
        });
      }

      console.log(`Starting website scan for: ${url}`);

      // Perform the scan
      const scanResult = await WebsiteScannerService.scanWebsite(url);

      // Save scan result to database
      const savedScan = await WebsiteScan.create({
        userId,
        url: scanResult.url,
        scanDate: scanResult.scanDate,
        vulnerabilities: scanResult.vulnerabilities,
        securityScore: scanResult.securityScore,
        headers: scanResult.headers,
        technologies: scanResult.technologies,
        ssl: scanResult.ssl,
      });

      console.log(`Website scan completed. Score: ${scanResult.securityScore}`);

      res.json(savedScan);
    } catch (error: any) {
      console.error('Error scanning website:', error);
      res.status(500).json({ error: error.message || 'Failed to scan website' });
    }
  }

  static async penetrationTest(req: Request, res: Response) {
    try {
      const { url, credentials } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      // Check if domain is verified - REQUIRED for penetration testing
      const isVerified = await DomainVerificationService.isDomainVerified(userId, url);
      
      if (!isVerified) {
        const domain = DomainVerificationService.extractDomain(url);
        return res.status(403).json({ 
          error: 'Domain not verified',
          message: `You must verify ownership of ${domain} before performing penetration testing. This is required for legal and ethical reasons.`,
          domain,
          requiresVerification: true
        });
      }

      console.log(`Starting penetration test for: ${url}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`User ID: ${userId}`);

      // Perform penetration testing with timeout protection
      // credentials = { username, password, loginUrl? } â€” optional, for authenticated scans
      const testPromise = PenetrationTestingService.performPenetrationTest(url, credentials);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Penetration test timeout - operation took too long')), 120000) // 2 minute timeout
      );

      const testResult = await Promise.race([testPromise, timeoutPromise]) as any;

      console.log(`Penetration test completed. Vulnerabilities found: ${testResult.vulnerabilitiesFound}`);

      // Save to database
      const { PenetrationTest } = await import('../db/models/PenetrationTest.model.js');
      
      const savedTest = await PenetrationTest.create({
        userId,
        url: testResult.url,
        testDate: testResult.testDate,
        results: testResult.results.map((r: any) => ({
          testName: r.testName,
          category: r.category,
          passed: !r.vulnerable,
          severity: r.severity,
          description: r.description,
          evidence: r.evidence,
          payload: r.payload,
          recommendation: r.recommendation,
        })),
        summary: {
          totalTests: testResult.testsPerformed,
          passed: testResult.testsPerformed - testResult.vulnerabilitiesFound,
          failed: testResult.vulnerabilitiesFound,
          critical: testResult.results.filter((r: any) => r.vulnerable && r.severity === 'critical').length,
          high: testResult.results.filter((r: any) => r.vulnerable && r.severity === 'high').length,
          medium: testResult.results.filter((r: any) => r.vulnerable && r.severity === 'medium').length,
          low: testResult.results.filter((r: any) => r.vulnerable && r.severity === 'low').length,
        },
      });

      res.json({ ...testResult, _id: savedTest._id });
    } catch (error: any) {
      console.error('Error performing penetration test:', error);
      console.error('Error stack:', error.stack);
      res.status(500).json({ 
        error: error.message || 'Failed to perform penetration test',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  // SSE streaming pentest — sends events as each test completes
  static async penetrationTestStream(req: Request, res: Response) {
    // Auth: httpOnly cookie preferred (browser sends it with withCredentials:true),
    // fall back to ?token= query param for cross-origin EventSource clients.
    const tokenParam = (req.cookies?.token as string | undefined) || (req.query.token as string | undefined);
    if (!tokenParam) return res.status(401).end();

    let userId: string;
    try {
      const secret = process.env.JWT_SECRET || '';
      const payload = jwt.verify(tokenParam, secret) as any;
      userId = payload.userId as string;
    } catch {
      return res.status(401).end();
    }

    const url = req.query.url as string | undefined;
    const credentialsRaw = req.query.credentials as string | undefined;
    if (!url) return res.status(400).json({ error: 'URL required' });

    // Domain verification
    const isVerified = await DomainVerificationService.isDomainVerified(userId as any, url);
    if (!isVerified) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'Domain not verified' })}\n\n`);
      return res.end();
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    const send = (event: string, data: any) => {
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        if ((res as any).flush) (res as any).flush(); // express-compression compat
      } catch { /* client disconnected */ }
    };

    // SSE heartbeat — send a comment-line every 15 s to prevent Vercel/proxy timeout
    // during long-running phases (Phase 7 AI loop can take 60-120 s).
    // SSE comment lines (': ping') are ignored by EventSource but keep the TCP connection alive.
    const heartbeat = setInterval(() => {
      try { res.write(': ping\n\n'); if ((res as any).flush) (res as any).flush(); } catch { /* ignore */ }
    }, 15_000);

    send('connected', { message: 'Stream connected' });

    let credentials: any;
    try { credentials = credentialsRaw ? JSON.parse(decodeURIComponent(credentialsRaw)) : undefined; } catch { /* ignore */ }

    const onProgress = (event: PentestProgressEvent) => {
      if (event.type === 'phase') send('phase', event);
      else if (event.type === 'test_start') send('test_start', event);
      else if (event.type === 'test_result') send('test_result', event);
      else if (event.type === 'ai_finding') send('ai_finding', event);
      // Note: orchestrator never emits type:'done' to onProgress —
      // the 'done' event is sent once below after performPenetrationTest resolves.
    };

    try {
      const testResult = await PenetrationTestingService.performPenetrationTest(url, credentials, onProgress);
      clearInterval(heartbeat);
      send('done', { report: testResult });

      // Save to DB
      try {
        const { PenetrationTest } = await import('../db/models/PenetrationTest.model.js');
        const savedTest = await (PenetrationTest as any).create({
          userId, url: testResult.url, testDate: testResult.testDate,
          results: testResult.results.map((r: any) => ({
            testName: r.testName, category: r.category, passed: !r.vulnerable,
            severity: r.severity, description: r.description,
            evidence: r.evidence, payload: r.payload, recommendation: r.recommendation,
          })),
          summary: {
            totalTests: testResult.testsPerformed,
            passed: testResult.testsPerformed - testResult.vulnerabilitiesFound,
            failed: testResult.vulnerabilitiesFound,
            critical: testResult.results.filter((r: any) => r.vulnerable && r.severity === 'critical').length,
            high: testResult.results.filter((r: any) => r.vulnerable && r.severity === 'high').length,
            medium: testResult.results.filter((r: any) => r.vulnerable && r.severity === 'medium').length,
            low: testResult.results.filter((r: any) => r.vulnerable && r.severity === 'low').length,
          },
        });
        send('saved', { id: (savedTest as any)._id.toString() });
      } catch (dbErr: any) {
        console.warn('SSE pentest DB save failed:', dbErr.message);
      }
    } catch (err: any) {
      clearInterval(heartbeat);
      send('error', { message: err.message || 'Penetration test failed' });
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  }

  static async loadTest(req: Request, res: Response) {
    try {
      const { url, duration = 30, concurrentUsers = 10, requestsPerSecond = 10, method = 'GET', payload } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      // Check if domain is verified - REQUIRED for load testing
      const isVerified = await DomainVerificationService.isDomainVerified(userId, url);
      
      if (!isVerified) {
        const domain = DomainVerificationService.extractDomain(url);
        return res.status(403).json({ 
          error: 'Domain not verified',
          message: `You must verify ownership of ${domain} before performing load testing.`,
          domain,
          requiresVerification: true
        });
      }

      console.log(`Starting load test for: ${url}`);

      const { LoadTestingService } = await import('../services/loadTesting.service.js');

      // Perform load testing
      const testResult = await LoadTestingService.performLoadTest({
        url,
        duration,
        concurrentUsers,
        requestsPerSecond,
        method,
        payload,
      });

      console.log(`Load test completed. Total requests: ${testResult.totalRequests}`);

      // Save to database
      const { LoadTest } = await import('../db/models/LoadTest.model.js');
      
      const savedTest = await LoadTest.create({
        userId,
        url: testResult.url,
        testDate: testResult.testDate,
        config: {
          duration,
          concurrentUsers,
          requestsPerSecond,
        },
        results: {
          totalRequests: testResult.totalRequests,
          successfulRequests: testResult.successfulRequests,
          failedRequests: testResult.failedRequests,
          averageResponseTime: testResult.averageResponseTime,
          minResponseTime: testResult.minResponseTime,
          maxResponseTime: testResult.maxResponseTime,
          requestsPerSecond: testResult.requestsPerSecond,
          errors: testResult.errors,
        },
      });

      res.json({ ...testResult, _id: savedTest._id });
    } catch (error: any) {
      console.error('Error performing load test:', error);
      res.status(500).json({ error: error.message || 'Failed to perform load test' });
    }
  }

  // SSE streaming load test — same auth pattern as penetrationTestStream
  static async loadTestStream(req: Request, res: Response) {
    const tokenParam = (req.cookies?.token as string | undefined) || (req.query.token as string | undefined);
    if (!tokenParam) return res.status(401).end();

    let userId: string;
    try {
      const secret = process.env.JWT_SECRET || '';
      const payload = jwt.verify(tokenParam, secret) as any;
      userId = payload.userId as string;
    } catch {
      return res.status(401).end();
    }

    const { url, duration, concurrentUsers, requestsPerSecond } = req.query;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const isVerified = await DomainVerificationService.isDomainVerified(userId as any, url as string);
    if (!isVerified) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'Domain not verified' })}\n\n`);
      return res.end();
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: string, data: any) => {
      try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* client disconnected */ }
    };

    const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* ignore */ } }, 15_000);

    send('connected', { message: 'Load test stream connected' });

    try {
      const { LoadTestingService } = await import('../services/loadTesting.service.js');
      const testResult = await LoadTestingService.performLoadTestStreaming(
        {
          url: url as string,
          duration: Math.min(Number(duration) || 30, 55),
          concurrentUsers: Math.min(Number(concurrentUsers) || 10, 50),
          requestsPerSecond: Math.min(Number(requestsPerSecond) || 10, 50),
          method: 'GET',
        },
        (progress) => send('progress', progress)
      );

      clearInterval(heartbeat);
      send('done', testResult);

      // Save to DB
      try {
        const { LoadTest } = await import('../db/models/LoadTest.model.js');
        const saved = await (LoadTest as any).create({
          userId, url: testResult.url, testDate: testResult.testDate,
          config: { duration: testResult.duration, concurrentUsers: Number(concurrentUsers) || 10, requestsPerSecond: Number(requestsPerSecond) || 10 },
          results: {
            totalRequests: testResult.totalRequests, successfulRequests: testResult.successfulRequests,
            failedRequests: testResult.failedRequests, averageResponseTime: testResult.averageResponseTime,
            minResponseTime: testResult.minResponseTime, maxResponseTime: testResult.maxResponseTime,
            requestsPerSecond: testResult.requestsPerSecond, errors: testResult.errors,
          },
        });
        send('saved', { id: saved._id.toString() });
      } catch (dbErr: any) { console.warn('LoadTest DB save failed:', dbErr.message); }
    } catch (err: any) {
      clearInterval(heartbeat);
      send('error', { message: err.message || 'Load test failed' });
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  }

  static async testResilience(req: Request, res: Response) {
    try {
      const { url, credentials } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      // Check if domain is verified
      const isVerified = await DomainVerificationService.isDomainVerified(userId, url);
      
      if (!isVerified) {
        const domain = DomainVerificationService.extractDomain(url);
        return res.status(403).json({ 
          error: 'Domain not verified',
          message: `You must verify ownership of ${domain} before testing resilience.`,
          domain,
          requiresVerification: true
        });
      }

      console.log(`Testing resilience for: ${url}`);

      const { LoadTestingService } = await import('../services/loadTesting.service.js');

      const testResult = await LoadTestingService.testResilience(url);

      res.json(testResult);
    } catch (error: any) {
      console.error('Error testing resilience:', error);
      res.status(500).json({ error: error.message || 'Failed to test resilience' });
    }
  }

  static async getScanHistory(req: Request, res: Response) {
    try {
      const { url } = req.query;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const query: any = { userId };
      if (url) {
        query.url = url;
      }

      const scans = await WebsiteScan.find(query)
        .sort({ scanDate: -1 })
        .limit(50);

      res.json(scans);
    } catch (error: any) {
      console.error('Error fetching scan history:', error);
      res.status(500).json({ error: 'Failed to fetch scan history' });
    }
  }

  static async getScanById(req: Request, res: Response) {
    try {
      const { scanId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const scan = await WebsiteScan.findOne({ _id: scanId, userId });

      if (!scan) {
        return res.status(404).json({ error: 'Scan not found' });
      }

      res.json(scan);
    } catch (error: any) {
      console.error('Error fetching scan:', error);
      res.status(500).json({ error: 'Failed to fetch scan' });
    }
  }

  static async deleteScan(req: Request, res: Response) {
    try {
      const { scanId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const result = await WebsiteScan.deleteOne({ _id: scanId, userId });

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Scan not found' });
      }

      res.json({ message: 'Scan deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting scan:', error);
      res.status(500).json({ error: 'Failed to delete scan' });
    }
  }

  // Domain Verification Endpoints

  static async initiateVerification(req: Request, res: Response) {
    try {
      const { domain, method } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!domain || !method) {
        return res.status(400).json({ error: 'Domain and verification method are required' });
      }

      if (!['file', 'dns', 'meta'].includes(method)) {
        return res.status(400).json({ error: 'Invalid verification method. Use: file, dns, or meta' });
      }

      const normalizedDomain = DomainVerificationService.extractDomain(domain);
      const result = await DomainVerificationService.initiateVerification(
        userId,
        normalizedDomain,
        method as 'file' | 'dns' | 'meta'
      );

      res.json({
        domain: normalizedDomain,
        token: result.token,
        method,
        instructions: result.instructions,
      });
    } catch (error: any) {
      console.error('Error initiating verification:', error);
      res.status(500).json({ error: error.message || 'Failed to initiate verification' });
    }
  }

  static async verifyDomain(req: Request, res: Response) {
    try {
      const { domain } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!domain) {
        return res.status(400).json({ error: 'Domain is required' });
      }

      const normalizedDomain = DomainVerificationService.extractDomain(domain);
      const result = await DomainVerificationService.verifyDomain(userId, normalizedDomain);

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          domain: normalizedDomain,
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message,
          domain: normalizedDomain,
        });
      }
    } catch (error: any) {
      console.error('Error verifying domain:', error);
      res.status(500).json({ error: error.message || 'Failed to verify domain' });
    }
  }

  static async getVerifiedDomains(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const domains = await DomainVerificationService.getAllDomains(userId);

      res.json(domains);
    } catch (error: any) {
      console.error('Error fetching verified domains:', error);
      res.status(500).json({ error: 'Failed to fetch verified domains' });
    }
  }

  static async deleteDomain(req: Request, res: Response) {
    try {
      const { domain } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Route param is already a bare hostname (e.g. "example.com") â€” normalize directly
      const normalizedDomain = domain.replace(/^www\./, '').toLowerCase();
      const deleted = await DomainVerificationService.deleteDomain(userId, normalizedDomain);

      if (deleted) {
        res.json({ message: 'Domain verification deleted successfully' });
      } else {
        res.status(404).json({ error: 'Domain not found' });
      }
    } catch (error: any) {
      console.error('Error deleting domain:', error);
      res.status(500).json({ error: 'Failed to delete domain' });
    }
  }

  static async checkDomainVerification(req: Request, res: Response) {
    try {
      const { url } = req.query;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL is required' });
      }

      const domain = DomainVerificationService.extractDomain(url);
      const isVerified = await DomainVerificationService.isDomainVerified(userId, url);

      res.json({
        domain,
        verified: isVerified,
      });
    } catch (error: any) {
      console.error('Error checking domain verification:', error);
      res.status(500).json({ error: 'Failed to check domain verification' });
    }
  }

  static async addOwnedDomain(req: Request, res: Response) {
    try {
      const { domain } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!domain) {
        return res.status(400).json({ error: 'Domain is required' });
      }

      const normalizedDomain = DomainVerificationService.extractDomain(domain);
      const result = await DomainVerificationService.addOwnedDomain(userId, normalizedDomain);

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          domain: result.domain,
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message,
          domain: result.domain,
        });
      }
    } catch (error: any) {
      console.error('Error adding owned domain:', error);
      res.status(500).json({ error: error.message || 'Failed to add owned domain' });
    }
  }

  /**
   * POST /verify/self
   * Auto-verifies a domain that matches this app's own FRONTEND_URL or BACKEND_URL.
   * No DNS/file/meta challenge needed — the user is the owner of this deployment.
   */
  static async verifySelf(req: Request, res: Response) {
    try {
      const { domain } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!domain) {
        return res.status(400).json({ error: 'Domain is required' });
      }

      const normalizedDomain = DomainVerificationService.extractDomain(domain);
      const result = await DomainVerificationService.verifySelf(userId, normalizedDomain);

      res.status(result.success ? 200 : 400).json(result);
    } catch (error: any) {
      console.error('Error in self-verification:', error);
      res.status(500).json({ error: error.message || 'Self-verification failed' });
    }
  }

  static async getApiHealth(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { AIService } = await import('../services/ai.service.js');
      const stats = AIService.getRotationStats();

      res.json({
        timestamp: new Date(),
        providers: stats,
        status: (stats.groq.healthyKeys > 0 || stats.gemini.healthyKeys > 0) ? 'healthy' : 'degraded',
      });
    } catch (error: any) {
      console.error('Error fetching API health:', error);
      res.status(500).json({ error: 'Failed to fetch API health' });
    }
  }

  static async resetApiKeys(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { AIService } = await import('../services/ai.service.js');
      AIService.resetFailureCounts();

      res.json({
        success: true,
        message: 'API key failure counts have been reset',
      });
    } catch (error: any) {
      console.error('Error resetting API keys:', error);
      res.status(500).json({ error: 'Failed to reset API keys' });
    }
  }
}
