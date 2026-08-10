import axios from 'axios';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

export interface AIAnalysisResult {
  vulnerabilities: Array<{
    title: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    file: string;
    line: number;
    description: string;
    cweId: string;
    originalCode: string;
    patchedCode: string;
  }>;
}

interface APIKeyRotator {
  keys: string[];
  currentIndex: number;
  lastUsed: Map<string, number>;
  failureCount: Map<string, number>;
}

export class AIService {
  private static geminiRotator: APIKeyRotator = {
    keys: config.gemini.apiKeys,
    currentIndex: 0,
    lastUsed: new Map(),
    failureCount: new Map(),
  };

  private static groqRotator: APIKeyRotator = {
    keys: config.groq.apiKeys,
    currentIndex: 0,
    lastUsed: new Map(),
    failureCount: new Map(),
  };

  private static readonly MAX_FAILURES_BEFORE_SKIP = 3;
  private static readonly FAILURE_RESET_TIME = 5 * 60 * 1000; // 5 minutes

  private static getNextKey(rotator: APIKeyRotator): string | null {
    if (rotator.keys.length === 0) return null;

    const now = Date.now();
    
    // Clean up old failure counts
    for (const [key, lastFail] of rotator.lastUsed.entries()) {
      if (now - lastFail > this.FAILURE_RESET_TIME) {
        rotator.failureCount.delete(key);
      }
    }

    // Find the best available key (least failures, least recently used)
    const availableKeys = rotator.keys
      .map(key => ({
        key,
        failures: rotator.failureCount.get(key) || 0,
        lastUsed: rotator.lastUsed.get(key) || 0,
      }))
      .filter(k => k.failures < this.MAX_FAILURES_BEFORE_SKIP)
      .sort((a, b) => {
        // Sort by failures first, then by last used time
        if (a.failures !== b.failures) return a.failures - b.failures;
        return a.lastUsed - b.lastUsed;
      });

    if (availableKeys.length === 0) {
      // All keys have failed, reset and try again
      logger.warn('All API keys have failed — resetting failure counts', { provider: 'rotator' });
      rotator.failureCount.clear();
      rotator.lastUsed.clear();
      return rotator.keys[0];
    }

    const selectedKey = availableKeys[0].key;
    rotator.lastUsed.set(selectedKey, now);
    return selectedKey;
  }

  private static markKeyAsFailed(rotator: APIKeyRotator, key: string): void {
    const currentFailures = rotator.failureCount.get(key) || 0;
    rotator.failureCount.set(key, currentFailures + 1);
    logger.warn('API key failed', { failures: currentFailures + 1, keyPrefix: key.substring(0, 20) });
  }

  private static markKeyAsSuccess(rotator: APIKeyRotator, key: string): void {
    // Reset failure count on success
    rotator.failureCount.delete(key);
  }

  static async analyzeCode(files: Array<{ path: string; content: string }>): Promise<AIAnalysisResult> {
    const errors: string[] = [];
    const providers = [
      { name: 'Groq', rotator: this.groqRotator, method: this.analyzeWithGroq.bind(this) },
      { name: 'Gemini', rotator: this.geminiRotator, method: this.analyzeWithGemini.bind(this) },
    ];

    logger.info('AI analysis started', {
      groqKeys: this.groqRotator.keys.length,
      geminiKeys: this.geminiRotator.keys.length,
      files: files.length,
    });

    // Try all providers with rotation
    for (const provider of providers) {
      if (provider.rotator.keys.length === 0) {
        logger.warn('No API keys configured for provider', { provider: provider.name });
        errors.push(`No ${provider.name} API keys configured`);
        continue;
      }

      logger.info('Trying AI provider', { provider: provider.name, keys: provider.rotator.keys.length });
      
      // Try all available keys for this provider
      const maxAttempts = provider.rotator.keys.length * 2; // Allow retries
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const apiKey = this.getNextKey(provider.rotator);
        if (!apiKey) {
          console.error(`❌ No ${provider.name} API key available`);
          break;
        }

        try {
          logger.info('AI provider attempt', { provider: provider.name, attempt: attempt + 1, keyPrefix: apiKey.substring(0, 20) });
          const result = await provider.method(files, apiKey);
          logger.info('AI provider succeeded', { provider: provider.name });
          this.markKeyAsSuccess(provider.rotator, apiKey);
          return result;
        } catch (error: any) {
          const errorMsg = `${provider.name} attempt ${attempt + 1} failed: ${error.message}`;
          logger.warn('AI provider attempt failed', { provider: provider.name, attempt: attempt + 1, error: error.message, status: error.response?.status });
          if (error.response?.data) {
            logger.debug('AI provider error response', { data: error.response.data });
          }
          errors.push(errorMsg);
          this.markKeyAsFailed(provider.rotator, apiKey);
          
          // If it's a rate limit error, try next key immediately
          if (error.response?.status === 429) {
            logger.info('Rate limit hit — trying next key', { provider: provider.name });
            continue;
          }
          
          // For other errors, add a small delay before retry
          await this.sleep(1000);
        }
      }
    }

    const finalError = `All AI providers failed after rotation:\n${errors.join('\n')}`;
    logger.error('All AI providers exhausted', { errors });
    throw new Error(finalError);
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private static async analyzeWithGemini(
    files: Array<{ path: string; content: string }>,
    apiKey: string
  ): Promise<AIAnalysisResult> {
    try {
      const prompt = this.buildAnalysisPrompt(files);
      const systemPrompt = this.getSystemPrompt();

      // Use gemini-2.0-flash — stable production model (gemini-3-flash-preview does not exist)
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          contents: [
            {
              parts: [
                {
                  text: `${systemPrompt}\n\n${prompt}`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8000,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      );

      const content = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        logger.error('Empty response from Gemini API', { responseData: JSON.stringify(response.data) });
        throw new Error('No response from Gemini API');
      }

      return this.parseAIResponse(content);
    } catch (error: any) {
      if (error.response) {
        // API returned an error response
        const status = error.response.status;
        const data = error.response.data;
        throw new Error(`Gemini API error (${status}): ${JSON.stringify(data)}`);
      } else if (error.request) {
        // Request was made but no response
        throw new Error(`Gemini API no response: ${error.message}`);
      } else {
        // Something else happened
        throw new Error(`Gemini API error: ${error.message}`);
      }
    }
  }

  private static async analyzeWithGroq(
    files: Array<{ path: string; content: string }>,
    apiKey: string
  ): Promise<AIAnalysisResult> {
    try {
      const prompt = this.buildAnalysisPrompt(files);
      const systemPrompt = this.getSystemPrompt();

      const response = await axios.post(
        `${config.groq.apiUrl}/chat/completions`,
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 8000,
          response_format: { type: 'json_object' },
        },

        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      );

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        logger.error('Empty response from Groq API', { responseData: JSON.stringify(response.data) });
        throw new Error('No response from Groq API');
      }

      return this.parseAIResponse(content);
    } catch (error: any) {
      if (error.response) {
        // API returned an error response
        const status = error.response.status;
        const data = error.response.data;
        throw new Error(`Groq API error (${status}): ${JSON.stringify(data)}`);
      } else if (error.request) {
        // Request was made but no response
        throw new Error(`Groq API no response: ${error.message}`);
      } else {
        // Something else happened
        throw new Error(`Groq API error: ${error.message}`);
      }
    }
  }

  private static getSystemPrompt(): string {
    return `You are a senior application security engineer (OWASP Top 10, CWE/SANS expertise) performing a precise code security audit.
Your job is to find REAL, EXPLOITABLE vulnerabilities with clear attack paths — not theoretical noise.

Return ONLY a valid JSON object:
{
  "vulnerabilities": [
    {
      "title": "Concise vulnerability title",
      "severity": "critical|high|medium|low",
      "file": "path/to/file.ext",
      "line": 123,
      "description": "What the vulnerability is, HOW an attacker exploits it, and what the impact is",
      "cweId": "CWE-XXX",
      "originalCode": "exact vulnerable code snippet (copy it verbatim, do not paraphrase)",
      "patchedCode": "exact fixed replacement (same structure, just secured)"
    }
  ]
}

DESCRIPTION QUALITY STANDARD:
Every description MUST follow this pattern:
"An attacker can [specific action] by [specific mechanism] because [root cause]. This leads to [concrete impact]."
Example: "An attacker can bypass authentication by sending { $gt: '' } as the password because Mongoose passes
objects directly to findOne() without validation. This allows login as any user without knowing their password."

STRICT FALSE POSITIVE RULES — NEVER FLAG THESE:

1. DETECTION CODE IS NOT A VULNERABILITY
   Scanner/pentest files intentionally contain attack patterns. NEVER flag them.
   FALSE POSITIVE: "if (content.includes('eval('))" in scanner.ts
   FALSE POSITIVE: "payload = \"' OR 1=1--\"" in penetrationTesting.service.ts

2. TYPESCRIPT TYPE ANNOTATIONS ARE NOT SECRETS
   "githubAccessToken: string" is a TYPE DEFINITION. Only flag: const token = "ghp_realkey123".

3. IMPORT STATEMENTS ARE NOT VULNERABILITIES
   NEVER flag import/require statements as any CWE.

4. process.env.X IS THE CORRECT SECURE PATTERN
   NEVER flag environment variable reads as CWE-798. Only flag literal secrets: const key = "sk-real-key".

5. REACT JSX IS AUTO-XSS-SAFE
   Only flag XSS if dangerouslySetInnerHTML={{ __html: userInput }} is used without sanitization.

6. DEVELOPER SCRIPTS: max LOW severity
   Files in scripts/ or bin/ are local dev tools.

7. LOCALHOST FALLBACKS ARE ACCEPTABLE
   process.env.MONGO_URI || 'mongodb://localhost:27017/app' is standard.

8. PEN TEST PAYLOADS ARE NOT CREDENTIALS
   Attack payload arrays in pentest files are test data, not app secrets.

9. JWT BEARER AUTH IS INDUSTRY STANDARD
   req.headers.authorization?.replace('Bearer ', '') is correct. Do not flag as CWE-287.

10. PUBLIC URLS AND DNS SERVERS ARE NOT SECRETS
    'https://api.github.com', '8.8.8.8' are public. Never flag as CWE-798.

FRAMEWORK-SPECIFIC VULNERABILITY PATTERNS TO LOOK FOR:

MongoDB/Mongoose:
  - User input passed directly to findOne/find without type-checking: { [field]: req.body[field] }
  - $where operator with user input (JavaScript injection)
  - Missing .lean() on queries returning user-controlled data exposed to prototype pollution

Express.js:
  - Route handlers missing authentication middleware on sensitive endpoints
  - req.params.id used in DB query without verifying it belongs to req.user
  - res.redirect(req.query.returnUrl) without URL whitelist validation
  - Missing error handling that leaks stack traces in production

JWT:
  - jwt.verify() with algorithm: 'none' allowed
  - Missing exp claim validation
  - Symmetric secret used where asymmetric key needed for public verification

Bcrypt/Password:
  - Passwords compared with == instead of bcrypt.compare()
  - MD5/SHA1 used for password hashing instead of bcrypt/argon2
  - Password included in console.log or error messages

File Operations:
  - path.join(__dirname, req.params.file) without sanitization (path traversal)
  - fs.readFile with user-controlled path

Child Process:
  - exec() or spawn() with template literals containing user input
  - shell: true with user-controlled commands

REAL VULNERABILITIES TO FIND:
- NoSQL/SQL injection with unsanitized user input reaching the database
- Missing authorization: endpoint fetches resource by ID without checking ownership
- Actual hardcoded secrets as string literals (20+ char alphanumeric values)
- Path traversal in file reads with user-controlled paths
- Command injection in child_process with user input
- Sensitive data (tokens, passwords) in logs, URLs, or error responses
- Missing input validation on public endpoints that directly query the database
- Insecure crypto: MD5/SHA1 for passwords, static IVs, predictable random
- IDOR: sequential IDs accessible without ownership check
- Prototype pollution via Object.assign or merge with user-controlled keys

Only report a vulnerability if you can write a complete exploit description.
If you cannot describe exactly how an attacker would exploit it step-by-step, DO NOT include it.`;
  }

  private static buildAnalysisPrompt(files: Array<{ path: string; content: string }>): string {
    const classifyFile = (filePath: string): string => {
      const p = filePath.toLowerCase();
      if (p.includes('scanner') || p.includes('scraper'))    return '[SECURITY SCANNER — detection patterns here are intentional tools, NOT vulnerabilities]';
      if (p.includes('penetration') || p.includes('pentest')) return '[PENETRATION TESTER — attack payloads are test data sent to other systems, NOT app credentials]';
      if (p.includes('scripts/') || p.includes('/bin/') || p.includes('\\scripts\\')) return '[DEVELOPER SCRIPT — local tool, never a production endpoint, max LOW severity]';
      if (p.endsWith('.tsx') || p.endsWith('.jsx'))           return '[REACT COMPONENT — JSX auto-escapes output; only flag dangerouslySetInnerHTML with user data]';
      if (p.includes('model') || p.includes('schema'))        return '[DATABASE MODEL — look for missing indexes, field exposure, unvalidated inputs reaching queries]';
      if (p.includes('middleware'))                           return '[EXPRESS MIDDLEWARE — look for auth bypass, missing checks, header manipulation]';
      if (p.includes('controller'))                           return '[API CONTROLLER — look for IDOR, missing ownership checks, unvalidated params reaching DB]';
      if (p.includes('service'))                              return '[SERVICE LAYER — look for injection, insecure crypto, data leakage in errors]';
      if (p.includes('route'))                                return '[API ROUTE — look for missing auth middleware, overly permissive methods]';
      if (p.includes('config') || p.includes('env'))          return '[CONFIG FILE — look for hardcoded literal secrets (not process.env reads)]';
      if (p.includes('auth') || p.includes('jwt') || p.includes('session')) return '[AUTH MODULE — highest priority: bypass, token forgery, session fixation]';
      if (p.includes('payment') || p.includes('billing'))     return '[PAYMENT MODULE — highest priority: price manipulation, IDOR on orders]';
      if (p.includes('upload') || p.includes('file'))         return '[FILE HANDLER — look for path traversal, unrestricted upload, directory listing]';
      return '[SOURCE FILE]';
    };

    // Extract tech stack context injected by repoScanner
    let stackContext = '';
    for (const file of files) {
      const firstLine = file.content.split('\n')[0] || '';
      if (firstLine.startsWith('// TECH STACK CONTEXT:')) {
        stackContext = firstLine.replace('// TECH STACK CONTEXT:', '').trim();
        break;
      }
    }

    let prompt = 'Analyze the following code files for REAL, EXPLOITABLE security vulnerabilities.\n';
    prompt += 'Apply ALL false positive rules from your system instructions before flagging anything.\n';
    if (stackContext) {
      prompt += `Tech stack: ${stackContext}\n`;
      // Add stack-specific focus hints
      if (stackContext.includes('Mongoose') || stackContext.includes('MongoDB')) {
        prompt += 'FOCUS: NoSQL injection via object injection, $where with user input, missing ownership checks in findOne().\n';
      }
      if (stackContext.includes('Express')) {
        prompt += 'FOCUS: Missing auth middleware on routes, req.params passed to DB without ownership check, open redirect via req.query.\n';
      }
      if (stackContext.includes('JWT')) {
        prompt += 'FOCUS: alg:none acceptance, missing expiry check, secret strength.\n';
      }
      if (stackContext.includes('no security libs')) {
        prompt += 'FOCUS: Missing rate limiting, no input validation, no CSRF protection — these are HIGH priority gaps.\n';
      }
    }
    prompt += '\n';

    for (const file of files) {
      const label = classifyFile(file.path);
      // Strip the injected tech stack comment from the content before sending
      const cleanContent = file.content.replace(/^\/\/ TECH STACK CONTEXT:.*\n/, '');
      prompt += `=== FILE: ${file.path} ${label} ===\n`;
      prompt += cleanContent;
      prompt += '\n\n';
    }

    prompt += 'For each vulnerability found, include the EXACT vulnerable code snippet as originalCode and the EXACT fixed code as patchedCode (not descriptions, actual code).\n';
    prompt += 'Return only confirmed, exploitable vulnerabilities in the specified JSON format.';
    return prompt;
  }

  private static parseAIResponse(content: string): AIAnalysisResult {
    // Step 1: Strip markdown code fences (```json ... ``` or ``` ... ```)
    let cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();

    // Step 2: Try to find the JSON object — look for the outermost { ... }
    // Use a bracket-counting approach instead of greedy regex to handle nested braces correctly
    let jsonStr: string | null = null;
    const startIdx = cleaned.indexOf('{');
    if (startIdx !== -1) {
      let depth = 0;
      let endIdx = -1;
      for (let i = startIdx; i < cleaned.length; i++) {
        if (cleaned[i] === '{') depth++;
        else if (cleaned[i] === '}') {
          depth--;
          if (depth === 0) { endIdx = i; break; }
        }
      }
      if (endIdx !== -1) {
        jsonStr = cleaned.slice(startIdx, endIdx + 1);
      }
    }

    if (!jsonStr) {
      logger.error('AI response did not contain valid JSON', { contentPreview: content.substring(0, 200) });
      throw new Error('Invalid JSON response from AI');
    }

    let result: any;
    try {
      result = JSON.parse(jsonStr);
    } catch (parseErr: any) {
      logger.error('AI JSON parse failed', { error: parseErr.message, jsonPreview: jsonStr.substring(0, 300) });
      throw new Error(`Invalid JSON response from AI: ${parseErr.message}`);
    }

    // Validate and clean the result
    if (!result.vulnerabilities || !Array.isArray(result.vulnerabilities)) {
      logger.warn('AI returned invalid vulnerabilities array — returning empty result');
      return { vulnerabilities: [] };
    }

    // Ensure all required fields are present
    result.vulnerabilities = result.vulnerabilities.filter((v: any) => {
      return v.title && v.severity && v.file && v.line && v.description && v.cweId;
    }).map((v: any) => ({
      ...v,
      originalCode: v.originalCode || '// Code snippet not available',
      patchedCode: v.patchedCode || '// Fix not available',
    }));

    // ── Deterministic false-positive filter ──────────────────────────────────
    // LLMs sometimes ignore prompt rules. This code-level filter is the safety net.
    result.vulnerabilities = result.vulnerabilities.filter((v: any) => {
      const code = (v.originalCode || '').trim();
      const file = (v.file || '').toLowerCase();
      const cwe  = (v.cweId || '').toUpperCase();

      // 1. Import statements are never vulnerabilities
      if (/^import\s/.test(code) || /^from\s/.test(code)) {
        logger.debug('FP-filter: removed import-statement finding', { file: v.file, title: v.title });
        return false;
      }

      // 2. Stub code snippets the AI invented (not real code)
      if (code === '// Code snippet not available' || code === '// Fix not available') {
        logger.debug('FP-filter: removed stub code finding', { file: v.file, title: v.title });
        return false;
      }

      // 3. Reading from process.env or config.* is the CORRECT secure pattern — never CWE-798
      if (cwe === 'CWE-798') {
        const envRead = /process\.env\.|config\.\w+\.\w+/.test(code);
        const typeAnnotation = /^\s*(readonly\s+)?\w+[\?!]?\s*:\s*string/.test(code);
        const localhostOnly = /^['"`]https?:\/\/localhost/.test(code) || /^['"`]mongodb:\/\/localhost/.test(code);
        const publicUrl = /^['"`]https?:\/\/(api\.github|api\.groq|googleapis|generativelanguage)/.test(code);
        // Real secret pattern: actual key-like value (alphanumeric 20+ chars) in a string literal
        const hasRealSecret = /['"`][a-zA-Z0-9_\-]{20,}['"`]/.test(code) && !envRead;
        if (envRead || typeAnnotation || localhostOnly || publicUrl || !hasRealSecret) {
          logger.debug('FP-filter: removed false CWE-798 finding', { file: v.file, title: v.title, code: code.substring(0, 80) });
          return false;
        }
      }

      // 4. TypeScript interface/type fields are not real vulnerabilities (any CWE)
      if (/^\s*(readonly\s+)?\w+[\?!]?\s*:\s*(string|number|boolean|any|unknown)/.test(code)) {
        logger.debug('FP-filter: removed TS type annotation finding', { file: v.file, title: v.title });
        return false;
      }

      // 5. Scanner/penetration-test files flagged for their own detection patterns
      if ((file.includes('scanner') || file.includes('pentest') || file.includes('penetration')) &&
          (cwe === 'CWE-89' || cwe === 'CWE-79' || cwe === 'CWE-78')) {
        logger.debug('FP-filter: removed scanner detection code finding', { file: v.file, title: v.title });
        return false;
      }

      // 6. Developer scripts should be at most LOW severity
      if ((file.includes('/scripts/') || file.includes('\\scripts\\') || file.includes('/bin/')) &&
          (v.severity === 'critical' || v.severity === 'high')) {
        v.severity = 'low';
        logger.debug('FP-filter: downgraded severity for developer script', { file: v.file, title: v.title });
      }

      // 7. React JSX files cannot have XSS unless dangerouslySetInnerHTML is present
      if ((file.endsWith('.tsx') || file.endsWith('.jsx')) && cwe === 'CWE-79') {
        if (!code.includes('dangerouslySetInnerHTML') && !code.includes('innerHTML')) {
          logger.debug('FP-filter: removed JSX XSS false positive', { file: v.file, title: v.title });
          return false;
        }
      }

      // 8. Dependency import flags (component libraries, Axios, Mongoose, etc.)
      if ((cwe === 'CWE-1035' || cwe === 'CWE-1104' || cwe === 'CWE-1100') &&
          /^import\s/.test(code)) {
        logger.debug('FP-filter: removed dependency import flag', { file: v.file, title: v.title });
        return false;
      }

      return true;
    });
    // ── End false-positive filter ─────────────────────────────────────────────

    logger.info('AI analysis complete', { vulnerabilities: result.vulnerabilities.length });
    return result;
  }


  static async analyzeRepository(repoContent: Map<string, string>): Promise<AIAnalysisResult> {
    const files = Array.from(repoContent.entries()).map(([path, content]) => ({
      path,
      content,
    }));

    if (files.length === 0) {
      return { vulnerabilities: [] };
    }

    return this.analyzeCode(files);
  }

  /**
   * Get API rotation statistics
   */
  static getRotationStats() {
    return {
      groq: {
        totalKeys: this.groqRotator.keys.length,
        failedKeys: Array.from(this.groqRotator.failureCount.entries()).map(([key, count]) => ({
          key: key.substring(0, 20) + '...',
          failures: count,
        })),
        healthyKeys: this.groqRotator.keys.length - this.groqRotator.failureCount.size,
      },
      gemini: {
        totalKeys: this.geminiRotator.keys.length,
        failedKeys: Array.from(this.geminiRotator.failureCount.entries()).map(([key, count]) => ({
          key: key.substring(0, 20) + '...',
          failures: count,
        })),
        healthyKeys: this.geminiRotator.keys.length - this.geminiRotator.failureCount.size,
      },
    };
  }

  /**
   * Reset all failure counts (useful for manual recovery)
   */
  static resetFailureCounts() {
    this.groqRotator.failureCount.clear();
    this.groqRotator.lastUsed.clear();
    this.geminiRotator.failureCount.clear();
    this.geminiRotator.lastUsed.clear();
    logger.info('All API key failure counts reset');
  }
}
