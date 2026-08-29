/**
 * planner-probe.ts — Cheap Planner gate check before Step 4.
 * Confirms: (1) Groq keys are live, (2) Planner returns [] against empty surface,
 * (3) exitReason is early_exit_no_new_findings, not error.
 *
 * Run: npx tsx --env-file=backend/.env test-targets/planner-probe.ts
 */

import { runAITestLoop } from '../backend/src/services/pentest/ai-loop.js';
import type { AttackSurface, ScanContext } from '../backend/src/services/pentest/types.js';

const emptySurface: AttackSurface = { pages: [], forms: [], apiEndpoints: [], jsFiles: [] };
const emptyCtx: ScanContext = { cookieStr: '', extraHeaders: {} };

async function main() {
  console.log('[probe] Cheap Planner gate check — clean-target:3002, empty surface');
  console.log('[probe] Expected: exitReason=early_exit_no_new_findings, findings=0');
  console.log('');

  const t0 = Date.now();
  let r: Awaited<ReturnType<typeof runAITestLoop>>;
  try {
    r = await runAITestLoop('http://localhost:3002', emptySurface, [], emptyCtx);
  } catch (e: any) {
    console.error('[PROBE ERROR]', e.message);
    process.exit(1);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Completed in ${elapsed}s`);
  console.log('exitReason:  ', r.exitReason);
  console.log('roundsRun:   ', r.roundsRun);
  console.log('findings:    ', r.findings.length);
  console.log('synthesis:   ', r.synthesisText ? r.synthesisText.slice(0, 200) : '(none)');

  console.log('');
  if (r.exitReason === 'error') {
    console.log('[GATE BLOCKED] Planner API still exhausted — do NOT run Step 4 yet.');
    console.log('               Wait for Groq rate-limit window and re-run this probe.');
    process.exit(1);
  } else if (r.exitReason === 'early_exit_no_new_findings') {
    console.log('[GATE CLEAR] Planner returned early-exit — Step 4 can proceed.');
    console.log('             This IS the honest-zero-findings code path Step 4 tests.');
  } else if (r.exitReason === 'cap_reached') {
    console.log('[GATE CLEAR ~] Keys live, but Planner proposed probes (no early-exit).');
    console.log('               Run Step 4 but scrutinize synthesisText for fabricated findings.');
  }
}

main();
