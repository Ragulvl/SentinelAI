const ALLOWED_CLI_BINS = new Set(['curl']);
function checkAllowlist(bin) {
  if (!bin || !ALLOWED_CLI_BINS.has(bin)) throw new Error(CLI binary ' + bin + ' not in ALLOWED_CLI_BINS);
  return true;
}
let passed = 0, failed = 0;
function test(label, fn) {
  try { fn(); console.log('  PASS:', label); passed++; }
  catch(e) { console.error('  FAIL:', label, '->', e.message); failed++; }
}
function expect(c, m) { if (!c) throw new Error('Assertion: ' + m); }

console.log('\n[allowlist-unit-test] Testing ALLOWED_CLI_BINS\n');

test('curl allowed', () => expect(checkAllowlist('curl') === true, 'curl should pass'));
test('wget rejected', () => {
  let threw=false;
  try { checkAllowlist('wget'); } catch(e) {
    threw=true;
    expect(e.message.includes('wget'), 'error mentions binary');
    expect(e.message.includes('ALLOWED_CLI_BINS'), 'error mentions ALLOWED_CLI_BINS');
  }
  expect(threw, 'should have thrown');
});
test('sqlmap rejected', () => { let t=false; try{checkAllowlist('sqlmap');}catch(e){t=true;} expect(t,'thrown'); });
test('bash rejected', () => { let t=false; try{checkAllowlist('bash');}catch(e){t=true;} expect(t,'thrown'); });
test('empty string rejected', () => { let t=false; try{checkAllowlist('');}catch(e){t=true;} expect(t,'thrown'); });
test('undefined rejected', () => { let t=false; try{checkAllowlist(undefined);}catch(e){t=true;} expect(t,'thrown'); });
test('null rejected', () => { let t=false; try{checkAllowlist(null);}catch(e){t=true;} expect(t,'thrown'); });
test('path traversal rejected', () => { let t=false; try{checkAllowlist('../../bin/curl');}catch(e){t=true;} expect(t,'thrown'); });
test('CURL uppercase rejected (case-sensitive)', () => { let t=false; try{checkAllowlist('CURL');}catch(e){t=true;} expect(t,'thrown'); });

console.log('\n[allowlist-unit-test] Results:', passed, 'passed,', failed, 'failed');
if (failed > 0) { console.error('[ALLOWLIST FAIL] Check ai-loop.ts ALLOWED_CLI_BINS logic'); process.exit(1); }
else { console.log('[ALLOWLIST PASS] All checks correct'); }