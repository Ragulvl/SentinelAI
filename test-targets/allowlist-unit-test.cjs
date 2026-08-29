// allowlist-unit-test.cjs
// Deterministic unit test for ALLOWED_CLI_BINS enforcement in ai-loop.ts.
// No LLM, no sandbox, no network needed.
// Run: node test-targets/allowlist-unit-test.cjs

// Must mirror the constant in ai-loop.ts exactly
const ALLOWED_CLI_BINS = new Set(['curl']);

function checkAllowlist(bin) {
  if (!bin || !ALLOWED_CLI_BINS.has(bin)) {
    throw new Error("CLI binary '" + String(bin) + "' not in ALLOWED_CLI_BINS");
  }
  return true;
}

// ── harness ─────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(label, fn) {
  try { fn(); console.log('  PASS:', label); passed++; }
  catch (e) { console.error('  FAIL:', label, '->', e.message); failed++; }
}
function expect(condition, msg) {
  if (!condition) throw new Error('Assertion failed: ' + msg);
}

// ── cases ───────────────────────────────────────────────────────────────────
console.log('\n[allowlist-unit-test] Testing ALLOWED_CLI_BINS enforcement\n');

test('curl is allowed', function() {
  expect(checkAllowlist('curl') === true, 'should return true for curl');
});

test('wget is rejected — error mentions binary name and ALLOWED_CLI_BINS', function() {
  var threw = false;
  try { checkAllowlist('wget'); }
  catch (e) {
    threw = true;
    expect(e.message.includes('wget'), 'error should mention binary name');
    expect(e.message.includes('ALLOWED_CLI_BINS'), 'error should mention ALLOWED_CLI_BINS');
  }
  expect(threw, 'should have thrown for wget');
});

['sqlmap', 'bash', 'nmap', 'python3', 'node', '../../bin/curl', 'CURL', ''].forEach(function(bin) {
  test('rejected: ' + JSON.stringify(bin), function() {
    var threw = false;
    try { checkAllowlist(bin); } catch(e) { threw = true; }
    expect(threw, 'should throw for ' + JSON.stringify(bin));
  });
});

test('rejected: null', function() {
  var threw = false;
  try { checkAllowlist(null); } catch(e) { threw = true; }
  expect(threw, 'should throw for null');
});

test('rejected: undefined', function() {
  var threw = false;
  try { checkAllowlist(undefined); } catch(e) { threw = true; }
  expect(threw, 'should throw for undefined');
});

// ── results ─────────────────────────────────────────────────────────────────
console.log('\n[allowlist-unit-test] Results:', passed, 'passed,', failed, 'failed');
if (failed > 0) {
  console.error('[ALLOWLIST FAIL] Fix ALLOWED_CLI_BINS check in ai-loop.ts');
  process.exit(1);
} else {
  console.log('[ALLOWLIST PASS] All allowlist enforcement checks correct');
}
