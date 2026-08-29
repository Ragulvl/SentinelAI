/**
 * step1-run.ts — Phase 7 Step 1 harness (fixed)
 * Run from project root:
 *   npx tsx --env-file=backend/.env test-targets/step1-run.ts 2>&1 | Tee-Object -FilePath test-targets/logs/step1-log.txt
 *
 * Prerequisites: node test-targets/vuln-target.js (separate terminal, port 3001)
 */

import { PenetrationTestingService } from '../backend/src/services/penetrationTesting.service.js';
import type { PentestProgressEvent, PenetrationTestReport } from '../backend/src/services/pentest/types.js';
import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

const TARGET = 'http://localhost:3001';
const CREDS = { token: 'alice-session-token' };   // Case 1: direct bearer, no login request

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║  Phase 7 Step 1 — HTTP-only path, vuln-target:3001  ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log('Target:  ', TARGET);
console.log('Creds:    token=alice-session-token  (Case 1 — no login request)');
console.log('Vercel:  ', process.env['VERCEL_TOKEN'] ? 'SET (unexpected for Step 1!)' : 'unset ✓');
console.log('');

let phase7Started = false;

function onProgress(event: PentestProgressEvent) {
  if (event.type === 'phase') {
    if (event.phase === 7 && !phase7Started) {
      phase7Started = true;
      console.log('\n──── Phase 7 started ────');
    }
    console.log(`[P${event.phase}] ${event.message}`);
  } else if (event.type === 'test_result') {
    const r = (event as any).result;
    if (r?.vulnerable) {
      console.log(`[VULN] ${(r.severity as string).toUpperCase().padEnd(8)} ${r.testName}`);
    }
  }
}

async function main() {
  const t0 = Date.now();
  let report: PenetrationTestReport;

  try {
    report = await PenetrationTestingService.performPenetrationTest(TARGET, CREDS, onProgress);
  } catch (e: any) {
    console.error('\n[FATAL]', e.message);
    if (e.message?.includes('ECONNREFUSED')) {
      console.error('→ vuln-target.js not running. Start it: node test-targets/vuln-target.js');
    }
    process.exit(1);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('\n══════════════════════════════════════════════════════');
  console.log('SCAN COMPLETE — ' + elapsed + 's');
  console.log('══════════════════════════════════════════════════════');
  console.log('Tests:      ', report.testsPerformed);
  console.log('Vulns:      ', report.vulnerabilitiesFound);
  console.log('Risk score: ', report.riskScore);

  // Phase 7 — read scalar fields threaded from orchestrator
  const roundsRun    = (report as any).aiLoopRoundsRun as number | undefined;
  const exitReason   = (report as any).aiLoopExitReason as string | undefined;
  const synthesisText = report.aiLoopSynthesis;
  const aiFindings   = report.results.filter(r => r.testName.startsWith('[AI-Loop]'));

  console.log('\n──── Phase 7 AI Loop ────');
  if (roundsRun !== undefined) {
    console.log('Rounds:      ', roundsRun);
    console.log('Exit reason: ', exitReason);
    console.log('New findings:', aiFindings.length);
    if (synthesisText) {
      console.log('Synthesis:\n ', synthesisText.slice(0, 500));
    } else {
      console.log('Synthesis:   (none — API exhausted or planner failed)');
    }
    if (exitReason === 'error') {
      console.log('\n[NOTE] exitReason=error indicates the AI provider (Groq) was rate-limited or');
      console.log('       exhausted before the loop could complete normally. Rounds 1-' + roundsRun + ' are valid.');
      console.log('       Re-run with fresh API keys or after rate-limit window resets.');
    }
  } else {
    console.log('[WARN] aiLoopRoundsRun missing — Phase 7 may not have run or report shape changed');
    console.log('       Report keys:', Object.keys(report).join(', '));
  }

  // All vulnerable findings
  const vulns = report.results.filter(r => r.vulnerable);
  console.log('\n──── Vulnerable findings (' + vulns.length + ') ────');
  for (const v of vulns) {
    const tag = v.testName.startsWith('[AI-Loop]') ? '[AI] ' : '     ';
    console.log(' ' + tag + '[' + v.severity.toUpperCase() + '] ' + v.testName);
  }

  // Coverage check — two passes:
  // vulnText: only vulnerable:true findings (definitive confirmation)
  // allText:  all tested names ("tested but not found vulnerable" distinction)
  const vulnText = report.results
    .filter(r => r.vulnerable)
    .map(r => r.testName + ' ' + (r.evidence || '') + ' ' + (r.description || ''))
    .join(' ').toLowerCase();
  const allText = report.results
    .map(r => r.testName + ' ' + (r.evidence || '') + ' ' + (r.description || ''))
    .join(' ').toLowerCase();

  console.log('\n──── Expected coverage (V1-V10) ────');
  console.log('  ✓ = confirmed vulnerable  ~ = tested, not found  ✗ = not tested at all');
  const checks: [string, RegExp, RegExp][] = [
    ['V1  SQLi reflection',        /sql|inject/,                          /sql|inject/],
    ['V2  XSS reflection',         /xss|cross-site/,                      /xss|cross-site/],
    ['V3  IDOR',                   /idor|object.level.auth/,               /idor|object/],
    ['V4  BFLA',                   /bfla|function.level/,                  /bfla|broken func/],
    ['V5  Mass assignment',        /mass.assign/,                          /mass/],
    ['V6  Rate limiting',          /rate.limit|brute/,                     /rate/],
    ['V7  CORS wildcard',          /cors/,                                 /cors/],
    ['V8  Missing sec headers',    /csp|x-frame|clickjack|missing.header/, /header|csp|frame/],
    ['V9  Stack trace leak',       /stack.trace|error.stack|traceback/,    /stack|crash|500/],
    ['V10 Secret\/API key',        /api_key|secret|password.*leak/,        /secret|api.key|credential/],
  ];
  for (const [label, vulnPat, testedPat] of checks) {
    const confirmed = vulnPat.test(vulnText);
    const tested    = testedPat.test(allText);
    const mark = confirmed ? '✓' : (tested ? '~' : '✗');
    console.log('  ' + mark + ' ' + label);
  }

  // Save full report
  const reportPath = path.join(LOG_DIR, 'step1-report-' + Date.now() + '.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('\nReport saved: ' + reportPath);
}

main();
