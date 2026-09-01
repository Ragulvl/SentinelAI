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

/** One HTTP request/response pair collected during penetration testing, sent to the LLM for analysis. */
export interface PentestProbe {
  targetUrl: string;
  method: 'GET' | 'POST';
  source: string;              // e.g. 'form field "email"', 'URL param "id"', 'API endpoint'
  parameter?: string;          // the specific parameter injected
  payload?: string;            // the payload that was injected
  baselineStatus?: number;
  baselineBodyLen?: number;
  baselineTimeMs?: number;
  responseStatus: number;
  responseTimeMs: number;
  responseHeaders: Record<string, string>;
  responseBodySnippet: string; // first 1500 chars of response body
}

/** A finding returned by the LLM pentest analysis. */
export interface PentestLLMFinding {
  testName: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  vulnerable: boolean;
  description: string;
  evidence?: string;
  recommendation: string;
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

    logger.info('AI analysis started', {
      groqKeys: this.groqRotator.keys.length,
      geminiKeys: this.geminiRotator.keys.length,
      files: files.length,
    });

    // ── 1. Groq first (5 keys, free, fast, working) ──────────────────────
    const providers = [
      { name: 'Groq',   rotator: this.groqRotator,   method: this.analyzeWithGroq.bind(this) },
      { name: 'Gemini', rotator: this.geminiRotator, method: this.analyzeWithGemini.bind(this) },
    ];

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

      // Groq model: llama-3.3-70b-versatile was deprecated June 2026.
      // Replacement: openai/gpt-oss-120b (Groq's recommended production model).
      const GROQ_MODEL = 'openai/gpt-oss-120b';

      const response = await axios.post(
        `${config.groq.apiUrl}/chat/completions`,
        {
          model: GROQ_MODEL,
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
    return `You are a senior application security engineer (OWASP Top 10, CWE/SANS Top 25, CVSS v3) performing a precise, production-grade code security audit.
Your job is to find REAL, EXPLOITABLE vulnerabilities with concrete attack paths — not theoretical noise.

Return ONLY a valid JSON object with this exact schema:
{
  "vulnerabilities": [
    {
      "title": "Concise vulnerability title (max 60 chars)",
      "severity": "critical|high|medium|low",
      "cvssScore": 9.1,
      "file": "path/to/file.ext",
      "line": 123,
      "lineEnd": 128,
      "description": "3-sentence minimum. Sentence 1: what the vulnerability is. Sentence 2: exactly how an attacker exploits it step-by-step. Sentence 3: the concrete business/data impact.",
      "exploitExample": "Exact HTTP request, curl command, or code snippet an attacker would use to trigger this vulnerability",
      "cweId": "CWE-XXX",
      "remediationPriority": 3,
      "originalCode": "exact vulnerable code snippet (verbatim, do not paraphrase)",
      "patchedCode": "exact fixed replacement (same structure, secured)"
    }
  ]
}

DESCRIPTION QUALITY STANDARD (MANDATORY — 3 sentences minimum):
Sentence 1 — Root cause: "The [component] passes [what] to [where] without [missing control]."
Sentence 2 — Attack path: "An attacker can exploit this by [exact steps with example values]."
Sentence 3 — Impact: "This results in [specific data loss / account takeover / RCE / etc.]."

BAD (reject): "SQL injection vulnerability in login endpoint."
GOOD: "The login route passes req.body.username directly into a MongoDB findOne() query without type-checking, allowing object injection. An attacker can send { '$gt': '' } as the username to bypass authentication and log in as the first user in the database. This results in full account takeover without knowing any valid credentials."

CVSS v3 SCORING GUIDE:
- critical: 9.0–10.0 (RCE, auth bypass, full data breach)
- high: 7.0–8.9 (IDOR, privilege escalation, SQLi/NoSQLi with auth)
- medium: 4.0–6.9 (XSS, open redirect, info disclosure, missing rate limit)
- low: 0.1–3.9 (verbose errors, weak cipher suggestion, non-sensitive info leak)

REMEDIATION PRIORITY (1 = fix immediately, 5 = fix when convenient):
1 = Critical + easily exploitable with no auth (RCE, auth bypass, hardcoded secret)
2 = High severity, auth required or moderate complexity
3 = Medium severity or High with strong mitigations in place
4 = Low severity, limited exposure
5 = Informational / best practice gap

EXPLOIT EXAMPLE REQUIREMENTS:
- Must be a concrete, runnable artifact: HTTP request, curl command, or code snippet
- Must include example values (not placeholders like <VALUE>)
- Example: curl -X POST https://target.com/api/login -d '{"username":{"$gt":""},"password":{"$gt":""}}'

HARDCODED SECRET PATTERNS TO DETECT:
Flag as CWE-798 if ANY of these patterns appear as literal string values (not process.env):
- GitHub tokens: /ghp_[A-Za-z0-9]{36}/ or /github_pat_[A-Za-z0-9_]{82}/
- OpenAI keys: /sk-[A-Za-z0-9]{48}/
- Google/Gemini: /AIza[A-Za-z0-9_-]{35}/
- AWS keys: /AKIA[A-Z0-9]{16}/
- Stripe: /sk_live_[A-Za-z0-9]{24}/
- Generic: any alphanumeric string 32+ chars assigned to a variable named *key*, *secret*, *token*, *password*, *credential*
DO NOT flag: process.env.X, environment variable reads, type annotations like "accessToken: string"

STRICT FALSE POSITIVE RULES — NEVER FLAG THESE:

1. DETECTION CODE IS NOT A VULNERABILITY
   Scanner/pentest files intentionally contain attack patterns. NEVER flag them.
   FALSE POSITIVE: "if (content.includes('eval('))" in scanner.ts
   FALSE POSITIVE: "payload = \"' OR 1=1--\"" in penetrationTesting.service.ts

2. TYPESCRIPT TYPE ANNOTATIONS ARE NOT SECRETS
   "githubAccessToken: string" is a TYPE. Only flag: const token = "ghp_realkey123".

3. IMPORT STATEMENTS ARE NEVER VULNERABILITIES

4. process.env.X IS THE CORRECT SECURE PATTERN
   NEVER flag environment variable reads as CWE-798. Only flag literal secrets.

5. REACT JSX IS AUTO-XSS-SAFE
   Only flag XSS if dangerouslySetInnerHTML={{ __html: userInput }} without sanitization.

6. DEVELOPER SCRIPTS: max LOW severity (files in scripts/ or bin/)

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
  - req.params.id used in DB query without verifying it belongs to req.user (IDOR)
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
- Missing authorization: endpoint fetches resource by ID without checking ownership (IDOR)
- Actual hardcoded secrets as string literals matching the regex patterns above
- Path traversal in file reads with user-controlled paths
- Command injection in child_process with user input
- Sensitive data (tokens, passwords) in logs, URLs, or error responses
- Missing input validation on public endpoints that directly query the database
- Insecure crypto: MD5/SHA1 for passwords, static IVs, predictable random
- Prototype pollution via Object.assign or merge with user-controlled keys

Only report a vulnerability if you can write a COMPLETE, RUNNABLE exploit example.
If you cannot write the exact exploit, DO NOT include the finding.`;
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

  // ──────────────────────────────────────────────────────────────────────────
  // PENETRATION TEST LLM ANALYSIS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Probe type passed to the LLM for analysis.
   * Each probe represents one HTTP request/response pair from the pentest engine.
   */
  static async analyzePentestWithLLM(probes: PentestProbe[]): Promise<PentestLLMFinding[]> {
    if (probes.length === 0) return [];

    const prompt = this.buildPentestPrompt(probes);
    const systemPrompt = this.getPentestSystemPrompt();

    const errors: string[] = [];

    // ── 1. Groq first (5 free keys, fast, working NOW) ────────────────────
    // ── 2. Gemini fallback ────────────────────────────────────────────────
    const providers = [
      { name: 'Groq',   rotator: this.groqRotator,   call: (key: string) => this.callGroqRaw(systemPrompt, prompt, key) },
      { name: 'Gemini', rotator: this.geminiRotator, call: (key: string) => this.callGeminiRaw(systemPrompt, prompt, key) },
    ];

    for (const provider of providers) {
      if (provider.rotator.keys.length === 0) { errors.push(`No ${provider.name} keys`); continue; }
      const maxAttempts = Math.min(provider.rotator.keys.length * 2, 4);
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const apiKey = this.getNextKey(provider.rotator);
        if (!apiKey) break;
        try {
          logger.info('Pentest LLM analysis', { provider: provider.name, attempt: attempt + 1, probes: probes.length });
          const raw = await provider.call(apiKey);
          this.markKeyAsSuccess(provider.rotator, apiKey);
          return this.parsePentestLLMResponse(raw);
        } catch (err: any) {
          errors.push(`${provider.name} attempt ${attempt + 1}: ${err.message}`);
          this.markKeyAsFailed(provider.rotator, apiKey);
          if (err.response?.status === 429) continue;
          await this.sleep(1000);
        }
      }
    }

    // If LLM fails, return empty — the condition-based results are still preserved
    logger.warn('Pentest LLM analysis failed — condition-based results will be used alone', { errors });
    return [];
  }


  private static getPentestSystemPrompt(): string {
    return `You are a senior web application penetration tester with deep expertise in OWASP Top 10, WASC, and CVE research.
You are given a series of HTTP probe results from an automated security scanner.
Each probe shows: the URL tested, the HTTP method, the payload injected, the response status code, response headers, and a snippet of the response body.

Your task is to identify REAL vulnerabilities from the evidence provided. 
Be a real security researcher — look for subtle signs that conditions would miss:
- Unusual error messages that hint at backend tech or query structure
- Partial data leakage (fields, IDs, usernames in error responses)
- Inconsistent response sizes or status codes between baseline and payload
- Headers that reveal version information or internal infrastructure
- Redirect targets that suggest open redirect
- Response body differences that suggest Boolean-based blind injection
- Cookie attributes that are missing on sensitive cookies
- CORS/CSP headers that are too permissive
- Any information disclosure, even indirect

Return ONLY a valid JSON array. If no issues found, return [].
Format:
[
  {
    "testName": "short name of what was found",
    "category": "Injection | XSS | Auth | CSRF | CORS | Info Disclosure | Access Control | Misconfiguration | other",
    "severity": "critical | high | medium | low | info",
    "vulnerable": true,
    "description": "Precise description: what was found, which probe triggered it, and exactly how an attacker would exploit it.",
    "evidence": "The exact response snippet or header value that proves the finding",
    "recommendation": "Specific remediation step"
  }
]

STRICT RULES:
- Only return findings where you can point to SPECIFIC evidence from the probe data.
- Do NOT guess. If the response doesn't clearly indicate a vulnerability, return [].
- Do NOT return info-severity duplicates of condition-based findings (missing headers, no CSRF token) — those are already caught.
- Focus on things conditions CANNOT catch: subtle leakage, indirect evidence, nuanced response analysis.
- Maximum 10 findings.`;
  }

  private static buildPentestPrompt(probes: PentestProbe[]): string {
    let prompt = `Analyze the following ${probes.length} HTTP probe result(s) from a penetration test against: ${probes[0]?.targetUrl || 'unknown target'}\n\n`;
    prompt += `Attack surface discovered:\n`;
    prompt += `- ${probes.filter(p => p.source.startsWith('form')).length} form field(s) tested\n`;
    prompt += `- ${probes.filter(p => p.source.startsWith('URL')).length} URL parameter(s) tested\n`;
    prompt += `- ${probes.filter(p => p.source.startsWith('API')).length} API endpoint(s) tested\n\n`;

    probes.forEach((probe, i) => {
      prompt += `=== PROBE ${i + 1} ===\n`;
      prompt += `Target URL: ${probe.targetUrl}\n`;
      prompt += `Method: ${probe.method}\n`;
      prompt += `Source: ${probe.source}\n`;
      if (probe.parameter) prompt += `Injected Parameter: ${probe.parameter}\n`;
      if (probe.payload) prompt += `Payload: ${probe.payload}\n`;
      prompt += `Baseline Status: ${probe.baselineStatus ?? 'N/A'} | Baseline Body Length: ${probe.baselineBodyLen ?? 'N/A'}\n`;
      prompt += `Response Status: ${probe.responseStatus}\n`;
      prompt += `Response Time: ${probe.responseTimeMs}ms${probe.baselineTimeMs ? ` (baseline: ${probe.baselineTimeMs}ms, delta: ${probe.responseTimeMs - probe.baselineTimeMs}ms)` : ''}\n`;
      if (probe.responseHeaders && Object.keys(probe.responseHeaders).length > 0) {
        const interestingHeaders = ['server', 'x-powered-by', 'content-type', 'set-cookie', 'access-control-allow-origin',
          'x-frame-options', 'content-security-policy', 'location', 'www-authenticate', 'x-aspnet-version'];
        const filtered = Object.entries(probe.responseHeaders)
          .filter(([k]) => interestingHeaders.includes(k.toLowerCase()))
          .map(([k, v]) => `  ${k}: ${String(v).substring(0, 200)}`).join('\n');
        if (filtered) prompt += `Interesting Headers:\n${filtered}\n`;
      }
      if (probe.responseBodySnippet) {
        // Trim to 800 chars to stay within token budget across many probes
        prompt += `Response Body (first 800 chars):\n${probe.responseBodySnippet.substring(0, 800)}\n`;
      }
      prompt += '\n';
    });

    prompt += `\nNow identify any real vulnerabilities from the evidence above. Return only a JSON array of findings, or [] if nothing found.`;
    return prompt;
  }

  private static async callGeminiRaw(system: string, prompt: string, apiKey: string): Promise<string> {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: `${system}\n\n${prompt}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4000 },
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
    );
    const content = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('Empty Gemini response');
    return content;
  }

  private static async callGroqRaw(system: string, prompt: string, apiKey: string): Promise<string> {
    const response = await axios.post(
      `${config.groq.apiUrl}/chat/completions`,
      {
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      },
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 60000,
      }
    );
    const content = response.data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty Groq response');
    return content;
  }

  private static parsePentestLLMResponse(raw: string): PentestLLMFinding[] {
    // Strip markdown code fences
    let cleaned = raw.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();

    // Handle both array and object wrapping (some models wrap in {"findings": [...]})
    const arrStart = cleaned.indexOf('[');
    const objStart = cleaned.indexOf('{');

    let jsonStr: string | null = null;

    if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) {
      // Starts with array
      let depth = 0; let endIdx = -1;
      for (let i = arrStart; i < cleaned.length; i++) {
        if (cleaned[i] === '[') depth++;
        else if (cleaned[i] === ']') { depth--; if (depth === 0) { endIdx = i; break; } }
      }
      if (endIdx !== -1) jsonStr = cleaned.slice(arrStart, endIdx + 1);
    } else if (objStart !== -1) {
      // Wrapped in object — extract the array from it
      let depth = 0; let endIdx = -1;
      for (let i = objStart; i < cleaned.length; i++) {
        if (cleaned[i] === '{') depth++;
        else if (cleaned[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
      }
      if (endIdx !== -1) {
        try {
          const obj = JSON.parse(cleaned.slice(objStart, endIdx + 1));
          const arr = obj.findings || obj.vulnerabilities || obj.results || obj;
          return Array.isArray(arr) ? arr.filter(this.isValidLLMFinding) : [];
        } catch { return []; }
      }
    }

    if (!jsonStr) return [];

    try {
      const arr = JSON.parse(jsonStr);
      return Array.isArray(arr) ? arr.filter(this.isValidLLMFinding) : [];
    } catch {
      return [];
    }
  }

  private static isValidLLMFinding(f: any): boolean {
    return (
      f && typeof f === 'object' &&
      typeof f.testName === 'string' && f.testName.length > 0 &&
      typeof f.description === 'string' && f.description.length > 0 &&
      ['critical', 'high', 'medium', 'low', 'info'].includes(f.severity)
    );
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

  // ── AI-POWERED PENTEST EXTENSIONS ──────────────────────────────────────────

  /**
   * Phase: JS Bundle Analyzer + Endpoint Discoverer
   * Downloads JS bundles, sends to AI to find hardcoded secrets, API keys,
   * internal endpoints, and hidden routes.
   */
  static async analyzeJSBundles(bundles: Array<{ url: string; content: string }>): Promise<{
    secrets: string[];
    endpoints: string[];
    findings: PentestLLMFinding[];
  }> {
    if (bundles.length === 0) return { secrets: [], endpoints: [], findings: [] };

    const system = `You are a security researcher specializing in JavaScript analysis and secret detection.
You will be given minified/bundled JavaScript code from a web application.

Your tasks:
1. Find HARDCODED SECRETS: API keys, tokens, passwords, private keys, AWS/GCP/Azure credentials, Stripe keys, Twilio SIDs, database URIs, JWT secrets
2. Find INTERNAL ENDPOINTS: API routes, admin paths, debug endpoints, internal URLs not exposed in the UI
3. Identify SECURITY MISCONFIGURATIONS: disabled SSL verification, insecure settings, debug flags left on

Return ONLY valid JSON in this exact format:
{
  "secrets": ["description of secret found: partial value or type"],
  "endpoints": ["/api/internal/path", "/admin/debug"],
  "findings": [
    {
      "testName": "Hardcoded AWS Key",
      "category": "Secret Exposure",
      "severity": "critical",
      "vulnerable": true,
      "description": "AWS access key hardcoded in bundle",
      "evidence": "AKIA... found at offset ~12500",
      "recommendation": "Remove from code. Rotate immediately. Use environment variables."
    }
  ]
}

RULES:
- Only report what you can CLEARLY see in the code
- For secrets, show first 6 chars + "..." to prove it's real without exposing full value
- Endpoints must be real paths starting with / or http
- Maximum 5 secrets, 10 endpoints, 5 findings`;

    // Concatenate bundle content (cap at 15k chars per bundle to fit token limits)
    let prompt = `Analyze the following JavaScript bundle(s) from the target web application:\n\n`;
    for (const b of bundles.slice(0, 3)) {
      const snippet = b.content.substring(0, 15000);
      prompt += `=== BUNDLE: ${b.url} ===\n${snippet}\n\n`;
    }
    prompt += `\nReturn the JSON analysis now.`;

    try {
      const raw = await this.callWithFallback(system, prompt);
      const parsed = this.parseJsonResponse<{ secrets: string[]; endpoints: string[]; findings: PentestLLMFinding[] }>(raw);
      return {
        secrets: Array.isArray(parsed?.secrets) ? parsed.secrets : [],
        endpoints: Array.isArray(parsed?.endpoints) ? parsed.endpoints : [],
        findings: Array.isArray(parsed?.findings) ? parsed.findings.filter(this.isValidLLMFinding) : [],
      };
    } catch (err: any) {
      logger.warn('JS bundle analysis failed', { error: err.message });
      return { secrets: [], endpoints: [], findings: [] };
    }
  }

  /**
   * Phase: Vulnerability Chainer
   * Takes all findings and asks AI to identify multi-step attack chains.
   */
  static async chainVulnerabilities(findings: PentestLLMFinding[], targetUrl: string): Promise<Array<{
    title: string;
    severity: 'critical' | 'high' | 'medium';
    steps: string[];
    impact: string;
  }>> {
    const vulnFindings = findings.filter(f => f.vulnerable && f.severity !== 'info');
    if (vulnFindings.length < 2) return [];

    const system = `You are an expert penetration tester who specializes in chaining vulnerabilities.
Given a list of security findings, identify realistic multi-step attack chains where combining 2+ vulnerabilities 
creates a more severe impact than each finding alone.

Return ONLY valid JSON array:
[
  {
    "title": "Account Takeover via CSRF + Weak Session",
    "severity": "critical",
    "steps": [
      "1. Exploit missing CSRF token to force password change request",
      "2. Session doesn't rotate after password change (session fixation)",
      "3. Attacker's old session cookie still valid — full account access"
    ],
    "impact": "Complete account takeover without user interaction"
  }
]

RULES:
- Only create chains that are REALISTIC given the specific evidence
- Each step must reference actual findings provided
- Maximum 3 chains
- If no realistic chains exist, return []`;

    const findingsSummary = vulnFindings.map((f, i) =>
      `${i + 1}. [${f.severity.toUpperCase()}] ${f.testName}: ${f.description}${f.evidence ? ` | Evidence: ${f.evidence}` : ''}`
    ).join('\n');

    const prompt = `Target: ${targetUrl}\n\nFindings:\n${findingsSummary}\n\nIdentify attack chains from these findings.`;

    try {
      const raw = await this.callWithFallback(system, prompt);
      const chains = this.parseArrayResponse(raw);
      return chains.filter((c: any) =>
        c && typeof c.title === 'string' && Array.isArray(c.steps) &&
        ['critical', 'high', 'medium'].includes(c.severity)
      );
    } catch (err: any) {
      logger.warn('Vulnerability chaining failed', { error: err.message });
      return [];
    }
  }

  /**
   * Phase: AI Fix Generator
   * For each vulnerable finding, generates specific patched code in the target's tech stack.
   */
  static async generateFixes(
    findings: PentestLLMFinding[],
    techStack: string,
    pageHtml: string
  ): Promise<Record<string, string>> {
    const vulns = findings.filter(f => f.vulnerable && ['critical', 'high', 'medium'].includes(f.severity));
    if (vulns.length === 0) return {};

    const system = `You are a senior security engineer. For each vulnerability, provide a SPECIFIC code fix.
The fix must be:
- Written in the detected tech stack (${techStack || 'Node.js/Express or generic'})
- Copy-paste ready (not pseudocode)
- Minimal — only the relevant changed lines
- Clearly commented

Return ONLY valid JSON object where keys are vulnerability names and values are code fix strings:
{
  "vulnerability name": "// Fixed code example\\napp.use(rateLimit({ windowMs: 60000, max: 5 }));",
  ...
}`;

    const vulnList = vulns.slice(0, 6).map(v =>
      `"${v.testName}": ${v.description}. Recommendation: ${v.recommendation}`
    ).join('\n');

    const htmlHint = pageHtml.substring(0, 500);
    const prompt = `Tech stack hint from HTML: ${htmlHint}\n\nVulnerabilities to fix:\n${vulnList}\n\nGenerate specific code fixes for each.`;

    try {
      const raw = await this.callWithFallback(system, prompt);
      const parsed = this.parseJsonResponse<Record<string, string>>(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
      return {};
    } catch (err: any) {
      logger.warn('Fix generation failed', { error: err.message });
      return {};
    }
  }

  /**
   * AI Payload Generator — generates context-aware attack payloads for a given test type
   * based on the actual HTML/response from the target.
   */
  static async generateAttackPayloads(
    htmlContext: string,
    testType: 'xss' | 'sqli' | 'ssrf' | 'ssti',
    endpoint: string
  ): Promise<string[]> {
    const system = `You are an offensive security researcher generating targeted attack payloads.
Based on the actual HTML/response context provided, generate 8 highly targeted payloads for ${testType.toUpperCase()} testing.

Rules:
- Payloads must be context-aware (e.g., if inside attribute, use attr breakout)
- Include at least 2 blind/out-of-band variants  
- Return ONLY a JSON array of strings: ["payload1", "payload2", ...]
- No explanations, just the array`;

    const prompt = `Endpoint: ${endpoint}\nHTML Context (500 chars):\n${htmlContext.substring(0, 500)}\n\nGenerate ${testType.toUpperCase()} payloads:`;

    try {
      const raw = await this.callWithFallback(system, prompt);
      const arr = this.parseArrayResponse(raw);
      return arr.filter((p: any) => typeof p === 'string').slice(0, 10);
    } catch {
      return [];
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** Returns true when every key across every provider has been rate-limited this session. */
  static isRateLimited(): boolean {
    const allExhausted = (rotator: APIKeyRotator) =>
      rotator.keys.length > 0 &&
      rotator.keys.every(k => (rotator.failureCount.get(k) ?? 0) >= this.MAX_FAILURES_BEFORE_SKIP);
    return allExhausted(this.groqRotator) && allExhausted(this.geminiRotator);
  }

  private static async callWithFallback(system: string, prompt: string): Promise<string> {
    const providers = [
      { name: 'Groq',   rotator: this.groqRotator,   call: (key: string) => this.callGroqRaw(system, prompt, key) },
      { name: 'Gemini', rotator: this.geminiRotator, call: (key: string) => this.callGeminiRaw(system, prompt, key) },
    ];

    const tryProviders = async (): Promise<string | null> => {
      for (const provider of providers) {
        if (provider.rotator.keys.length === 0) continue;
        const maxAttempts = Math.min(provider.rotator.keys.length * 2, 3);
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const apiKey = this.getNextKey(provider.rotator);
          if (!apiKey) break;
          try {
            const raw = await provider.call(apiKey);
            this.markKeyAsSuccess(provider.rotator, apiKey);
            return raw;
          } catch (err: any) {
            this.markKeyAsFailed(provider.rotator, apiKey);
            if (err.response?.status !== 429) await this.sleep(500);
          }
        }
      }
      return null;
    };

    const result = await tryProviders();
    if (result !== null) return result;

    // All attempts failed — if they were rate-limit (429) errors, wait 5s and retry once.
    // This handles the common case where phases 3-6 burn the per-minute quota and phase 7
    // arrives just as the rate-limit window resets.
    logger.warn('[AI] All providers failed on first pass — waiting 5s for rate-limit reset...');
    await this.sleep(5000);
    const retry = await tryProviders();
    if (retry !== null) return retry;

    throw new Error('All AI providers failed');
  }

  private static parseJsonResponse<T>(raw: string): T | null {
    let cleaned = raw.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();
    const objStart = cleaned.indexOf('{');
    const arrStart = cleaned.indexOf('[');
    const start = (objStart === -1) ? arrStart : (arrStart === -1) ? objStart : Math.min(objStart, arrStart);
    if (start === -1) return null;
    const isArr = cleaned[start] === '[';
    const open = isArr ? '[' : '{';
    const close = isArr ? ']' : '}';
    let depth = 0, end = -1;
    for (let i = start; i < cleaned.length; i++) {
      if (cleaned[i] === open) depth++;
      else if (cleaned[i] === close) { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) return null;
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
  }

  private static parseArrayResponse(raw: string): any[] {
    const result = this.parseJsonResponse<any[]>(raw);
    if (Array.isArray(result)) return result;
    if (result && typeof result === 'object') {
      const arr = (result as any).findings || (result as any).chains || (result as any).payloads || (result as any).results;
      if (Array.isArray(arr)) return arr;
    }
    return [];
  }
}
