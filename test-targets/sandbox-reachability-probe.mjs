import { Sandbox } from "@vercel/sandbox";

/**
 * sandbox-reachability-probe.mjs
 *
 * Answers: can a Vercel Sandbox microVM reach your dev machine?
 *
 * Expected results:
 *   localhost:3001 -> LIKELY FAIL (sandbox is a remote VM; localhost = sandbox itself, not your machine)
 *   <ngrok-url>   -> should succeed once you tunnel vuln-target through ngrok
 *
 * Run: VERCEL_TOKEN=xxx VERCEL_TEAM_ID=xxx VERCEL_PROJECT_ID=xxx node --input-type=module < sandbox-reachability-probe.mjs
 * Or:  node test-targets/sandbox-reachability-probe.mjs (if env vars are in .env)
 */

const TARGET = process.env.PROBE_TARGET || "http://localhost:3001";

console.log("[probe] Starting Vercel Sandbox reachability probe...");
console.log("[probe] Target:", TARGET);
console.log("[probe] NOTE: localhost inside the sandbox = the sandbox itself, NOT your dev machine");
console.log();

let sandbox;
try {
  sandbox = await Sandbox.create({
    timeout: 30_000,
    networkPolicy: { allow: [new URL(TARGET).hostname] },
  });
  console.log("[probe] Sandbox created OK");

  const isNgrok = TARGET.includes('.ngrok');
  // Test 1: basic curl to target — include ngrok header to bypass interstitial on free-tier tunnels
  console.log("[probe] Test 1: curl to " + TARGET + (isNgrok ? " (ngrok header included)" : ""));
  const r1 = await sandbox.runCommand({
    cmd: "curl",
    args: [
      "-s", "-o", "/dev/null", "-w", "%{http_code}",
      "--connect-timeout", "5",
      ...(isNgrok ? ["-H", "ngrok-skip-browser-warning: 1"] : []),
      TARGET,
    ],
    timeoutMs: 10_000,
  });
  const httpCode = await r1.stdout();
  const stderr1  = await r1.stderr();
  console.log("  exit:", r1.exitCode, "| HTTP status code in output:", httpCode || "(empty)");
  if (stderr1) console.log("  stderr:", stderr1.slice(0, 200));

  if (r1.exitCode !== 0 || !httpCode.startsWith("2")) {
    console.log();
    console.log("[RESULT] FAIL - sandbox cannot reach " + TARGET);
    console.log("[RESULT] For Step 3 (CLI path test), you need a public URL.");
    console.log("[RESULT] Option A: ngrok http 3001  then set PROBE_TARGET=https://<ngrok-url>");
    console.log("[RESULT] Option B: deploy vuln-target to a VPS or Vercel function");
    console.log("[RESULT] HTTP-only (Step 1/2) testing is unaffected by this.");
  } else {
    console.log();
    console.log("[RESULT] SUCCESS - sandbox reached " + TARGET + " (HTTP " + httpCode + ")");
    console.log("[RESULT] Step 3 (CLI path) can proceed against this target.");
  }

  // Test 2: verify allowlist blocks external host
  console.log();
  console.log("[probe] Test 2: verify external host is blocked (should fail/timeout)");
  const r2 = await sandbox.runCommand({
    cmd: "curl",
    args: ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--connect-timeout", "3", "http://example.com"],
    timeoutMs: 8_000,
  });
  const code2 = await r2.stdout();
  console.log("  exit:", r2.exitCode, "| HTTP status:", code2 || "(empty/blocked)");
  if (r2.exitCode !== 0) {
    console.log("[RESULT] NetworkPolicy is correctly blocking external egress");
  } else {
    console.log("[RESULT] WARNING: external host was reachable - NetworkPolicy may not be working");
  }

} catch (e) {
  console.error("[probe] Error:", e.message);
  if (e.message.includes("VERCEL_TOKEN") || e.message.includes("credentials") || e.message.includes("401")) {
    console.error("[probe] Hint: set VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID");
  }
} finally {
  if (sandbox) {
    await sandbox.stop().catch(e => console.warn("[probe] stop() error:", e.message));
    console.log("[probe] Sandbox stopped.");
  }
}