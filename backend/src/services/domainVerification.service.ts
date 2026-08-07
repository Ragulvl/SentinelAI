import axios from 'axios';
import * as cheerio from 'cheerio';
import * as dns from 'dns';
import { promisify } from 'util';
import crypto from 'crypto';
import { VerifiedDomain } from '../db/models/WebsiteScan.model.js';

// Use explicit public DNS resolvers — the OS system resolver on Windows
// caches NXDOMAIN and fails to resolve freshly-added records.
const PUBLIC_DNS_SERVERS = [
  ['1.1.1.1', '1.0.0.1'],   // Cloudflare
  ['8.8.8.8', '8.8.4.4'],   // Google
  ['9.9.9.9', '149.112.112.112'], // Quad9
];

async function resolveTxtWithPublicDNS(hostname: string): Promise<string[][]> {
  // Try each resolver in parallel — return the first one that resolves
  const attempts = PUBLIC_DNS_SERVERS.map(async (servers) => {
    const resolver = new dns.Resolver();
    resolver.setServers(servers);
    const resolveTxtFn = promisify(resolver.resolveTxt.bind(resolver));
    return resolveTxtFn(hostname);
  });

  // Also try the system resolver as a fallback
  const systemAttempt = promisify(dns.resolveTxt)(hostname);

  const results = await Promise.allSettled([...attempts, systemAttempt]);
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      return result.value;
    }
  }
  throw new Error(`No TXT records found for ${hostname} via any resolver`);
}

export interface VerificationRequest {
  domain: string;
  method: 'file' | 'dns' | 'meta';
}

export interface VerificationResult {
  success: boolean;
  message: string;
  token?: string;
}

export class DomainVerificationService {
  private static readonly TIMEOUT = 10000;

  /**
   * Generate a stable verification token for a domain.
   * Uses a fixed salt so the token is reproducible for the same userId+domain pair.
   * We do NOT include timestamp so the same token is always returned for re-displays.
   */
  static generateVerificationToken(userId: number, domain: string): string {
    // Fixed salt — token is stable per userId+domain (no timestamp).
    const data = `sentinel-verify-${userId}-${domain}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
  }

  /**
   * Extract domain from URL
   */
  static extractDomain(url: string): string {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return urlObj.hostname.replace(/^www\./, '');
    } catch (error) {
      throw new Error('Invalid URL format');
    }
  }

  /**
   * Initiate domain verification.
   * If the domain already has a pending record with the SAME method,
   * we return the existing token (stable) so the user can upload/configure
   * it once and keep clicking Verify without the token changing.
   */
  static async initiateVerification(
    userId: number,
    domain: string,
    method: 'file' | 'dns' | 'meta'
  ): Promise<{ token: string; instructions: string }> {
    const normalizedDomain = domain.replace(/^www\./, '').toLowerCase();

    // Check if domain already exists
    let verifiedDomain = await VerifiedDomain.findOne({ userId, domain: normalizedDomain });

    let token: string;

    if (verifiedDomain && !verifiedDomain.verified && verifiedDomain.verificationMethod === method) {
      // ✅ Same method, still pending: reuse the existing stable token.
      // This preserves whatever the user already uploaded/configured.
      token = verifiedDomain.verificationToken;
    } else {
      // New domain, different method, or already verified: generate a fresh token.
      token = this.generateVerificationToken(userId, normalizedDomain);

      if (verifiedDomain) {
        verifiedDomain.verificationToken = token;
        verifiedDomain.verificationMethod = method;
        verifiedDomain.verified = false;
        verifiedDomain.verifiedAt = undefined;
        await verifiedDomain.save();
      } else {
        verifiedDomain = await VerifiedDomain.create({
          userId,
          domain: normalizedDomain,
          verificationToken: token,
          verificationMethod: method,
          verified: false,
        });
      }
    }

    const instructions = this.getVerificationInstructions(normalizedDomain, token, method);

    return { token, instructions };
  }

  /**
   * Get verification instructions based on method
   */
  private static getVerificationInstructions(
    domain: string,
    token: string,
    method: 'file' | 'dns' | 'meta'
  ): string {
    switch (method) {
      case 'file':
        // Domain is shown as plain text in a <pre> block (JSX auto-escaped) — no encoding needed
        return `Upload a file named 'sentinel-verify.txt' to the root of your website (https://${domain}/sentinel-verify.txt) with the following content:\n\n${token}\n\nOnce uploaded, click 'Verify Ownership' to complete verification.`;

      case 'dns':
        // DNS TXT record names must use raw domain — encoding would break DNS lookup
        return `Add a TXT record to your DNS configuration:\n\nName: _sentinel-verify.${domain}\nType: TXT\nValue: ${token}\n\nDNS changes may take up to 48 hours to propagate. Click 'Verify Ownership' once the record is added.`;

      case 'meta':
        // This is a raw HTML snippet shown in <pre>. JSX <pre> auto-escapes so no XSS risk.
        // The token is a 32-char hex string (sha256 substring) — safe to embed as-is.
        return `Add the following meta tag to the <head> section of your website's homepage (https://${domain}):\n\n<meta name="sentinel-verify" content="${token}">\n\nOnce added, click 'Verify Ownership' to complete verification.`;

      default:
        return 'Unknown verification method';
    }
  }

  /**
   * Verify domain ownership
   */
  static async verifyDomain(userId: number, domain: string): Promise<VerificationResult> {
    const normalizedDomain = domain.replace(/^www\./, '').toLowerCase();

    const verifiedDomain = await VerifiedDomain.findOne({ userId, domain: normalizedDomain });

    if (!verifiedDomain) {
      return {
        success: false,
        message: 'Domain verification not initiated. Please start the verification process first.',
      };
    }

    if (verifiedDomain.verified) {
      return {
        success: true,
        message: 'Domain is already verified.',
        token: verifiedDomain.verificationToken,
      };
    }

    const { verificationToken, verificationMethod } = verifiedDomain;

    let verified = false;
    let message = '';

    try {
      switch (verificationMethod) {
        case 'file':
          verified = await this.verifyFileMethod(normalizedDomain, verificationToken);
          message = verified
            ? 'Domain verified successfully via file upload!'
            : 'Verification file not found or content does not match. Please ensure the file is accessible at the root of your domain.';
          break;

        case 'dns':
          verified = await this.verifyDNSMethod(normalizedDomain, verificationToken);
          message = verified
            ? 'Domain verified successfully via DNS record!'
            : 'DNS TXT record not found or does not match. Please ensure the record is properly configured and has propagated.';
          break;

        case 'meta':
          verified = await this.verifyMetaMethod(normalizedDomain, verificationToken);
          message = verified
            ? 'Domain verified successfully via meta tag!'
            : 'Meta tag not found or content does not match. Please ensure the meta tag is in the <head> section of your homepage.';
          break;

        default:
          return {
            success: false,
            message: 'Invalid verification method.',
          };
      }

      if (verified) {
        verifiedDomain.verified = true;
        verifiedDomain.verifiedAt = new Date();
        await verifiedDomain.save();
      }

      return {
        success: verified,
        message,
        token: verificationToken,
      };
    } catch (error: any) {
      console.error('Verification error:', error);
      return {
        success: false,
        message: `Verification failed: ${error.message}`,
      };
    }
  }

  /**
   * Verify via file upload method
   */
  private static async verifyFileMethod(domain: string, expectedToken: string): Promise<boolean> {
    try {
      const url = `https://${domain}/sentinel-verify.txt`;
      const response = await axios.get(url, {
        timeout: this.TIMEOUT,
        validateStatus: (status) => status === 200,
      });

      const content = response.data.toString().trim();
      return content === expectedToken;
    } catch (error) {
      // Try HTTP if HTTPS fails
      try {
        const url = `http://${domain}/sentinel-verify.txt`;
        const response = await axios.get(url, {
          timeout: this.TIMEOUT,
          validateStatus: (status) => status === 200,
        });

        const content = response.data.toString().trim();
        return content === expectedToken;
      } catch (httpError) {
        return false;
      }
    }
  }

  /**
   * Verify via DNS TXT record method.
   * Uses multiple public resolvers (Cloudflare, Google, Quad9) in parallel
   * to avoid Windows system DNS caching issues with newly-added records.
   */
  private static async verifyDNSMethod(domain: string, expectedToken: string): Promise<boolean> {
    const hostname = `_sentinel-verify.${domain}`;
    console.log(`[DNS Verify] Checking TXT records for: ${hostname}`);
    console.log(`[DNS Verify] Expected token: ${expectedToken}`);
    try {
      const records = await resolveTxtWithPublicDNS(hostname);
      console.log(`[DNS Verify] Records found:`, JSON.stringify(records));

      for (const record of records) {
        // record is string[] (chunks of a single TXT record)
        const raw = Array.isArray(record) ? record.join('') : String(record);
        // Strip surrounding double-quotes that some DNS providers add
        const value = raw.trim().replace(/^"|"$/g, '');
        console.log(`[DNS Verify] Comparing: "${value}" === "${expectedToken}" → ${value === expectedToken}`);
        if (value === expectedToken) {
          return true;
        }
      }
      console.log(`[DNS Verify] No matching record found`);
      return false;
    } catch (error: any) {
      console.error(`[DNS Verify] Lookup failed for ${hostname}:`, error.message);
      return false;
    }
  }

  /**
   * Verify via meta tag method
   */
  private static async verifyMetaMethod(domain: string, expectedToken: string): Promise<boolean> {
    try {
      const url = `https://${domain}`;
      const response = await axios.get(url, {
        timeout: this.TIMEOUT,
        maxRedirects: 5,
      });

      const $ = cheerio.load(response.data);
      const metaTag = $('meta[name="sentinel-verify"]').attr('content');

      return metaTag?.trim() === expectedToken;
    } catch (error) {
      // Try HTTP if HTTPS fails
      try {
        const url = `http://${domain}`;
        const response = await axios.get(url, {
          timeout: this.TIMEOUT,
          maxRedirects: 5,
        });

        const $ = cheerio.load(response.data);
        const metaTag = $('meta[name="sentinel-verify"]').attr('content');

        return metaTag?.trim() === expectedToken;
      } catch (httpError) {
        return false;
      }
    }
  }

  /**
   * Check if domain is verified for user
   */
  static async isDomainVerified(userId: number, url: string): Promise<boolean> {
    try {
      const domain = this.extractDomain(url);
      const verifiedDomain = await VerifiedDomain.findOne({
        userId,
        domain,
        verified: true,
      });

      return !!verifiedDomain;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all verified domains for user
   */
  static async getVerifiedDomains(userId: number) {
    return await VerifiedDomain.find({ userId, verified: true }).sort({ verifiedAt: -1 });
  }

  /**
   * Get all domains (verified and pending) for user
   */
  static async getAllDomains(userId: number) {
    return await VerifiedDomain.find({ userId }).sort({ createdAt: -1 });
  }

  /**
   * Delete domain verification
   */
  static async deleteDomain(userId: number, domain: string): Promise<boolean> {
    const result = await VerifiedDomain.deleteOne({ userId, domain });
    return result.deletedCount > 0;
  }

  /**
   * Add domain as owned (bypass verification)
   * Use with caution - only for development or trusted scenarios
   */
  static async addOwnedDomain(userId: number, domain: string): Promise<{ success: boolean; message: string; domain: string }> {
    try {
      const normalizedDomain = domain.replace(/^www\./, '').toLowerCase();
      const token = this.generateVerificationToken(userId, normalizedDomain);

      // Check if domain already exists
      let verifiedDomain = await VerifiedDomain.findOne({ userId, domain: normalizedDomain });

      if (verifiedDomain) {
        if (verifiedDomain.verified) {
          return {
            success: true,
            message: 'Domain is already verified',
            domain: normalizedDomain,
          };
        }
        
        // Update existing record to verified
        verifiedDomain.verified = true;
        verifiedDomain.verifiedAt = new Date();
        verifiedDomain.verificationToken = token;
        verifiedDomain.verificationMethod = 'file'; // Default method
        await verifiedDomain.save();
      } else {
        // Create new verified domain
        verifiedDomain = await VerifiedDomain.create({
          userId,
          domain: normalizedDomain,
          verificationToken: token,
          verificationMethod: 'file',
          verified: true,
          verifiedAt: new Date(),
        });
      }

      return {
        success: true,
        message: 'Domain added as owned successfully',
        domain: normalizedDomain,
      };
    } catch (error: any) {
      console.error('Error adding owned domain:', error);
      return {
        success: false,
        message: error.message || 'Failed to add owned domain',
        domain: domain,
      };
    }
  }
}
