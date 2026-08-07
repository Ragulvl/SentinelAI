import axios from 'axios';
import { config } from '../config/env.js';

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
      console.warn('⚠️ All API keys have failed, resetting failure counts');
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
    console.warn(`⚠️ API key failed (${currentFailures + 1} times): ${key.substring(0, 20)}...`);
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

    console.log(`🔍 AI Service initialized with ${this.groqRotator.keys.length} Groq keys and ${this.geminiRotator.keys.length} Gemini keys`);

    // Try all providers with rotation
    for (const provider of providers) {
      if (provider.rotator.keys.length === 0) {
        console.warn(`⚠️ No ${provider.name} API keys configured`);
        errors.push(`No ${provider.name} API keys configured`);
        continue;
      }

      console.log(`� Trying ${provider.name} API with ${provider.rotator.keys.length} keys...`);
      
      // Try all available keys for this provider
      const maxAttempts = provider.rotator.keys.length * 2; // Allow retries
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const apiKey = this.getNextKey(provider.rotator);
        if (!apiKey) {
          console.error(`❌ No ${provider.name} API key available`);
          break;
        }

        try {
          console.log(`🔄 ${provider.name} attempt ${attempt + 1} with key: ${apiKey.substring(0, 20)}...`);
          const result = await provider.method(files, apiKey);
          console.log(`✅ ${provider.name} API succeeded!`);
          this.markKeyAsSuccess(provider.rotator, apiKey);
          return result;
        } catch (error: any) {
          const errorMsg = `${provider.name} attempt ${attempt + 1} failed: ${error.message}`;
          console.error(`❌ ${errorMsg}`);
          if (error.response?.data) {
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
          }
          errors.push(errorMsg);
          this.markKeyAsFailed(provider.rotator, apiKey);
          
          // If it's a rate limit error, try next key immediately
          if (error.response?.status === 429) {
            console.log('⏭️ Rate limit hit, trying next key...');
            continue;
          }
          
          // For other errors, add a small delay before retry
          await this.sleep(1000);
        }
      }
    }

    const finalError = `All AI providers failed after rotation:\n${errors.join('\n')}`;
    console.error(`💥 ${finalError}`);
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

      // Use gemini-3-flash-preview (Gemini 3 Flash) - latest and fastest
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
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
        console.error('Gemini response structure:', JSON.stringify(response.data, null, 2));
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
        console.error('Groq response structure:', JSON.stringify(response.data, null, 2));
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
    return `You are a senior application security engineer performing a precise code security audit.
Your job is to find REAL, EXPLOITABLE vulnerabilities - not theoretical or pattern-matched noise.

Return ONLY a valid JSON object with this exact structure:
{
  "vulnerabilities": [
    {
      "title": "Brief vulnerability title",
      "severity": "critical|high|medium|low",
      "file": "path/to/file.ext",
      "line": 123,
      "description": "Detailed description of the vulnerability and its impact",
      "cweId": "CWE-XXX",
      "originalCode": "vulnerable code snippet",
      "patchedCode": "fixed code snippet"
    }
  ]
}

STRICT FALSE POSITIVE RULES - NEVER FLAG THESE:

1. DETECTION CODE IS NOT A VULNERABILITY
   Files named *Scanner*, *scanner*, *penetrationTesting*, *pentest* contain code that
   SEARCHES FOR security issues in OTHER code. This is intentional.
   Do NOT flag: pattern matching for eval(), sql keywords, CSRF checks, XSS payloads,
   injection strings inside these files. They are the tool doing its job.
   Example FALSE POSITIVE: flagging "if (content.includes('eval('))" as insecure eval usage.
   Example FALSE POSITIVE: flagging "payload = '" OR 1=1'" in a pen test service as SQL injection.

2. TYPESCRIPT TYPE ANNOTATIONS ARE NOT HARDCODED SECRETS
   Interface/type fields like "githubAccessToken: string" are TYPE DEFINITIONS, not values.
   NEVER flag TypeScript interface field definitions as CWE-798 hardcoded secrets.
   Only flag actual string literals: const token = "ghp_abc123realvalue".

3. IMPORT STATEMENTS ARE NOT VULNERABILITIES
   "import axios from 'axios'", "import mongoose from 'mongoose'", "import { X } from 'lucide-react'"
   are NOT security vulnerabilities. Version pinning is in package.json, not import syntax.
   NEVER flag import statements as CWE-1035, CWE-1104, or CWE-1100.

4. READING FROM process.env IS THE CORRECT SECURE PATTERN
   process.env.GITHUB_CLIENT_SECRET, process.env.JWT_SECRET, process.env.TWILIO_ACCOUNT_SID
   are reading from environment variables - this IS the secure approach.
   NEVER flag "process.env.X" as a hardcoded secret (CWE-798).
   Only flag actual hardcoded string literals like: const secret = "sk-real-api-key-here".

5. REACT JSX IS AUTOMATICALLY XSS-SAFE
   React components auto-escape all JSX output. useState, JSX interpolation {variable},
   and React event handlers are NOT XSS vectors. NEVER flag them as CWE-79.
   Only flag XSS if dangerouslySetInnerHTML={{ __html: userInput }} is used without sanitization.

6. DEVELOPER SCRIPTS ARE LOW-RISK CONTEXT
   Files in scripts/ or bin/ directories are developer-only local tools, never exposed to users.
   Reading process.argv for tokens in a developer script is acceptable.
   Apply at most LOW severity to developer scripts.

7. LOCALHOST/DEV FALLBACKS ARE ACCEPTABLE
   "process.env.MONGO_URI || 'mongodb://localhost:27017/myapp'" is standard dev fallback.
   NEVER flag the localhost fallback string as a hardcoded secret (CWE-798).

8. INTENTIONAL SECURITY TEST PAYLOADS ARE NOT VULNERABILITIES
   In penetration testing services, { username: 'admin', password: 'admin' } arrays are
   ATTACK PAYLOADS sent TO OTHER SYSTEMS to test them - not this app's own credentials.
   NEVER flag pen test payload arrays as CWE-798 or CWE-287.

9. STANDARD JWT BEARER AUTH IS NOT INSECURE
   req.headers.authorization?.replace('Bearer ', '') and JWTService.verifyToken() is
   the industry-standard JWT pattern. NEVER flag it as CWE-287 or CWE-352.
   Do not suggest using cookies instead - that introduces CSRF risk for APIs.

10. PUBLIC API URLS AND DNS SERVERS ARE NOT SECRETS
    'https://api.github.com', 'https://api.groq.com', '8.8.8.8' (Google DNS) are
    public endpoints. NEVER flag them as CWE-798 or CWE-615.

REAL VULNERABILITIES TO FIND:
- SQL/NoSQL injection in actual database queries with unsanitized user input
- XSS via dangerouslySetInnerHTML or direct DOM innerHTML with user data
- Authentication bypass or missing authorization checks on API routes
- Actual hardcoded secrets: real API keys/passwords/private keys as string literals
- Path traversal in file reads using unsanitized user-provided file paths
- Command injection in child_process calls using unsanitized user input
- Sensitive tokens/passwords exposed in URLs, query params, or client-visible logs
- Missing input validation on public HTTP endpoints that directly reach the database
- Missing ownership checks (user A can read/modify user B's data)
- Insecure crypto: MD5/SHA1 for passwords, static IVs, weak algorithms

Only report a vulnerability if you can clearly describe the exploit path from user input to impact.
If you cannot describe how an attacker would exploit it, DO NOT include it.`;
  }

  private static buildAnalysisPrompt(files: Array<{ path: string; content: string }>): string {
    // Classify each file to give the AI context about its purpose
    const classifyFile = (filePath: string): string => {
      const p = filePath.toLowerCase();
      if (p.includes('scanner') || p.includes('scraper')) return '[SECURITY SCANNER FILE - detection patterns are intentional, not vulnerabilities]';
      if (p.includes('penetration') || p.includes('pentest')) return '[PENETRATION TESTER - attack payloads are test data sent to other systems]';
      if (p.includes('scripts/') || p.includes('/bin/') || p.includes('\\scripts\\')) return '[DEVELOPER SCRIPT - local tool only, not a production endpoint, lower risk context]';
      if (p.endsWith('.tsx') || p.endsWith('.jsx')) return '[REACT COMPONENT - JSX auto-escapes all output, XSS only via dangerouslySetInnerHTML]';
      if (p.includes('model')) return '[DATABASE MODEL - Mongoose ODM layer]';
      if (p.includes('middleware')) return '[EXPRESS MIDDLEWARE]';
      if (p.includes('controller')) return '[API CONTROLLER]';
      if (p.includes('service')) return '[SERVICE LAYER]';
      if (p.includes('route')) return '[API ROUTE DEFINITION]';
      if (p.includes('config')) return '[CONFIGURATION FILE]';
      return '[SOURCE FILE]';
    };

    let prompt = 'Analyze the following code files for REAL, EXPLOITABLE security vulnerabilities.\n';
    prompt += 'Apply the 10 false positive rules from your system instructions before flagging anything.\n\n';

    for (const file of files) {
      const label = classifyFile(file.path);
      prompt += `=== FILE: ${file.path} ${label} ===\n`;
      prompt += file.content;
      prompt += '\n\n';
    }

    prompt += '\nReturn only confirmed, exploitable vulnerabilities in the specified JSON format.';
    return prompt;
  }

  private static parseAIResponse(content: string): AIAnalysisResult {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('AI response:', content);
      throw new Error('Invalid JSON response from AI');
    }

    const result = JSON.parse(jsonMatch[0]);
    
    // Validate and clean the result
    if (!result.vulnerabilities || !Array.isArray(result.vulnerabilities)) {
      console.warn('Invalid vulnerabilities array from AI');
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
    console.log('✅ All API key failure counts reset');
  }
}
