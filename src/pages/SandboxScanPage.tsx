import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  GitBranch, Play, Shield, AlertCircle, CheckCircle, Loader2,
  ExternalLink, Cpu, Lock, Zap, Globe, Eye, Box,
  Activity, Terminal, ChevronRight, Bug, Info,
} from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import { API_ENDPOINTS } from "@/config/api";
import { AuthService } from "@/services/auth.service";

interface SandboxStatus {
  status: "idle" | "cloning" | "installing" | "running" | "scanning" | "completed" | "failed";
  message: string;
  url?: string;
  scanId?: string;
  vulnerabilities?: number;
  codeScanResults?: { total: number; critical: number; high: number; medium: number; low: number } | null;
  penTestResults?: { vulnerabilitiesFound: number; riskScore: number } | null;
  error?: string;
}

const STEPS = [
  { key: "cloning", label: "Clone", icon: GitBranch, color: "#5B6CFF" },
  { key: "installing", label: "Install", icon: Box, color: "#7F5AF0" },
  { key: "running", label: "Boot", icon: Play, color: "#00D4FF" },
  { key: "scanning", label: "Scan", icon: Shield, color: "#F59E0B" },
  { key: "completed", label: "Done", icon: CheckCircle, color: "#22C55E" },
] as const;

const CODE_SEVERITY = [
  { key: "critical", label: "Critical", color: "text-destructive", bg: "hsl(0 84% 60% / 0.09)", border: "hsl(0 84% 60% / 0.25)" },
  { key: "high", label: "High", color: "severity-high", bg: "hsl(18 95% 60% / 0.09)", border: "hsl(18 95% 60% / 0.25)" },
  { key: "medium", label: "Medium", color: "text-warning", bg: "hsl(38 92% 50% / 0.09)", border: "hsl(38 92% 50% / 0.25)" },
  { key: "low", label: "Low", color: "text-info", bg: "hsl(217 91% 60% / 0.09)", border: "hsl(217 91% 60% / 0.25)" },
];

const LOG_COLORS: Record<string, string> = {
  error: "text-destructive",
  success: "text-success",
  warning: "text-warning",
  info: "text-muted-foreground",
};

const CAPABILITIES = [
  { icon: GitBranch, label: "Clone any public repo", desc: "No GitHub token required", color: "#5B6CFF" },
  { icon: Cpu, label: "AI code analysis", desc: "Scans TS, JS, Python, Go, PHP, Ruby", color: "#7F5AF0" },
  { icon: Play, label: "Auto-boot app", desc: "Detects runtime & starts server", color: "#00D4FF" },
  { icon: Globe, label: "Website scan", desc: "SSL, headers & endpoint audit", color: "#22C55E" },
  { icon: Lock, label: "Penetration test", desc: "XSS, injection & header checks", color: "#EF4444" },
  { icon: Shield, label: "Isolated microVM", desc: "Destroyed after scan completes", color: "#F59E0B" },
];

const SandboxScanPage = () => {
  const navigate = useNavigate();
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [sandboxStatus, setSandboxStatus] = useState<SandboxStatus>({ status: "idle", message: "" });
  const [logs, setLogs] = useState<Array<{ time: string; message: string; level: string }>>([]);

  const addLog = (message: string, level: "info" | "success" | "warning" | "error" = "info") => {
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), message, level }]);
  };

  const handleCloneAndScan = async () => {
    if (!repoUrl.trim()) return;
    try {
      setLogs([]);
      setSandboxStatus({ status: "cloning", message: "Cloning repository..." });
      addLog("Starting Vercel Sandbox microVM...", "info");
      addLog(`Target: ${repoUrl}`, "info");

      const token = AuthService.getToken();
      const response = await fetch(API_ENDPOINTS.scan.sandboxScan, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ repoUrl: repoUrl.trim(), branch: branch.trim() || "main" }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start sandbox scan");
      }

      const { sandboxId } = await response.json();
      addLog("✅ Sandbox provisioned — repository cloned", "success");
      pollSandboxStatus(sandboxId);
    } catch (error: any) {
      setSandboxStatus({ status: "failed", message: error.message, error: error.message });
      addLog(`Error: ${error.message}`, "error");
    }
  };

  const pollSandboxStatus = async (sandboxId: string) => {
    const token = AuthService.getToken();
    const poll = async () => {
      try {
        const response = await fetch(`${API_ENDPOINTS.scan.sandboxStatus}/${sandboxId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Failed to get status");
        const data = await response.json();
        setSandboxStatus(data);
        if (data.logs) setLogs(data.logs);
        if (!["completed", "failed"].includes(data.status)) {
          setTimeout(poll, 2000);
        } else if (data.status === "completed") {
          addLog("🎉 All scans completed!", "success");
        }
      } catch { }
    };
    poll();
  };

  const isProcessing = ["cloning", "installing", "running", "scanning"].includes(sandboxStatus.status);
  const currentStepIdx = STEPS.findIndex(s => s.key === sandboxStatus.status);

  const resetScan = () => {
    setSandboxStatus({ status: "idle", message: "" });
    setLogs([]);
    setRepoUrl("");
  };

  return (
    <PageLayout>
      <PageHeader
        title="Sandbox Scanner"
        description="Clone any public repository into an isolated Vercel microVM and perform a full AI-powered security audit."
        breadcrumbs={[{ label: "Security Tools" }, { label: "Sandbox" }]}
        actions={
          <div className="flex items-center gap-2">
            {/* Vercel Sandbox badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.25)" }}>
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Powered by @vercel/sandbox
            </div>
          </div>
        }
      />

      {sandboxStatus.status === "idle" ? (
        /* ── IDLE: 2-column layout ─────────────────────────────────────────── */
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Left: Input form */}
          <div className="lg:col-span-3 space-y-4">
            <div className="card-elevated p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "hsl(var(--primary) / 0.12)", border: "1px solid hsl(var(--primary) / 0.25)" }}>
                  <Box className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">Repository Target</h3>
                  <p className="text-xs text-muted-foreground">Enter any public GitHub repository</p>
                </div>
              </div>

              <div>
                <label className="section-label block mb-2">Repository URL</label>
                <div className="relative">
                  <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    value={repoUrl}
                    onChange={e => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/username/repository"
                    className="input-base pl-10 font-mono text-sm"
                    onKeyDown={e => e.key === "Enter" && handleCloneAndScan()}
                  />
                </div>
              </div>

              <div>
                <label className="section-label block mb-2">Branch</label>
                <div className="relative">
                  <Activity className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    value={branch}
                    onChange={e => setBranch(e.target.value)}
                    placeholder="main"
                    className="input-base pl-10 font-mono text-sm"
                  />
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={handleCloneAndScan}
                disabled={!repoUrl.trim()}
                className="btn-primary w-full justify-center py-3 text-sm gap-2"
                style={{ boxShadow: repoUrl.trim() ? "0 4px 24px hsl(var(--primary) / 0.35)" : undefined }}
              >
                <Play className="w-4 h-4" />
                Provision & Scan
                <ChevronRight className="w-4 h-4 ml-auto" />
              </motion.button>
            </div>

            {/* How sandbox works */}
            <div className="card-elevated p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground text-sm">How Sandbox Works</h3>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground px-2 py-0.5 rounded"
                  style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
                  @vercel/sandbox v2
                </span>
              </div>

              {/* Pipeline visualization */}
              <div className="flex items-center gap-2 py-2">
                {STEPS.map((step, i) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.key} className="flex items-center gap-2 flex-1">
                      <div className="flex flex-col items-center flex-1">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-1.5"
                          style={{ background: `${step.color}15`, border: `1px solid ${step.color}35` }}>
                          <Icon className="w-3.5 h-3.5" style={{ color: step.color }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium capitalize">{step.label}</span>
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className="w-5 h-px shrink-0 mb-4" style={{ background: "hsl(var(--border))" }} />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2 pt-1">
                {[
                  "Spins up an isolated Linux microVM via @vercel/sandbox",
                  "Clones the public repository — no GitHub token required",
                  "Reads source files and runs AI vulnerability analysis",
                  "Detects runtime (Node/Python/Go) and boots the application",
                  "Runs security header checks and penetration test inside the VM",
                  "MicroVM is destroyed after scan — zero data retention",
                ].map((text, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                    <span className="text-primary shrink-0 mt-0.5 font-bold">{i + 1}.</span>
                    {text}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Capabilities */}
          <div className="lg:col-span-2 space-y-4">
            {/* Vercel Sandbox info card */}
            <div className="card-elevated p-5 space-y-4"
              style={{ borderTop: "2px solid hsl(var(--primary) / 0.5)" }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: "hsl(var(--primary) / 0.12)" }}>
                  <Zap className="w-3.5 h-3.5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">Vercel Sandbox</h3>
                  <p className="text-[11px] text-muted-foreground">Isolated Linux microVMs</p>
                </div>
                <div className="ml-auto flex items-center gap-1.5 text-[10px] text-success font-medium">
                  <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  Ready
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { label: "Isolation", value: "Linux microVM" },
                  { label: "Runtime", value: "Node / Python / Go" },
                  { label: "Billing", value: "CPU time only" },
                  { label: "Lifetime", value: "Destroyed after scan" },
                ].map(item => (
                  <div key={item.label} className="p-2.5 rounded-lg"
                    style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
                    <p className="text-muted-foreground text-[10px]">{item.label}</p>
                    <p className="font-semibold text-foreground mt-0.5">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Capabilities */}
            <div className="card-elevated p-5 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground text-sm">What Gets Scanned</h3>
              </div>
              {CAPABILITIES.map((cap, i) => {
                const Icon = cap.icon;
                return (
                  <motion.div key={cap.label}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 p-2.5 rounded-lg"
                    style={{ background: "hsl(var(--muted) / 0.4)", border: "1px solid hsl(var(--border))" }}>
                    <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                      style={{ background: `${cap.color}15` }}>
                      <Icon className="w-3.5 h-3.5" style={{ color: cap.color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">{cap.label}</p>
                      <p className="text-[11px] text-muted-foreground">{cap.desc}</p>
                    </div>
                    <ChevronRight className="w-3 h-3 text-muted-foreground/40 ml-auto shrink-0" />
                  </motion.div>
                );
              })}
            </div>

            {/* Supported languages */}
            <div className="card-elevated p-4 space-y-2">
              <p className="text-xs font-semibold text-foreground mb-3">Supported Runtimes</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Node.js", color: "#68A063" },
                  { label: "Python", color: "#3572A5" },
                  { label: "Go", color: "#00ADD8" },
                  { label: "PHP", color: "#4F5D95" },
                  { label: "Ruby", color: "#701516" },
                ].map(lang => (
                  <div key={lang.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                    style={{ background: `${lang.color}12`, border: `1px solid ${lang.color}30`, color: lang.color }}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: lang.color }} />
                    {lang.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── ACTIVE / COMPLETED: Full scan view ─────────────────────────────── */
        <div className="space-y-5">
          {/* Pipeline progress bar */}
          <div className="card-elevated p-5">
            <div className="flex items-center gap-4 mb-4">
              {sandboxStatus.status === "completed" ? (
                <CheckCircle className="w-5 h-5 text-success shrink-0" />
              ) : sandboxStatus.status === "failed" ? (
                <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              ) : (
                <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
              )}
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground capitalize">{sandboxStatus.status}</p>
                <p className="text-xs text-muted-foreground">{sandboxStatus.message}</p>
              </div>
              {sandboxStatus.url && (
                <a href={sandboxStatus.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline shrink-0">
                  <ExternalLink className="w-3 h-3" /> Live URL
                </a>
              )}
              {["completed", "failed"].includes(sandboxStatus.status) && (
                <button onClick={resetScan} className="btn-secondary text-xs py-1.5 px-3 shrink-0">
                  New Scan
                </button>
              )}
            </div>

            {/* Step progress */}
            <div className="flex items-center gap-1">
              {STEPS.map((step, i) => {
                const done = i < currentStepIdx || sandboxStatus.status === "completed";
                const active = i === currentStepIdx && isProcessing;
                const Icon = step.icon;
                return (
                  <div key={step.key} className="flex-1">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-1.5 transition-all"
                        style={{
                          background: done ? `${step.color}20` : active ? `${step.color}15` : "hsl(var(--muted))",
                          border: `1px solid ${done || active ? step.color + "50" : "hsl(var(--border))"}`,
                        }}>
                        {active
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: step.color }} />
                          : <Icon className="w-3.5 h-3.5" style={{ color: done ? step.color : "hsl(var(--muted-foreground))" }} />
                        }
                      </div>
                      <div className={`h-1 w-full rounded-full transition-all`}
                        style={{ background: done ? step.color : active ? `${step.color}60` : "hsl(var(--muted))" }} />
                      <span className="text-[10px] mt-1 font-medium capitalize"
                        style={{ color: done ? step.color : active ? step.color : "hsl(var(--muted-foreground))" }}>
                        {step.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Left: Terminal log */}
            <div className="lg:col-span-3">
              <AnimatePresence>
                {logs.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="terminal-bg overflow-hidden rounded-xl h-full min-h-[300px]">
                    <div className="flex items-center gap-1.5 px-4 py-2.5"
                      style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                      <div className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
                      <div className="w-2.5 h-2.5 rounded-full bg-warning/60" />
                      <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
                      <Terminal className="w-3 h-3 text-muted-foreground ml-2" />
                      <span className="ml-1 text-[10px] text-muted-foreground font-mono">sandbox.log</span>
                      {isProcessing && (
                        <span className="ml-auto text-[10px] text-primary flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> LIVE
                        </span>
                      )}
                    </div>
                    <div className="overflow-y-auto p-4 space-y-1.5" style={{ maxHeight: "340px" }}>
                      {logs.map((log, i) => (
                        <motion.div key={i}
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-start gap-3 text-xs">
                          <span className="text-muted-foreground/40 font-mono shrink-0 w-16 tabular-nums">{log.time}</span>
                          <span className={LOG_COLORS[log.level]}>{log.message}</span>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right: Results */}
            <div className="lg:col-span-2 space-y-4">
              {sandboxStatus.status === "completed" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  {/* Code analysis */}
                  {sandboxStatus.codeScanResults && (
                    <div className="card-elevated p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Bug className="w-4 h-4 text-primary" />
                          <p className="text-sm font-semibold text-foreground">AI Code Analysis</p>
                        </div>
                        <span className="badge badge-warning text-[10px]">
                          {sandboxStatus.codeScanResults.total} issues
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {CODE_SEVERITY.map(s => (
                          <div key={s.key} className="rounded-lg p-3 text-center"
                            style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                            <p className={`text-xl font-black metric-number ${s.color}`}>
                              {(sandboxStatus.codeScanResults as any)[s.key]}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Website scan */}
                  <div className="card-elevated p-4 flex items-center justify-between"
                    style={sandboxStatus.scanId ? { borderLeft: "2px solid hsl(var(--success))" } : {}}>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                        <p className="text-sm font-semibold text-foreground">Website Scan</p>
                      </div>
                      <p className="text-xs text-muted-foreground pl-5">
                        {sandboxStatus.scanId
                          ? `${sandboxStatus.vulnerabilities ?? 0} header/SSL issues`
                          : "Skipped — unsupported runtime"}
                      </p>
                    </div>
                    <span className={`badge text-[10px] ${sandboxStatus.scanId ? "badge-success" : "badge-warning"}`}>
                      {sandboxStatus.scanId ? "Complete" : "Skipped"}
                    </span>
                  </div>

                  {/* Pentest */}
                  {sandboxStatus.penTestResults ? (
                    <div className="card-elevated p-4 space-y-3"
                      style={{ borderLeft: "2px solid hsl(0 84% 60% / 0.6)" }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                          <p className="text-sm font-semibold text-foreground">Penetration Test</p>
                        </div>
                        <span className="badge badge-success text-[10px]">Complete</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg p-3 text-center"
                          style={{ background: "hsl(0 84% 60% / 0.09)", border: "1px solid hsl(0 84% 60% / 0.25)" }}>
                          <p className="text-xl font-black metric-number text-destructive">
                            {sandboxStatus.penTestResults.vulnerabilitiesFound}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Vulnerabilities</p>
                        </div>
                        <div className="rounded-lg p-3 text-center"
                          style={{
                            background: sandboxStatus.penTestResults.riskScore >= 70
                              ? "hsl(0 84% 60% / 0.09)"
                              : sandboxStatus.penTestResults.riskScore >= 40
                              ? "hsl(38 92% 50% / 0.09)"
                              : "hsl(142 71% 45% / 0.09)",
                          }}>
                          <p className={`text-xl font-black metric-number ${sandboxStatus.penTestResults.riskScore >= 70 ? "text-destructive" : sandboxStatus.penTestResults.riskScore >= 40 ? "text-warning" : "text-success"}`}>
                            {sandboxStatus.penTestResults.riskScore}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Risk Score</p>
                        </div>
                      </div>
                    </div>
                  ) : sandboxStatus.status === "completed" && (
                    <div className="card-elevated p-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                          <p className="text-sm font-semibold text-foreground">Penetration Test</p>
                        </div>
                        <p className="text-xs text-muted-foreground pl-5">Skipped — unsupported runtime</p>
                      </div>
                      <span className="badge badge-warning text-[10px]">Skipped</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3">
                    {sandboxStatus.scanId && (
                      <button
                        onClick={() => navigate(`/website-scan/${sandboxStatus.scanId}`)}
                        className="btn-primary flex-1 justify-center text-sm">
                        View Full Report
                      </button>
                    )}
                    <button onClick={resetScan} className="btn-secondary flex-1 justify-center text-sm">
                      Scan Another Repo
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Error state */}
              {sandboxStatus.status === "failed" && (
                <div className="card-elevated p-5 space-y-3"
                  style={{ borderLeft: "2px solid hsl(var(--destructive))" }}>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                    <p className="text-sm font-semibold text-foreground">Scan Failed</p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{sandboxStatus.error}</p>
                  <button onClick={resetScan} className="btn-secondary w-full justify-center text-sm">
                    Try Again
                  </button>
                </div>
              )}

              {/* Processing placeholder */}
              {isProcessing && (
                <div className="card-elevated p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-primary animate-pulse" />
                    <p className="text-sm font-semibold text-foreground">Scan in Progress</p>
                  </div>
                  {["Code Analysis", "Runtime Detection", "Security Checks"].map((item, i) => (
                    <div key={item} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{item}</span>
                        <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />
                      </div>
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: "hsl(var(--muted))" }}>
                        <motion.div className="h-full rounded-full"
                          style={{ background: `hsl(var(--primary))` }}
                          animate={{ width: ["5%", "90%", "15%", "95%"] }}
                          transition={{ duration: 4 + i * 1.5, repeat: Infinity, ease: "easeInOut" }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};

export default SandboxScanPage;
