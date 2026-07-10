import axios from 'axios';
import { User } from '../db/models/User.model.js';
import { RepoScannerService } from '../services/repoScanner.service.js';
import { WebsiteScannerService } from '../services/websiteScanner.service.js';
import { Scan } from '../db/models/Scan.model.js';
import { WebsiteScan } from '../db/models/WebsiteScan.model.js';
import { NotificationService } from '../services/notification.service.js';

interface WhatsAppMessage {
  from: string;
  body: string;
  timestamp: string;
  messageId: string;
}

interface UserSession {
  userId: number;
  phoneNumber: string;
  state: 'idle' | 'awaiting_scan_type' | 'awaiting_repo_selection' | 'awaiting_website_url';
  lastActivity: Date;
  scanType?: 'repo' | 'website';
  repositories?: Array<{ name: string; fullName: string; description: string; defaultBranch: string }>;
}

export class WhatsAppWorker {
  private static sessions: Map<string, UserSession> = new Map();
  private static readonly SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes
  private static pollingInterval: NodeJS.Timeout | null = null;
  private static running: boolean = false;
  private static processedMessages: Set<string> = new Set(); // Track processed message IDs

  /**
   * Start the WhatsApp worker
   */
  static start() {
    if (this.running) {
      console.log('⚠️  WhatsApp Worker already running');
      return;
    }

    console.log('🤖 Starting WhatsApp Worker...');
    
    // Initialize notification service
    NotificationService.initialize();

    // Start polling for messages every 5 seconds
    this.pollingInterval = setInterval(() => {
      this.pollMessages();
    }, 5000);

    // Clean up expired sessions every minute
    setInterval(() => {
      this.cleanupSessions();
    }, 60000);

    this.running = true;
    console.log('✅ WhatsApp Worker started successfully');
  }

  /**
   * Stop the WhatsApp worker
   */
  static stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.running = false;
    console.log('🛑 WhatsApp Worker stopped');
  }

  /**
   * Check if worker is running
   */
  static isRunning(): boolean {
    return this.running;
  }

  /**
   * Get active session count
   */
  static getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Handle webhook message (called from webhook endpoint)
   */
  static async handleWebhookMessage(message: WhatsAppMessage) {
    // Check if we've already processed this message
    if (this.processedMessages.has(message.messageId)) {
      console.log(`⏭️  Skipping already processed message: ${message.messageId}`);
      return;
    }

    // Mark as processed
    this.processedMessages.add(message.messageId);

    // Clean up old processed messages (keep last 1000)
    if (this.processedMessages.size > 1000) {
      const toDelete = Array.from(this.processedMessages).slice(0, 100);
      toDelete.forEach(id => this.processedMessages.delete(id));
    }

    // Handle the message
    await this.handleIncomingMessage(message);
  }

  /**
   * Poll for new WhatsApp messages
   */
  private static async pollMessages() {
    try {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        return;
      }

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
      
      // Get messages from the last minute
      const dateFilter = new Date(Date.now() - 60000).toISOString();
      
      const response = await axios.get(twilioUrl, {
        auth: {
          username: process.env.TWILIO_ACCOUNT_SID,
          password: process.env.TWILIO_AUTH_TOKEN,
        },
        params: {
          DateSent: dateFilter,
          To: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        },
      });

      const messages = response.data.messages || [];
      
      for (const msg of messages) {
        // Only process incoming messages (not sent by us)
        if (msg.direction === 'inbound') {
          // Use handleWebhookMessage to ensure deduplication
          await this.handleWebhookMessage({
            from: msg.from.replace('whatsapp:', ''),
            body: msg.body,
            timestamp: msg.date_sent,
            messageId: msg.sid,
          });
        }
      }
    } catch (error: any) {
      console.error('Error polling WhatsApp messages:', error.message);
    }
  }

  /**
   * Handle incoming WhatsApp message
   */
  private static async handleIncomingMessage(message: WhatsAppMessage) {
    try {
      console.log(`📱 Received message from ${message.from}: ${message.body}`);

      // Ignore Twilio sandbox default messages
      if (message.body.includes('Configure your WhatsApp Sandbox') || 
          message.body.startsWith('You said :')) {
        console.log('⏭️  Skipping Twilio sandbox message');
        return;
      }

      // Find user by phone number
      const user = await User.findOne({ whatsappNumber: message.from });
      
      if (!user) {
        console.log(`⚠️  User not found for phone: ${message.from}`);
        await this.sendWhatsAppMessage(
          message.from,
          '❌ Your phone number is not registered. Please register on our platform first: https://your-app.com'
        );
        return;
      }

      console.log(`✅ User found: ${user.githubId}`);

      // Get or create session
      let session = this.sessions.get(message.from);
      if (!session) {
        session = {
          userId: user.githubId,
          phoneNumber: message.from,
          state: 'idle',
          lastActivity: new Date(),
        };
        this.sessions.set(message.from, session);
        console.log(`🆕 Created new session for ${message.from}`);
      } else {
        console.log(`♻️  Using existing session (state: ${session.state})`);
      }

      // Update last activity
      session.lastActivity = new Date();

      // Process message based on current state
      await this.processMessage(session, message.body.trim());

    } catch (error: any) {
      console.error('Error handling incoming message:', error);
      await this.sendWhatsAppMessage(
        message.from,
        '❌ An error occurred. Please try again later.'
      );
    }
  }

  /**
   * Process message based on session state
   */
  private static async processMessage(session: UserSession, messageBody: string) {
    const messageLower = messageBody.toLowerCase();
    console.log(`🔄 Processing message in state: ${session.state}, message: "${messageBody}"`);

    switch (session.state) {
      case 'idle':
        // Initial greeting or command
        if (messageLower.includes('hi') || messageLower.includes('hello') || messageLower.includes('start')) {
          session.state = 'awaiting_scan_type';
          console.log(`✅ State changed to: awaiting_scan_type`);
          await this.sendWhatsAppMessage(
            session.phoneNumber,
            '👋 Hello! I can help you scan for security vulnerabilities.\n\n' +
            'What would you like to scan?\n\n' +
            '1️⃣ Repository Scan - Scan a GitHub repository\n' +
            '2️⃣ Website Scan - Scan a website URL\n\n' +
            'Reply with "1" or "repo" for repository scan\n' +
            'Reply with "2" or "website" for website scan'
          );
        } else {
          await this.sendWhatsAppMessage(
            session.phoneNumber,
            '👋 Hi! Send "hi" or "hello" to get started.'
          );
        }
        break;

      case 'awaiting_scan_type':
        if (messageLower.includes('1') || messageLower.includes('repo')) {
          session.state = 'awaiting_repo_selection';
          session.scanType = 'repo';
          console.log(`✅ State changed to: awaiting_repo_selection`);
          
          // Fetch user's repositories
          await this.fetchAndDisplayRepositories(session);
        } else if (messageLower.includes('2') || messageLower.includes('website')) {
          session.state = 'awaiting_website_url';
          session.scanType = 'website';
          console.log(`✅ State changed to: awaiting_website_url`);
          await this.sendWhatsAppMessage(
            session.phoneNumber,
            '🌐 Website Scan Selected\n\n' +
            'Please send the website URL to scan.\n\n' +
            'Examples:\n' +
            '• https://example.com\n' +
            '• example.com\n\n' +
            'Send "cancel" to go back.'
          );
        } else if (messageLower === 'cancel') {
          session.state = 'idle';
          console.log(`✅ State changed to: idle (cancelled)`);
          await this.sendWhatsAppMessage(session.phoneNumber, '❌ Cancelled. Send "hi" to start again.');
        } else {
          console.log(`⚠️  Invalid option received: "${messageBody}"`);
          await this.sendWhatsAppMessage(
            session.phoneNumber,
            '❓ Invalid option. Please reply with:\n' +
            '• "1" or "repo" for repository scan\n' +
            '• "2" or "website" for website scan'
          );
        }
        break;

      case 'awaiting_repo_selection':
        if (messageLower === 'cancel') {
          session.state = 'idle';
          console.log(`✅ State changed to: idle (cancelled)`);
          await this.sendWhatsAppMessage(session.phoneNumber, '❌ Cancelled. Send "hi" to start again.');
        } else if (messageLower === 'refresh') {
          // Refresh repository list
          await this.fetchAndDisplayRepositories(session);
        } else {
          await this.handleRepoSelection(session, messageBody);
        }
        break;

      case 'awaiting_website_url':
        if (messageLower === 'cancel') {
          session.state = 'idle';
          console.log(`✅ State changed to: idle (cancelled)`);
          await this.sendWhatsAppMessage(session.phoneNumber, '❌ Cancelled. Send "hi" to start again.');
        } else {
          await this.handleWebsiteScan(session, messageBody);
        }
        break;
    }
  }

  /**
   * Fetch and display user's repositories
   */
  private static async fetchAndDisplayRepositories(session: UserSession) {
    try {
      await this.sendWhatsAppMessage(
        session.phoneNumber,
        '🔄 Fetching your repositories...'
      );

      // Get user's GitHub token (explicitly select it since it's excluded by default)
      const user = await User.findOne({ githubId: session.userId }).select('+githubAccessToken');
      if (!user || !user.githubAccessToken) {
        console.log(`❌ No GitHub token for user ${session.userId}`);
        await this.sendWhatsAppMessage(
          session.phoneNumber,
          '❌ GitHub access token not found. Please connect your GitHub account on the platform.'
        );
        session.state = 'idle';
        return;
      }

      console.log(`✅ GitHub token found for user ${session.userId}`);

      // Fetch repositories from GitHub
      const response = await axios.get('https://api.github.com/user/repos', {
        headers: {
          Authorization: `Bearer ${user.githubAccessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
        params: {
          sort: 'updated',
          per_page: 20, // Limit to 20 most recent repos
          affiliation: 'owner,collaborator',
        },
      });

      const repos = response.data;

      if (repos.length === 0) {
        await this.sendWhatsAppMessage(
          session.phoneNumber,
          '📭 No repositories found in your GitHub account.\n\n' +
          'Send "cancel" to go back.'
        );
        return;
      }

      // Store repositories in session
      session.repositories = repos.map((repo: any) => ({
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description || 'No description',
        defaultBranch: repo.default_branch || 'main',
      }));

      console.log(`✅ Found ${repos.length} repositories for user ${session.userId}`);

      // Format repository list
      let message = `📦 *Your Repositories* (${repos.length} found)\n\n`;
      message += 'Reply with the number to scan:\n\n';

      repos.slice(0, 10).forEach((repo: any, index: number) => {
        const desc = repo.description 
          ? (repo.description.length > 50 ? repo.description.substring(0, 50) + '...' : repo.description)
          : 'No description';
        message += `${index + 1}. *${repo.name}*\n`;
        message += `   ${desc}\n`;
        message += `   ⭐ ${repo.stargazers_count} | 🔀 ${repo.forks_count}\n\n`;
      });

      if (repos.length > 10) {
        message += `... and ${repos.length - 10} more\n\n`;
        message += '💡 Showing top 10 most recently updated\n\n';
      }

      message += '━━━━━━━━━━━━━━━━━━━━\n';
      message += 'Commands:\n';
      message += '• Send number (1-10) to scan\n';
      message += '• "refresh" to reload list\n';
      message += '• "cancel" to go back';

      await this.sendWhatsAppMessage(session.phoneNumber, message);

    } catch (error: any) {
      console.error('Error fetching repositories:', error);
      
      let errorMessage = '❌ Failed to fetch repositories. ';
      
      if (error.response?.status === 401) {
        errorMessage += 'GitHub token is invalid or expired. Please reconnect your GitHub account.';
      } else if (error.response?.status === 403) {
        errorMessage += 'GitHub API rate limit exceeded. Please try again later.';
      } else {
        errorMessage += error.message;
      }

      await this.sendWhatsAppMessage(session.phoneNumber, errorMessage);
      session.state = 'idle';
    }
  }

  /**
   * Handle repository selection
   */
  private static async handleRepoSelection(session: UserSession, selection: string) {
    try {
      console.log(`🔍 Handling repo selection: "${selection}"`);

      if (!session.repositories || session.repositories.length === 0) {
        await this.sendWhatsAppMessage(
          session.phoneNumber,
          '❌ No repositories loaded. Send "refresh" to reload the list.'
        );
        return;
      }

      // Parse selection (should be a number)
      const selectionNum = parseInt(selection.trim());

      if (isNaN(selectionNum) || selectionNum < 1 || selectionNum > Math.min(10, session.repositories.length)) {
        console.log(`⚠️  Invalid selection: "${selection}"`);
        await this.sendWhatsAppMessage(
          session.phoneNumber,
          `❓ Invalid selection. Please send a number between 1 and ${Math.min(10, session.repositories.length)}.\n\n` +
          'Or send "refresh" to reload the list.'
        );
        return;
      }

      // Get selected repository
      const selectedRepo = session.repositories[selectionNum - 1];
      console.log(`✅ Selected repo: ${selectedRepo.fullName}`);

      await this.sendWhatsAppMessage(
        session.phoneNumber,
        `🔍 Starting security scan for:\n\n` +
        `📦 *${selectedRepo.name}*\n` +
        `${selectedRepo.description}\n\n` +
        `This may take a few minutes. I'll send you the report when it's ready.`
      );

      // Get user's GitHub token (explicitly select it since it's excluded by default)
      const user = await User.findOne({ githubId: session.userId }).select('+githubAccessToken');
      if (!user || !user.githubAccessToken) {
        console.log(`❌ No GitHub token for user ${session.userId}`);
        await this.sendWhatsAppMessage(
          session.phoneNumber,
          '❌ GitHub access token not found. Please try again.'
        );
        session.state = 'idle';
        return;
      }

      console.log(`✅ GitHub token found, creating scan record for ${selectedRepo.fullName}...`);

      // Create scan record
      const scan = await Scan.create({
        userId: session.userId,
        repoId: selectedRepo.fullName.replace('/', '-'),
        repoName: selectedRepo.name,
        repoFullName: selectedRepo.fullName,
        repoUrl: `https://github.com/${selectedRepo.fullName}`,
        defaultBranch: selectedRepo.defaultBranch,
        status: 'queued',
        vulnerabilities: [],
        logs: [],
      });

      console.log(`✅ Scan record created: ${scan._id}`);

      // Start scan in background
      this.performRepoScan(
        scan._id.toString(),
        selectedRepo.fullName,
        selectedRepo.defaultBranch,
        user.githubAccessToken,
        session.phoneNumber
      );

      // Reset session
      session.state = 'idle';
      session.repositories = undefined; // Clear repositories from memory
      console.log(`✅ Session reset to idle`);

    } catch (error: any) {
      console.error('Error handling repo selection:', error);
      await this.sendWhatsAppMessage(
        session.phoneNumber,
        `❌ Error: ${error.message}`
      );
      session.state = 'idle';
    }
  }

  /**
   * Handle repository scan request (legacy - for direct URL input)
   */
  /**
   * Handle repository scan request (legacy - for direct URL input)
   */
  private static async handleRepoScan(session: UserSession, repoInput: string) {
    try {
      console.log(`🔍 Handling direct repo scan request: "${repoInput}"`);
      
      // Parse repository URL
      let repoFullName = repoInput.trim();
      
      // Extract owner/repo from URL if provided
      const githubUrlMatch = repoInput.match(/github\.com\/([^\/]+\/[^\/]+)/);
      if (githubUrlMatch) {
        repoFullName = githubUrlMatch[1].replace(/\.git$/, '');
      }

      console.log(`📦 Parsed repo name: "${repoFullName}"`);

      // Validate format
      if (!repoFullName.includes('/')) {
        console.log(`❌ Invalid format - no slash found in: "${repoFullName}"`);
        await this.sendWhatsAppMessage(
          session.phoneNumber,
          '❌ Invalid repository format. Please use:\n' +
          '• https://github.com/owner/repo\n' +
          '• owner/repo'
        );
        return;
      }

      console.log(`✅ Valid repo format, starting scan...`);

      await this.sendWhatsAppMessage(
        session.phoneNumber,
        `🔍 Starting repository scan for: ${repoFullName}\n\n` +
        'This may take a few minutes. I\'ll send you the report when it\'s ready.'
      );

      // Get user's GitHub token (explicitly select it since it's excluded by default)
      const user = await User.findOne({ githubId: session.userId }).select('+githubAccessToken');
      if (!user || !user.githubAccessToken) {
        console.log(`❌ No GitHub token for user ${session.userId}`);
        await this.sendWhatsAppMessage(
          session.phoneNumber,
          '❌ GitHub access token not found. Please connect your GitHub account on the platform.'
        );
        session.state = 'idle';
        return;
      }

      console.log(`✅ GitHub token found, creating scan record...`);

      // Create scan record
      const scan = await Scan.create({
        userId: session.userId,
        repoId: repoFullName.replace('/', '-'),
        repoName: repoFullName.split('/')[1],
        repoFullName: repoFullName,
        repoUrl: `https://github.com/${repoFullName}`,
        defaultBranch: 'main',
        status: 'queued',
        vulnerabilities: [],
        logs: [],
      });

      console.log(`✅ Scan record created: ${scan._id}`);

      // Start scan in background
      this.performRepoScan(scan._id.toString(), repoFullName, 'main', user.githubAccessToken, session.phoneNumber);

      // Reset session
      session.state = 'idle';
      console.log(`✅ Session reset to idle`);

    } catch (error: any) {
      console.error('Error handling repo scan:', error);
      await this.sendWhatsAppMessage(
        session.phoneNumber,
        `❌ Error: ${error.message}`
      );
      session.state = 'idle';
    }
  }

  /**
   * Perform repository scan
   */
  private static async performRepoScan(
    scanId: string,
    repoFullName: string,
    branch: string,
    accessToken: string,
    phoneNumber: string
  ) {
    try {
      // Run the scan
      await RepoScannerService.scanRepository(scanId, repoFullName, branch, accessToken);

      // Get scan results
      const scan = await Scan.findById(scanId);
      if (!scan) return;

      // Generate report
      const report = this.generateRepoReport(scan);

      // Send report via WhatsApp
      await this.sendWhatsAppMessage(phoneNumber, report);

    } catch (error: any) {
      console.error('Error performing repo scan:', error);
      await this.sendWhatsAppMessage(
        phoneNumber,
        `❌ Scan failed: ${error.message}\n\nPlease try again or check the web dashboard for details.`
      );
    }
  }

  /**
   * Handle website scan request
   */
  private static async handleWebsiteScan(session: UserSession, urlInput: string) {
    try {
      const url = urlInput.trim();

      await this.sendWhatsAppMessage(
        session.phoneNumber,
        `🔍 Starting website scan for: ${url}\n\n` +
        'This will take a moment...'
      );

      // Create scan record
      const websiteScan = await WebsiteScan.create({
        userId: session.userId,
        url: url,
        scanDate: new Date(),
        vulnerabilities: [],
        securityScore: 0,
        headers: {},
        technologies: [],
        ssl: { valid: false },
      });

      // Perform scan
      const result = await WebsiteScannerService.scanWebsite(url);

      // Update scan record
      websiteScan.vulnerabilities = result.vulnerabilities as any;
      websiteScan.securityScore = result.securityScore;
      websiteScan.headers = result.headers as any;
      websiteScan.technologies = result.technologies;
      websiteScan.ssl = result.ssl;
      await websiteScan.save();

      // Generate report
      const report = this.generateWebsiteReport(result);

      // Send report
      await this.sendWhatsAppMessage(session.phoneNumber, report);

      // Reset session
      session.state = 'idle';

    } catch (error: any) {
      console.error('Error handling website scan:', error);
      await this.sendWhatsAppMessage(
        session.phoneNumber,
        `❌ Error: ${error.message}`
      );
      session.state = 'idle';
    }
  }

  /**
   * Generate repository scan report
   */
  private static generateRepoReport(scan: any): string {
    const summary = scan.summary || { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
    
    let report = `📊 *Repository Scan Report*\n\n`;
    report += `Repository: ${scan.repoFullName}\n`;
    report += `Status: ${scan.status === 'completed' ? '✅ Completed' : '❌ Failed'}\n\n`;
    
    report += `*Summary:*\n`;
    report += `🔴 Critical: ${summary.critical}\n`;
    report += `🟠 High: ${summary.high}\n`;
    report += `🟡 Medium: ${summary.medium}\n`;
    report += `🟢 Low: ${summary.low}\n`;
    report += `📝 Total: ${summary.total}\n\n`;

    if (summary.total > 0) {
      report += `*Top Vulnerabilities:*\n`;
      const topVulns = scan.vulnerabilities.slice(0, 3);
      topVulns.forEach((vuln: any, index: number) => {
        const emoji = vuln.severity === 'critical' ? '🔴' : vuln.severity === 'high' ? '🟠' : '🟡';
        report += `${index + 1}. ${emoji} ${vuln.title}\n`;
        report += `   File: ${vuln.file}:${vuln.line}\n\n`;
      });

      if (scan.vulnerabilities.length > 3) {
        report += `... and ${scan.vulnerabilities.length - 3} more\n\n`;
      }
    }

    report += `View full report: https://your-app.com/scan/${scan._id}`;

    return report;
  }

  /**
   * Generate website scan report
   */
  private static generateWebsiteReport(result: any): string {
    let report = `📊 *Website Scan Report*\n\n`;
    report += `URL: ${result.url}\n`;
    report += `Security Score: ${result.securityScore}/100\n\n`;

    const vulnCounts = {
      critical: result.vulnerabilities.filter((v: any) => v.type === 'critical').length,
      high: result.vulnerabilities.filter((v: any) => v.type === 'high').length,
      medium: result.vulnerabilities.filter((v: any) => v.type === 'medium').length,
      low: result.vulnerabilities.filter((v: any) => v.type === 'low').length,
    };

    report += `*Vulnerabilities:*\n`;
    report += `🔴 Critical: ${vulnCounts.critical}\n`;
    report += `🟠 High: ${vulnCounts.high}\n`;
    report += `🟡 Medium: ${vulnCounts.medium}\n`;
    report += `🟢 Low: ${vulnCounts.low}\n\n`;

    if (result.vulnerabilities.length > 0) {
      report += `*Top Issues:*\n`;
      const topVulns = result.vulnerabilities.slice(0, 3);
      topVulns.forEach((vuln: any, index: number) => {
        const emoji = vuln.type === 'critical' ? '🔴' : vuln.type === 'high' ? '🟠' : '🟡';
        report += `${index + 1}. ${emoji} ${vuln.title}\n`;
        report += `   ${vuln.category}\n`;
        
        // Include evidence if available (truncate for WhatsApp)
        if (vuln.evidence) {
          const evidence = vuln.evidence.length > 200 
            ? vuln.evidence.substring(0, 200) + '...' 
            : vuln.evidence;
          report += `   📄 Evidence: ${evidence}\n`;
        }
        report += `\n`;
      });

      if (result.vulnerabilities.length > 3) {
        report += `... and ${result.vulnerabilities.length - 3} more\n\n`;
      }
    }

    if (result.technologies.length > 0) {
      report += `*Technologies Detected:*\n${result.technologies.join(', ')}\n\n`;
    }

    report += `View full report on the web dashboard.`;

    return report;
  }

  /**
   * Send WhatsApp message
   */
  private static async sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
    try {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        console.warn('Twilio credentials not configured');
        return false;
      }

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;

      await axios.post(
        twilioUrl,
        new URLSearchParams({
          From: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
          To: `whatsapp:${to}`,
          Body: message,
        }),
        {
          auth: {
            username: process.env.TWILIO_ACCOUNT_SID,
            password: process.env.TWILIO_AUTH_TOKEN,
          },
        }
      );

      console.log(`✅ WhatsApp message sent to ${to}`);
      return true;
    } catch (error: any) {
      console.error('Error sending WhatsApp message:', error.message);
      return false;
    }
  }

  /**
   * Clean up expired sessions
   */
  private static cleanupSessions() {
    const now = Date.now();
    for (const [phoneNumber, session] of this.sessions.entries()) {
      if (now - session.lastActivity.getTime() > this.SESSION_TIMEOUT) {
        this.sessions.delete(phoneNumber);
        console.log(`🧹 Cleaned up expired session for ${phoneNumber}`);
      }
    }
  }
}
