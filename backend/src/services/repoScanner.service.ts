import axios from 'axios';
import { AIService } from './ai.service.js';
import { Scan, IVulnerability, ICveResult } from '../db/models/Scan.model.js';
import { NotificationService } from './notification.service.js';
import crypto from 'crypto';

interface FileInfo {
  path: string;
  content: string;
  size: number;
  priority: number;
  group?: string; // Semantic group (e.g. "auth", "payment", "api")
}

interface TechStack {
  language: string[];
  frameworks: string[];
  databases: string[];
  summary: string;
}

export class RepoScannerService {
  private static readonly GITHUB_API_URL = 'https://api.github.com';
  private static readonly MAX_FILES_PER_BATCH = 5;       // 5 files per AI call
  private static readonly MAX_CHARS_PER_FILE = 2500;     // ~625 tokens — keeps batch under 6000 token limit
  private static readonly MAX_FILES_TOTAL = 120;         // max files to scan
  private static readonly PARALLEL_BATCHES = 3;          // 3 parallel = safe for Groq free tier (each key ~4500 tokens/wave)
  private static readonly CONCURRENT_FETCH = 15;         // concurrent GitHub file fetches

  static async scanRepository(
    scanId: string,
    repoFullName: string,
    defaultBranch: string,
    githubAccessToken: string
  ): Promise<void> {
    const scan = await Scan.findById(scanId);
    if (!scan) throw new Error('Scan not found');

    try {
      scan.status = 'scanning';
      await scan.save();

      await this.addLog(scanId, 'info', 'Starting comprehensive repository scan...');
      await this.addLog(scanId, 'info', `Repository: ${repoFullName} · Branch: ${defaultBranch}`);

      // Step 1: Verify repo + get actual branch
      let actualBranch = defaultBranch;
      try {
        const repoResponse = await axios.get(
          `${this.GITHUB_API_URL}/repos/${repoFullName}`,
          { headers: { Authorization: `Bearer ${githubAccessToken}`, Accept: 'application/vnd.github.v3+json' } }
        );
        actualBranch = repoResponse.data.default_branch;
        await this.addLog(scanId, 'success', `Repository verified. Branch: ${actualBranch}`);
      } catch (error: any) {
        if (error.response?.status === 404) throw new Error(`Repository '${repoFullName}' not found.`);
        if (error.response?.status === 401 || error.response?.status === 403) throw new Error('Access denied. Check your GitHub token permissions.');
        throw new Error(`Failed to verify repository: ${error.message}`);
      }

      // Step 2: Fetch all files + detect tech stack in PARALLEL
      await this.addLog(scanId, 'info', 'Fetching repository files and detecting tech stack...');
      const [allFiles, techStack] = await Promise.all([
        this.fetchAllRepositoryFiles(repoFullName, actualBranch, githubAccessToken),
        this.detectTechStack(repoFullName, actualBranch, githubAccessToken),
      ]);

      await this.addLog(scanId, 'success', `Found ${allFiles.length} code files. Stack: ${techStack.summary}`);

      // Step 3: Semantic grouping + priority sort
      const groupedFiles = this.semanticGroupAndPrioritize(allFiles);
      await this.addLog(scanId, 'info', `Files grouped into ${new Set(groupedFiles.map(f => f.group)).size} semantic clusters`);

      // Step 4: Parallel multi-pass AI analysis
      await this.addLog(scanId, 'info', `Starting parallel AI analysis (${this.PARALLEL_BATCHES} concurrent batches)...`);
      const allVulnerabilities = await this.parallelBatchAnalysis(scanId, groupedFiles, techStack);

      await this.addLog(scanId, 'success', `Analysis complete: ${allVulnerabilities.length} vulnerabilities found`);

      // Step 5: CVE dependency scanning via OSV API
      await this.addLog(scanId, 'info', 'Scanning dependencies for known CVEs (OSV API)...');
      const cveResults = await this.scanDependencies(allFiles, repoFullName, githubAccessToken);
      if (cveResults.length > 0) {
        await this.addLog(scanId, 'warning', `Found ${cveResults.length} CVE(s) in dependencies`);
      } else {
        await this.addLog(scanId, 'success', 'No known CVEs found in dependencies');
      }

      // Step 6: Save results
      const summary = {
        critical: allVulnerabilities.filter(v => v.severity === 'critical').length,
        high:     allVulnerabilities.filter(v => v.severity === 'high').length,
        medium:   allVulnerabilities.filter(v => v.severity === 'medium').length,
        low:      allVulnerabilities.filter(v => v.severity === 'low').length,
        total:    allVulnerabilities.length,
        patchable: allVulnerabilities.filter(v => v.fixAvailable).length,
      };

      scan.vulnerabilities = allVulnerabilities;
      scan.cveResults = cveResults;
      scan.summary = summary;
      scan.status = 'completed';
      scan.completedAt = new Date();
      await scan.save();

      await this.addLog(scanId, 'success', 'Scan completed');
      await this.addLog(scanId, 'info',
        `${summary.critical} critical · ${summary.high} high · ${summary.medium} medium · ${summary.low} low · ${summary.patchable} auto-patchable · ${cveResults.length} CVEs`
      );

      // Send WhatsApp security alert
      if (summary.total > 0) {
        const severity = summary.critical > 0 ? '🚨 CRITICAL' : summary.high > 0 ? '⚠️ HIGH' : '🟡 MEDIUM/LOW';
        const topIssues = allVulnerabilities
          .filter(v => v.severity === 'critical' || v.severity === 'high')
          .slice(0, 3)
          .map((v, i) => `${i + 1}. [${v.severity.toUpperCase()}] ${v.title} — ${v.file}:${v.line}`)
          .join('\n');

        const whatsappMsg =
          `${severity} — Security Scan Complete\n\n` +
          `Repository: ${scan.repoFullName}\n` +
          `Found: ${summary.critical} critical, ${summary.high} high, ${summary.medium} medium, ${summary.low} low\n` +
          (topIssues ? `\nTop Issues:\n${topIssues}\n` : '') +
          `\n👉 Fix them now: https://sentinalsec.vercel.app/results?scanId=${scanId}`;

        NotificationService.sendWhatsAppNotification(scan.userId, whatsappMsg).catch(err =>
          console.error('WhatsApp scan alert failed:', err.message)
        );
      } else {
        NotificationService.sendWhatsAppNotification(
          scan.userId,
          `✅ Scan Complete — No vulnerabilities found in ${scan.repoFullName}! Your code is clean.`
        ).catch(() => {});
      }
    } catch (error: any) {
      console.error('Error scanning repository:', error);
      scan.status = 'failed';
      scan.error = error.message;
      await scan.save();
      await this.addLog(scanId, 'error', `Scan failed: ${error.message}`);

      // Notify user of failure
      NotificationService.sendWhatsAppNotification(
        scan.userId,
        `❌ Scan Failed for ${scan.repoFullName}\n\nError: ${error.message}\n\nPlease try again: https://sentinalsec.vercel.app`
      ).catch(() => {});
    }
  }

  // ── CVE dependency scanning (OSV API) ─────────────────────────────────────
  private static async scanDependencies(
    allFiles: { path: string; content: string }[],
    _repoFullName: string,
    _token: string
  ): Promise<ICveResult[]> {
    type Dep = { name: string; version: string; ecosystem: string };
    const deps: Dep[] = [];

    for (const file of allFiles) {
      try {
        // npm / yarn
        if (file.path.endsWith('package.json') && !file.path.includes('node_modules')) {
          const pkg = JSON.parse(file.content);
          const merge = { ...pkg.dependencies, ...pkg.devDependencies };
          for (const [name, ver] of Object.entries(merge)) {
            const v = String(ver).replace(/[^0-9.]/g, '');
            if (v) deps.push({ name, version: v, ecosystem: 'npm' });
          }
        }
        // Python pip
        if (file.path.endsWith('requirements.txt')) {
          for (const line of file.content.split('\n')) {
            const m = line.trim().match(/^([A-Za-z0-9_.-]+)[=<>!]+([0-9.]+)/);
            if (m) deps.push({ name: m[1], version: m[2], ecosystem: 'PyPI' });
          }
        }
        // Go modules
        if (file.path.endsWith('go.mod')) {
          for (const line of file.content.split('\n')) {
            const m = line.trim().match(/^\s+([^\s]+)\s+v([0-9.]+)/);
            if (m) deps.push({ name: m[1], version: m[2], ecosystem: 'Go' });
          }
        }
        // Ruby Gemfile.lock
        if (file.path.endsWith('Gemfile.lock')) {
          for (const line of file.content.split('\n')) {
            const m = line.trim().match(/^([a-z_-]+)\s+\(([0-9.]+)\)/);
            if (m) deps.push({ name: m[1], version: m[2], ecosystem: 'RubyGems' });
          }
        }
      } catch { /* skip malformed files */ }
    }

    if (deps.length === 0) return [];

    // Batch query OSV API (up to 1000 per call, free, no auth needed)
    const BATCH = 100;
    const results: ICveResult[] = [];

    for (let i = 0; i < deps.length; i += BATCH) {
      const batch = deps.slice(i, i + BATCH);
      try {
        const osvRes = await axios.post(
          'https://api.osv.dev/v1/querybatch',
          { queries: batch.map(d => ({ version: d.version, package: { name: d.name, ecosystem: d.ecosystem } })) },
          { timeout: 30_000 }
        );
        const osvResults: any[] = osvRes.data?.results ?? [];
        osvResults.forEach((result, idx) => {
          const dep = batch[idx];
          (result.vulns ?? []).forEach((vuln: any) => {
            const cveId = (vuln.aliases ?? []).find((a: string) => a.startsWith('CVE-')) ?? vuln.id;
            const cvssScore = vuln.severity?.[0]?.score ?? 0;
            const severity = (vuln.database_specific?.severity?.toLowerCase() as ICveResult['severity'] | undefined)
              ?? (cvssScore >= 9 ? 'critical' : cvssScore >= 7 ? 'high' : cvssScore >= 4 ? 'medium' : 'low');
            const fixedIn = vuln.affected?.[0]?.ranges?.[0]?.events
              ?.find((e: any) => e.fixed)?.fixed;
            results.push({
              pkg: dep.name,
              version: dep.version,
              ecosystem: dep.ecosystem,
              cveId,
              osvId: vuln.id,
              severity: severity as ICveResult['severity'],
              summary: vuln.summary ?? vuln.details?.slice(0, 200) ?? 'No description',
              fixedIn,
            });
          });
        });
      } catch { /* OSV API failure is non-fatal */ }
    }

    return results;
  }

  // ── Tech stack detection ────────────────────────────────────────────────────
  private static async detectTechStack(
    repoFullName: string,
    branch: string,
    accessToken: string
  ): Promise<TechStack> {
    const stack: TechStack = { language: [], frameworks: [], databases: [], summary: 'Unknown' };

    try {
      // Try to read package.json
      const pkgResponse = await axios.get(
        `${this.GITHUB_API_URL}/repos/${repoFullName}/contents/package.json?ref=${branch}`,
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github.v3+json' }, timeout: 8000 }
      );
      const pkg = JSON.parse(Buffer.from(pkgResponse.data.content, 'base64').toString('utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Detect frameworks
      if (deps['react'] || deps['react-dom'])   stack.frameworks.push('React');
      if (deps['next'])                          stack.frameworks.push('Next.js');
      if (deps['vue'])                           stack.frameworks.push('Vue.js');
      if (deps['express'])                       stack.frameworks.push('Express.js');
      if (deps['fastify'])                       stack.frameworks.push('Fastify');
      if (deps['nestjs'] || deps['@nestjs/core']) stack.frameworks.push('NestJS');
      if (deps['django'])                        stack.frameworks.push('Django');
      if (deps['flask'])                         stack.frameworks.push('Flask');

      // Detect databases
      if (deps['mongoose'])                      stack.databases.push('MongoDB/Mongoose');
      if (deps['pg'] || deps['postgres'])        stack.databases.push('PostgreSQL');
      if (deps['mysql2'] || deps['mysql'])       stack.databases.push('MySQL');
      if (deps['sqlite3'])                       stack.databases.push('SQLite');
      if (deps['redis'] || deps['ioredis'])      stack.databases.push('Redis');
      if (deps['prisma'] || deps['@prisma/client']) stack.databases.push('Prisma ORM');
      if (deps['sequelize'])                     stack.databases.push('Sequelize ORM');
      if (deps['typeorm'])                       stack.databases.push('TypeORM');

      // Detect language
      if (deps['typescript'] || pkg.devDependencies?.typescript) stack.language.push('TypeScript');
      else stack.language.push('JavaScript');

      // Security libs (tells AI what protections are already in place)
      const securityLibs: string[] = [];
      if (deps['helmet'])           securityLibs.push('helmet');
      if (deps['express-rate-limit']) securityLibs.push('rate-limit');
      if (deps['jsonwebtoken'])     securityLibs.push('JWT');
      if (deps['bcrypt'] || deps['bcryptjs']) securityLibs.push('bcrypt');
      if (deps['joi'] || deps['zod'] || deps['yup']) securityLibs.push('input-validation');
      if (deps['cors'])             securityLibs.push('CORS-configured');

      stack.summary = [
        ...stack.language,
        ...stack.frameworks,
        ...stack.databases,
        securityLibs.length ? `(security: ${securityLibs.join(', ')})` : '(no security libs detected)',
      ].join(' + ');

    } catch {
      // package.json not found or not a Node project — try requirements.txt
      try {
        await axios.get(
          `${this.GITHUB_API_URL}/repos/${repoFullName}/contents/requirements.txt?ref=${branch}`,
          { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 5000 }
        );
        stack.language.push('Python');
        stack.summary = 'Python project';
      } catch {
        stack.summary = 'Unknown stack';
      }
    }

    return stack;
  }

  // ── File fetching ────────────────────────────────────────────────────────────
  private static async fetchAllRepositoryFiles(
    repoFullName: string,
    branch: string,
    accessToken: string
  ): Promise<FileInfo[]> {
    const allFiles: FileInfo[] = [];

    const treeResponse = await axios.get(
      `${this.GITHUB_API_URL}/repos/${repoFullName}/git/trees/${branch}?recursive=1`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github.v3+json' } }
    );

    const SKIP_PATHS = ['node_modules/', '.git/', 'dist/', 'build/', 'vendor/', '__pycache__/', '.next/'];
    const CODE_EXTS = new Set(['js','ts','jsx','tsx','py','java','go','php','rb','cs','cpp','c','h','rs','kt','swift','mjs','cjs']);

    const codeFiles = treeResponse.data.tree.filter((item: any) => {
      if (item.type !== 'blob') return false;
      if (SKIP_PATHS.some(p => item.path.includes(p))) return false;
      if (item.path.includes('.min.')) return false;
      const ext = item.path.split('.').pop()?.toLowerCase();
      return CODE_EXTS.has(ext || '');
    });

    // Sort by priority and cap
    const prioritized = codeFiles
      .map((f: any) => ({ ...f, priority: this.calculateFilePriority(f.path, '') }))
      .sort((a: any, b: any) => b.priority - a.priority)
      .slice(0, this.MAX_FILES_TOTAL);

    // Fetch file contents concurrently
    for (let i = 0; i < prioritized.length; i += this.CONCURRENT_FETCH) {
      const batch = prioritized.slice(i, i + this.CONCURRENT_FETCH);
      const results = await Promise.allSettled(
        batch.map(async (file: any) => {
          const res = await axios.get(
            `${this.GITHUB_API_URL}/repos/${repoFullName}/contents/${file.path}?ref=${branch}`,
            {
              headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github.v3+json' },
              timeout: 15000,
            }
          );
          if (!res.data.content) return null;
          const content = Buffer.from(res.data.content, 'base64').toString('utf-8');
          return {
            path: file.path,
            content,
            size: content.length,
            priority: this.calculateFilePriority(file.path, content),
          };
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) allFiles.push(r.value);
      }
    }

    return allFiles;
  }

  // ── Semantic grouping ────────────────────────────────────────────────────────
  // Groups related files so the AI sees them together (e.g. controller + service + route)
  private static semanticGroupAndPrioritize(files: FileInfo[]): FileInfo[] {
    const getGroup = (path: string): string => {
      const p = path.toLowerCase();
      if (p.includes('auth') || p.includes('login') || p.includes('password') || p.includes('session') || p.includes('jwt') || p.includes('oauth')) return 'auth';
      if (p.includes('payment') || p.includes('billing') || p.includes('stripe') || p.includes('checkout')) return 'payment';
      if (p.includes('sql') || p.includes('query') || p.includes('database') || p.includes('db') || p.includes('model') || p.includes('repository')) return 'database';
      if (p.includes('upload') || p.includes('file') || p.includes('storage') || p.includes('s3')) return 'file';
      if (p.includes('admin') || p.includes('permission') || p.includes('role') || p.includes('access')) return 'access';
      if (p.includes('api') || p.includes('route') || p.includes('controller') || p.includes('endpoint')) return 'api';
      if (p.includes('crypto') || p.includes('hash') || p.includes('cipher') || p.includes('encrypt')) return 'crypto';
      if (p.includes('config') || p.includes('env') || p.includes('secret') || p.includes('key')) return 'config';
      return 'general';
    };

    // Assign groups and re-sort: high-priority groups first, then within group by file priority
    const GROUP_ORDER: Record<string, number> = {
      auth: 100, payment: 95, crypto: 90, access: 85,
      database: 80, api: 70, config: 60, file: 50, general: 0,
    };

    return files
      .map(f => ({ ...f, group: getGroup(f.path) }))
      .sort((a, b) => {
        const groupDiff = (GROUP_ORDER[b.group!] || 0) - (GROUP_ORDER[a.group!] || 0);
        return groupDiff !== 0 ? groupDiff : b.priority - a.priority;
      });
  }

  // ── Parallel batch analysis ──────────────────────────────────────────────────
  // Runs PARALLEL_BATCHES batches simultaneously instead of sequentially
  private static async parallelBatchAnalysis(
    scanId: string,
    files: FileInfo[],
    techStack: TechStack
  ): Promise<IVulnerability[]> {
    const allVulnerabilities: IVulnerability[] = [];
    const totalFiles = files.length;
    const totalBatches = Math.ceil(totalFiles / this.MAX_FILES_PER_BATCH);

    // Build all batches upfront
    const batches: Array<Array<FileInfo>> = [];
    for (let i = 0; i < files.length; i += this.MAX_FILES_PER_BATCH) {
      batches.push(files.slice(i, i + this.MAX_FILES_PER_BATCH));
    }

    await this.addLog(scanId, 'info', `${totalFiles} files → ${totalBatches} batches · ${this.PARALLEL_BATCHES} running in parallel`);

    let completedBatches = 0;

    // Process in "waves" of PARALLEL_BATCHES concurrent calls
    for (let wave = 0; wave < batches.length; wave += this.PARALLEL_BATCHES) {
      const waveBatches = batches.slice(wave, wave + this.PARALLEL_BATCHES);
      const waveNumber = Math.floor(wave / this.PARALLEL_BATCHES) + 1;
      const totalWaves = Math.ceil(batches.length / this.PARALLEL_BATCHES);

      await this.addLog(scanId, 'info', `Wave ${waveNumber}/${totalWaves}: analyzing ${waveBatches.length} batches in parallel...`);

      const waveResults = await Promise.allSettled(
        waveBatches.map(async (batch, idx) => {
          const batchNum = wave + idx + 1;
          const preparedBatch = batch.map(file => ({
            path: file.path,
            content: this.smartTruncate(file.content, file.path),
          }));

          try {
            const result = await this.analyzeWithRetry(preparedBatch, techStack, scanId, batchNum, 3);
            return this.mapVulnerabilities(result.vulnerabilities);
          } catch (error: any) {
            await this.addLog(scanId, 'warning', `Batch ${batchNum} failed after retries: ${error.message}`);
            return [];
          }
        })
      );

      for (const r of waveResults) {
        if (r.status === 'fulfilled') {
          allVulnerabilities.push(...r.value);
          completedBatches++;
        }
      }

      const progress = Math.round((completedBatches / totalBatches) * 100);
      const waveFindingsCount = waveResults.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value.length : 0), 0);
      await this.addLog(scanId, 'success',
        `Wave ${waveNumber} complete: +${waveFindingsCount} findings (${progress}% done)`
      );
    }

    return allVulnerabilities;
  }

  // ── AI call with tech stack context ─────────────────────────────────────────
  private static async analyzeWithRetry(
    files: Array<{ path: string; content: string }>,
    techStack: TechStack,
    scanId: string,
    batchNumber: number,
    maxRetries: number
  ): Promise<any> {
    // Inject tech stack context into every file's metadata
    const enrichedFiles = files.map(f => ({
      path: f.path,
      // Prepend stack context as a comment so the AI knows what to focus on
      content: `// TECH STACK CONTEXT: ${techStack.summary}\n${f.content}`,
    }));

    let lastError: any;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await AIService.analyzeCode(enrichedFiles);
      } catch (error: any) {
        lastError = error;
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1500 * attempt)); // backoff
        }
      }
    }
    throw lastError;
  }

  // ── Map AI output to IVulnerability ─────────────────────────────────────────
  private static mapVulnerabilities(rawVulns: any[]): IVulnerability[] {
    return (rawVulns || [])
      .filter((v: any) => v.title && v.severity && v.file && v.line && v.description && v.cweId)
      .map((v: any) => ({
        id: crypto.randomUUID(),
        title: v.title,
        severity: v.severity,
        cvssScore: typeof v.cvssScore === 'number' ? v.cvssScore : undefined,
        scanner: 'Groq AI',
        file: v.file,
        line: v.line,
        lineEnd: typeof v.lineEnd === 'number' ? v.lineEnd : v.line,
        description: v.description,
        exploitExample: v.exploitExample || undefined,
        cweId: v.cweId,
        remediationPriority: typeof v.remediationPriority === 'number' ? v.remediationPriority : undefined,
        fixAvailable: !!(v.patchedCode && v.patchedCode !== v.originalCode && v.patchedCode.trim().length > 0),
        originalCode: v.originalCode || '// Code snippet not available',
        patchedCode: v.patchedCode || '// Fix not available',
      }));
  }

  // ── File priority score ──────────────────────────────────────────────────────
  private static calculateFilePriority(path: string, content: string): number {
    let priority = 0;
    const p = path.toLowerCase();
    const c = content.toLowerCase();

    // Path signals
    if (p.includes('auth'))     priority += 100;
    if (p.includes('login'))    priority += 100;
    if (p.includes('password')) priority += 100;
    if (p.includes('security')) priority += 100;
    if (p.includes('payment'))  priority += 100;
    if (p.includes('crypto'))   priority += 90;
    if (p.includes('token'))    priority += 90;
    if (p.includes('sql'))      priority += 90;
    if (p.includes('session'))  priority += 80;
    if (p.includes('query'))    priority += 80;
    if (p.includes('admin'))    priority += 80;
    if (p.includes('api'))      priority += 70;
    if (p.includes('db') || p.includes('database')) priority += 70;
    if (p.includes('user'))     priority += 60;

    // Content signals
    if (c.includes('password')) priority += 50;
    if (c.includes('secret'))   priority += 50;
    if (c.includes('api_key') || c.includes('apikey')) priority += 50;
    if (c.includes('token'))    priority += 40;
    if (c.includes('sql'))      priority += 40;
    if (c.includes('exec(') || c.includes('eval(')) priority += 60;
    if (c.includes('md5') || c.includes('sha1'))    priority += 40;

    // Extension bonus
    if (p.endsWith('.ts') || p.endsWith('.js')) priority += 20;
    if (p.endsWith('.py') || p.endsWith('.java')) priority += 15;

    return priority;
  }

  // ── Smart truncation ─────────────────────────────────────────────────────────
  private static smartTruncate(content: string, filePath: string): string {
    if (content.length <= this.MAX_CHARS_PER_FILE) return content;

    const lines = content.split('\n');
    const critical: string[] = [];
    const important: string[] = [];
    const normal: string[] = [];

    for (const line of lines) {
      const l = line.toLowerCase();
      // Critical: direct security indicators
      if (l.includes('password') || l.includes('secret') || l.includes('api_key') ||
          l.includes('exec(') || l.includes('eval(') || l.includes('sql') ||
          l.includes('md5') || l.includes('sha1') || l.includes('private key')) {
        critical.push(line);
      // Important: security-adjacent
      } else if (l.includes('token') || l.includes('auth') || l.includes('crypto') ||
                 l.includes('hash') || l.includes('query') || l.includes('input') ||
                 l.includes('sanitize') || l.includes('validate') || l.includes('escape')) {
        important.push(line);
      } else {
        normal.push(line);
      }
    }

    // Fill: critical first, then important, then normal until limit
    let truncated = '';
    for (const line of [...critical, ...important, ...normal]) {
      if (truncated.length + line.length + 1 > this.MAX_CHARS_PER_FILE) break;
      truncated += line + '\n';
    }

    truncated += '\n// ... (file truncated — all security-relevant lines included above)';
    return truncated;
  }

  // ── Logging ──────────────────────────────────────────────────────────────────
  private static async addLog(
    scanId: string,
    level: 'info' | 'success' | 'warning' | 'error',
    message: string
  ): Promise<void> {
    try {
      await Scan.findByIdAndUpdate(scanId, {
        $push: { logs: { time: new Date(), message, level } },
      });
    } catch {}
  }
}
