import axios from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';

export interface WebsiteVulnerability {
  type: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  title: string;
  description: string;
  recommendation: string;
  evidence?: string;
}

export interface WebsiteScanResult {
  url: string;
  scanDate: Date;
  vulnerabilities: WebsiteVulnerability[];
  securityScore: number;
  headers: Record<string, string>;
  technologies: string[];
  ssl: {
    valid: boolean;
    issuer?: string;
    validFrom?: Date;
    validTo?: Date;
    protocol?: string;
  };
}

export class WebsiteScannerService {
  private static readonly TIMEOUT = 8000;

  static async scanWebsite(url: string): Promise<WebsiteScanResult> {
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;

    try {
      // Fetch website HTML, SSL check, and sensitive files in parallel — biggest latency win
      const [response, sslInfo, sensitiveFilesVulns] = await Promise.all([
        axios.get(normalizedUrl, {
          timeout: this.TIMEOUT,
          maxRedirects: 5,
          validateStatus: () => true,
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        }),
        this.checkSSL(normalizedUrl),
        this.checkSensitiveFiles(normalizedUrl),
      ]);

      const headers = response.headers;
      const html = response.data;

      // All analysis is CPU-bound (no I/O), run together synchronously — no await needed
      const vulnerabilities: WebsiteVulnerability[] = [
        ...this.checkSecurityHeaders(headers),
        ...this.checkSSLVulnerabilities(sslInfo),
        ...this.analyzeHTML(html, normalizedUrl),
        ...this.checkCommonVulnerabilities(html, headers),
        ...sensitiveFilesVulns,
      ];

      const technologies = this.detectTechnologies(html, headers);
      const securityScore = this.calculateSecurityScore(vulnerabilities);

      return {
        url: normalizedUrl,
        scanDate: new Date(),
        vulnerabilities,
        securityScore,
        headers: headers as Record<string, string>,
        technologies,
        ssl: sslInfo,
      };
    } catch (error: any) {
      throw new Error(`Failed to scan website: ${error.message}`);
    }
  }

  private static checkSecurityHeaders(headers: any): WebsiteVulnerability[] {
    const vulnerabilities: WebsiteVulnerability[] = [];

    // Check for missing security headers
    const securityHeaders = {
      'strict-transport-security': {
        title: 'Missing Strict-Transport-Security Header',
        description: 'The HTTP Strict-Transport-Security (HSTS) header is not set.',
        recommendation: 'Add "Strict-Transport-Security: max-age=31536000; includeSubDomains" header.',
        type: 'high' as const,
      },
      'x-frame-options': {
        title: 'Missing X-Frame-Options Header',
        description: 'The X-Frame-Options header is not set, making the site vulnerable to clickjacking.',
        recommendation: 'Add "X-Frame-Options: DENY" or "X-Frame-Options: SAMEORIGIN" header.',
        type: 'medium' as const,
      },
      'x-content-type-options': {
        title: 'Missing X-Content-Type-Options Header',
        description: 'The X-Content-Type-Options header is not set.',
        recommendation: 'Add "X-Content-Type-Options: nosniff" header.',
        type: 'low' as const,
      },
      'content-security-policy': {
        title: 'Missing Content-Security-Policy Header',
        description: 'No Content Security Policy is defined.',
        recommendation: 'Implement a Content-Security-Policy header to prevent XSS attacks.',
        type: 'high' as const,
      },
      'x-xss-protection': {
        title: 'Missing X-XSS-Protection Header',
        description: 'The X-XSS-Protection header is not set.',
        recommendation: 'Add "X-XSS-Protection: 1; mode=block" header.',
        type: 'low' as const,
      },
      'referrer-policy': {
        title: 'Missing Referrer-Policy Header',
        description: 'The Referrer-Policy header is not set.',
        recommendation: 'Add "Referrer-Policy: strict-origin-when-cross-origin" header.',
        type: 'low' as const,
      },
    };

    for (const [header, info] of Object.entries(securityHeaders)) {
      if (!headers[header] && !headers[header.toLowerCase()]) {
        vulnerabilities.push({
          type: info.type,
          category: 'Security Headers',
          title: info.title,
          description: info.description,
          recommendation: info.recommendation,
        });
      }
    }

    // Check for insecure headers
    if (headers['server']) {
      vulnerabilities.push({
        type: 'info',
        category: 'Information Disclosure',
        title: 'Server Header Exposed',
        description: `Server header reveals: ${headers['server']}`,
        recommendation: 'Remove or obfuscate the Server header to prevent information disclosure.',
        evidence: headers['server'],
      });
    }

    if (headers['x-powered-by']) {
      vulnerabilities.push({
        type: 'info',
        category: 'Information Disclosure',
        title: 'X-Powered-By Header Exposed',
        description: `X-Powered-By header reveals: ${headers['x-powered-by']}`,
        recommendation: 'Remove the X-Powered-By header to prevent technology stack disclosure.',
        evidence: headers['x-powered-by'],
      });
    }

    return vulnerabilities;
  }

  private static async checkSSL(url: string): Promise<any> {
    if (!url.startsWith('https://')) return { valid: false };

    const urlObj = new URL(url);

    return new Promise((resolve) => {
      const req = https.request(
        { host: urlObj.hostname, port: 443, method: 'HEAD', rejectUnauthorized: false, timeout: 5000 },
        (res) => {
          const cert = (res.socket as any).getPeerCertificate(true);
          if (cert?.valid_to) {
            resolve({
              valid: new Date(cert.valid_to) > new Date(),
              issuer: cert.issuer?.O || 'Unknown',
              validFrom: new Date(cert.valid_from),
              validTo: new Date(cert.valid_to),
              protocol: (res.socket as any).getProtocol?.() || 'Unknown',
            });
          } else {
            resolve({ valid: false });
          }
        }
      );
      req.on('timeout', () => { req.destroy(); resolve({ valid: false }); });
      req.on('error', () => resolve({ valid: false }));
      req.end();
    });
  }

  private static checkSSLVulnerabilities(sslInfo: any): WebsiteVulnerability[] {
    const vulnerabilities: WebsiteVulnerability[] = [];

    if (!sslInfo.valid) {
      vulnerabilities.push({
        type: 'critical',
        category: 'SSL/TLS',
        title: 'Invalid or Missing SSL Certificate',
        description: 'The website does not have a valid SSL certificate.',
        recommendation: 'Install a valid SSL certificate from a trusted Certificate Authority.',
      });
    } else {
      // Check certificate expiry
      if (sslInfo.validTo) {
        const daysUntilExpiry = Math.floor(
          (new Date(sslInfo.validTo).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntilExpiry < 30) {
          vulnerabilities.push({
            type: 'high',
            category: 'SSL/TLS',
            title: 'SSL Certificate Expiring Soon',
            description: `SSL certificate expires in ${daysUntilExpiry} days.`,
            recommendation: 'Renew the SSL certificate before it expires.',
            evidence: `Expires: ${new Date(sslInfo.validTo).toLocaleDateString()}`,
          });
        }
      }

      // Check for weak protocols
      if (sslInfo.protocol && (sslInfo.protocol.includes('TLSv1.0') || sslInfo.protocol.includes('TLSv1.1'))) {
        vulnerabilities.push({
          type: 'high',
          category: 'SSL/TLS',
          title: 'Weak TLS Protocol',
          description: `Website supports weak TLS protocol: ${sslInfo.protocol}`,
          recommendation: 'Disable TLS 1.0 and 1.1. Use TLS 1.2 or higher.',
          evidence: sslInfo.protocol,
        });
      }
    }

    return vulnerabilities;
  }

  private static analyzeHTML(html: string, url: string): WebsiteVulnerability[] {
    const vulnerabilities: WebsiteVulnerability[] = [];
    const $ = cheerio.load(html);

    // Check for forms without CSRF protection
    $('form').each((_, form) => {
      const hasCSRFToken = $(form).find('input[name*="csrf"], input[name*="token"]').length > 0;
      if (!hasCSRFToken) {
        vulnerabilities.push({
          type: 'medium',
          category: 'CSRF',
          title: 'Form Without CSRF Protection',
          description: 'A form was found without apparent CSRF token protection.',
          recommendation: 'Implement CSRF tokens for all forms that perform state-changing operations.',
        });
      }
    });

    // Check for inline scripts (potential XSS)
    const inlineScripts = $('script:not([src])').length;
    if (inlineScripts > 0) {
      vulnerabilities.push({
        type: 'low',
        category: 'XSS Prevention',
        title: 'Inline Scripts Detected',
        description: `Found ${inlineScripts} inline script(s). Inline scripts can increase XSS risk.`,
        recommendation: 'Move inline scripts to external files and use CSP to restrict script execution.',
        evidence: `${inlineScripts} inline script(s)`,
      });
    }

    // Check for mixed content
    if (url.startsWith('https://')) {
      const httpResources = $('img[src^="http:"], script[src^="http:"], link[href^="http:"]').length;
      if (httpResources > 0) {
        vulnerabilities.push({
          type: 'medium',
          category: 'Mixed Content',
          title: 'Mixed Content Detected',
          description: `Found ${httpResources} HTTP resource(s) loaded on HTTPS page.`,
          recommendation: 'Load all resources over HTTPS to prevent mixed content warnings.',
          evidence: `${httpResources} HTTP resource(s)`,
        });
      }
    }

    // Check for password fields without autocomplete=off
    $('input[type="password"]').each((_, input) => {
      const autocomplete = $(input).attr('autocomplete');
      if (autocomplete === 'on' || !autocomplete) {
        vulnerabilities.push({
          type: 'low',
          category: 'Password Security',
          title: 'Password Field Allows Autocomplete',
          description: 'Password field does not disable autocomplete.',
          recommendation: 'Add autocomplete="new-password" or autocomplete="current-password" to password fields.',
        });
      }
    });

    return vulnerabilities;
  }

  private static async checkSensitiveFiles(baseUrl: string): Promise<WebsiteVulnerability[]> {
    const vulnerabilities: WebsiteVulnerability[] = [];
    
    // List of sensitive files to check
    const sensitiveFiles = [
      { path: '/.env', name: '.env file', type: 'critical' as const },
      { path: '/.env.local', name: '.env.local file', type: 'critical' as const },
      { path: '/.env.production', name: '.env.production file', type: 'critical' as const },
      { path: '/.git/config', name: 'Git config', type: 'critical' as const },
      { path: '/.git/HEAD', name: 'Git HEAD', type: 'high' as const },
      { path: '/config.php', name: 'config.php', type: 'high' as const },
      { path: '/wp-config.php', name: 'WordPress config', type: 'critical' as const },
      { path: '/config.json', name: 'config.json', type: 'high' as const },
      { path: '/package.json', name: 'package.json', type: 'medium' as const },
      { path: '/.htaccess', name: '.htaccess', type: 'medium' as const },
      { path: '/composer.json', name: 'composer.json', type: 'medium' as const },
      { path: '/phpinfo.php', name: 'phpinfo.php', type: 'high' as const },
      { path: '/info.php', name: 'info.php', type: 'high' as const },
      { path: '/web.config', name: 'web.config', type: 'high' as const },
      { path: '/backup.sql', name: 'backup.sql', type: 'critical' as const },
      { path: '/database.sql', name: 'database.sql', type: 'critical' as const },
      { path: '/.DS_Store', name: '.DS_Store', type: 'low' as const },
      { path: '/robots.txt', name: 'robots.txt', type: 'info' as const },
    ];

    // Check each file in parallel
    const checks = sensitiveFiles.map(async (file): Promise<WebsiteVulnerability | null> => {
      try {
        const fileUrl = `${baseUrl}${file.path}`;
        const response = await axios.get(fileUrl, {
          timeout: 3000,
          maxRedirects: 0,
          validateStatus: (status) => status === 200,
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        });

        // File is accessible
        if (response.status === 200 && response.data) {
          let evidence = `File found at: ${fileUrl}`;
          let fileContent = '';

          // Get file content (limit to first 2000 characters for display)
          if (typeof response.data === 'string') {
            fileContent = response.data.substring(0, 2000);
            if (response.data.length > 2000) {
              fileContent += '\n\n... (truncated)';
            }
          }

          // Add content preview to evidence
          if (fileContent) {
            evidence += `\n\n📄 File Content Preview:\n${'─'.repeat(50)}\n${fileContent}\n${'─'.repeat(50)}`;
          }

          return {
            type: file.type,
            category: 'Sensitive File Exposure',
            title: `Sensitive file accessible: ${file.path}`,
            description: `The ${file.name} is publicly accessible and may contain sensitive information.`,
            recommendation: 'Remove or restrict access to sensitive files and directories.',
            evidence,
          };
        }
      } catch (error) {
        // File not accessible (this is good)
        return null;
      }
      return null;
    });

    const results = await Promise.all(checks);
    
    // Filter out null results (files that weren't found)
    return results.filter((vuln): vuln is WebsiteVulnerability => vuln !== null);
  }

  private static checkCommonVulnerabilities(html: string, headers: any): WebsiteVulnerability[] {
    const vulnerabilities: WebsiteVulnerability[] = [];

    // Check for common vulnerable patterns
    const patterns = [
      { pattern: /eval\s*\(/gi, title: 'Potential eval() Usage', type: 'medium' as const },
      { pattern: /document\.write\s*\(/gi, title: 'document.write() Usage', type: 'low' as const },
      { pattern: /innerHTML\s*=/gi, title: 'innerHTML Assignment', type: 'low' as const },
    ];

    for (const { pattern, title, type } of patterns) {
      if (pattern.test(html)) {
        vulnerabilities.push({
          type,
          category: 'Code Quality',
          title,
          description: `Potentially unsafe JavaScript pattern detected: ${title}`,
          recommendation: 'Review and replace with safer alternatives.',
        });
      }
    }

    // Check for directory listing
    if (html.includes('Index of /') || html.includes('Directory listing')) {
      vulnerabilities.push({
        type: 'high',
        category: 'Information Disclosure',
        title: 'Directory Listing Enabled',
        description: 'Directory listing appears to be enabled.',
        recommendation: 'Disable directory listing on the web server.',
      });
    }

    return vulnerabilities;
  }

  private static detectTechnologies(html: string, headers: any): string[] {
    const technologies: Set<string> = new Set();

    // Detect from headers
    if (headers['server']) {
      const server = headers['server'].toLowerCase();
      if (server.includes('nginx')) technologies.add('Nginx');
      if (server.includes('apache')) technologies.add('Apache');
      if (server.includes('iis')) technologies.add('IIS');
    }

    if (headers['x-powered-by']) {
      const powered = headers['x-powered-by'];
      if (powered.includes('PHP')) technologies.add('PHP');
      if (powered.includes('ASP.NET')) technologies.add('ASP.NET');
      if (powered.includes('Express')) technologies.add('Express.js');
    }

    // Detect from HTML
    const $ = cheerio.load(html);

    // JavaScript frameworks
    if (html.includes('react') || html.includes('_react')) technologies.add('React');
    if (html.includes('vue') || html.includes('Vue')) technologies.add('Vue.js');
    if (html.includes('angular') || html.includes('ng-')) technologies.add('Angular');
    if (html.includes('jquery') || html.includes('jQuery')) technologies.add('jQuery');

    // CMS
    if (html.includes('wp-content') || html.includes('wordpress')) technologies.add('WordPress');
    if (html.includes('drupal')) technologies.add('Drupal');
    if (html.includes('joomla')) technologies.add('Joomla');

    // Meta tags
    $('meta[name="generator"]').each((_, el) => {
      const content = $(el).attr('content');
      if (content) technologies.add(content);
    });

    return Array.from(technologies);
  }

  private static calculateSecurityScore(vulnerabilities: WebsiteVulnerability[]): number {
    let score = 100;

    const penalties = {
      critical: 20,
      high: 10,
      medium: 5,
      low: 2,
      info: 0,
    };

    for (const vuln of vulnerabilities) {
      score -= penalties[vuln.type];
    }

    return Math.max(0, Math.min(100, score));
  }
}
