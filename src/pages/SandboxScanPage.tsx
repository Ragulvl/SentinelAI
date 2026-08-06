import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  GitBranch, Play, Shield, AlertCircle, CheckCircle, Loader2, ExternalLink,
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

const STEPS = ["cloning", "installing", "running", "scanning", "completed"] as const;

const CODE_SEVERITY = [
  { key: "critical", label: "Critical", color: "text-destructive", bg: "hsl(0 84% 60% / 0.09)" },
  { key: "high", label: "High", color: "severity-high", bg: "hsl(18 95% 60% / 0.09)" },
  { key: "medium", label: "Medium", color: "text-warning", bg: "hsl(38 92% 50% / 0.09)" },
  { key: "low", label: "Low", color: "text-info", bg: "hsl(217 91% 60% / 0.09)" },
];

const LOG_COLORS: Record<string, string> = {
  error: "text-destructive", success: "text-success", warning: "text-warning", info: "text-muted-foreground",
};

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
      addLog("Starting sandbox environment...", "info");
      addLog(`Cloning: ${repoUrl}`, "info");

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
      addLog("Repository cloned successfully", "success");
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
          addLog("Scan completed!", "success");
        }
      } catch { }
    };
    poll();
  };

  const isProcessing = ["cloning", "installing", "running", "scanning"].includes(sandboxStatus.status);
  const currentStepIdx = STEPS.indexOf(sandboxStatus.status as any);

  return (
    <PageLayout>
      <PageHeader
        title="Sandbox Scanner"
        description="Provision isolated environments to safely clone and perform full security evaluations without GitHub tokens."
        breadcrumbs={[{ label: "Security Tools" }, { label: "Sandbox" }]}
      />

      <div className="max-w-3xl space-y-5">
        {/* Input */}
        <div className="card-elevated p-6 space-y-4">
          <div>
            <label className="section-label block mb-2">Repository URL</label>
            <div className="relative">
              <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                value={repoUrl} onChange={e => setRepoUrl(e.target.value)}
                disabled={isProcessing} placeholder="https://github.com/username/repo"
                className="input-base pl-10 font-mono text-sm"
              />
            </div>
          </div>

          <div>
            <label className="section-label block mb-2">Branch (optional)</label>
            <input value={branch} onChange={e => setBranch(e.target.value)}
              disabled={isProcessing} placeholder="main"
              className="input-base font-mono text-sm" />
          </div>

          <button onClick={handleCloneAndScan} disabled={!repoUrl.trim() || isProcessing}
            className="btn-primary w-full justify-center">
            {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : <><Play className="w-4 h-4" /> Provision & Scan</>}
          </button>

          {/* How it works */}
          <div className="p-3.5 rounded-xl text-xs space-y-1.5"
            style={{ background: "hsl(var(--primary) / 0.06)", border: "1px solid hsl(var(--primary) / 0.2)" }}>
            <p className="font-semibold text-foreground mb-2 text-[11px]">How it works</p>
            {[
              "Clones the repository in an isolated sandbox environment",
              "AI scans all code files for vulnerabilities (no GitHub token needed)",
              "Supports Node.js, Python, Go, Ruby, and PHP projects",
              "Boots the app and runs website scan + penetration test in parallel",
              "Sandbox is destroyed after scan completes",
            ].map(text => (
              <p key={text} className="text-muted-foreground flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span> {text}
              </p>
            ))}
          </div>
        </div>

        {/* Status + pipeline */}
        <AnimatePresence>
          {sandboxStatus.status !== "idle" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="card-elevated p-5 space-y-5">
              {/* Header */}
              <div className="flex items-center gap-3">
                {sandboxStatus.status === "completed" ? (
                  <CheckCircle className="w-5 h-5 text-success shrink-0" />
                ) : sandboxStatus.status === "failed" ? (
                  <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                ) : (
                  <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
                )}
                <div>
                  <p className="text-sm font-semibold text-foreground capitalize">{sandboxStatus.status}</p>
                  <p className="text-xs text-muted-foreground">{sandboxStatus.message}</p>
                </div>
                {sandboxStatus.url && (
                  <a href={sandboxStatus.url} target="_blank" rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1.5 text-xs text-primary hover:underline">
                    <ExternalLink className="w-3 h-3" /> Live URL
                  </a>
                )}
              </div>

              {/* Pipeline steps */}
              <div className="flex items-center gap-2">
                {STEPS.map((step, i) => {
                  const done = i < currentStepIdx || sandboxStatus.status === "completed";
                  const active = i === currentStepIdx;
                  return (
                    <div key={step} className="flex-1 text-center">
                      <div className={`h-1 rounded-full mb-1.5 ${done ? "bg-success" : active ? "bg-primary" : "bg-border"}`} />
                      <span className={`text-[9px] font-medium capitalize ${done ? "text-success" : active ? "text-primary" : "text-muted-foreground/40"}`}>
                        {step}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Results when completed */}
              {sandboxStatus.status === "completed" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                  <p className="section-label">Scan Report</p>

                  {/* Code analysis */}
                  <div className="p-4 rounded-xl space-y-3" style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">AI Code Analysis</p>
                      <span className="text-xs text-muted-foreground">{sandboxStatus.codeScanResults?.total ?? 0} total issues</span>
                    </div>
                    {sandboxStatus.codeScanResults ? (
                      <div className="grid grid-cols-4 gap-2">
                        {CODE_SEVERITY.map(s => (
                          <div key={s.key} className="rounded-lg p-2 text-center" style={{ background: s.bg }}>
                            <p className={`text-lg font-black metric-number ${s.color}`}>{(sandboxStatus.codeScanResults as any)[s.key]}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">{s.label}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center">AI code analysis skipped or failed</p>
                    )}
                  </div>

                  {/* Website scan */}
                  <div className="p-4 rounded-xl flex items-center justify-between"
                    style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Website Scan</p>
                      <p className="text-xs text-muted-foreground">
                        {sandboxStatus.scanId ? `${sandboxStatus.vulnerabilities ?? 0} header/SSL issues found` : "Skipped — unsupported runtime"}
                      </p>
                    </div>
                    <span className={`badge text-[10px] ${sandboxStatus.scanId ? "badge-success" : "badge-warning"}`}>
                      {sandboxStatus.scanId ? "Complete" : "Skipped"}
                    </span>
                  </div>

                  {/* Pentest */}
                  {sandboxStatus.penTestResults ? (
                    <div className="p-4 rounded-xl" style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-foreground">Penetration Test</p>
                        <span className="badge badge-success text-[10px]">Complete</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg p-3 text-center" style={{ background: "hsl(0 84% 60% / 0.09)" }}>
                          <p className="text-xl font-black metric-number text-destructive">{sandboxStatus.penTestResults.vulnerabilitiesFound}</p>
                          <p className="text-xs text-muted-foreground">Vulnerabilities</p>
                        </div>
                        <div className="rounded-lg p-3 text-center"
                          style={{ background: sandboxStatus.penTestResults.riskScore >= 70 ? "hsl(0 84% 60% / 0.09)" : sandboxStatus.penTestResults.riskScore >= 40 ? "hsl(38 92% 50% / 0.09)" : "hsl(142 71% 45% / 0.09)" }}>
                          <p className={`text-xl font-black metric-number ${sandboxStatus.penTestResults.riskScore >= 70 ? "text-destructive" : sandboxStatus.penTestResults.riskScore >= 40 ? "text-warning" : "text-success"}`}>
                            {sandboxStatus.penTestResults.riskScore}
                          </p>
                          <p className="text-xs text-muted-foreground">Risk Score</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl flex items-center justify-between"
                      style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Penetration Test</p>
                        <p className="text-xs text-muted-foreground">Skipped — unsupported runtime</p>
                      </div>
                      <span className="badge badge-warning text-[10px]">Skipped</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3 pt-1">
                    {sandboxStatus.scanId && (
                      <button onClick={() => navigate(`/website-scan/${sandboxStatus.scanId}`)} className="btn-primary flex-1 justify-center text-sm">
                        View Website Report
                      </button>
                    )}
                    <button onClick={() => { setSandboxStatus({ status: "idle", message: "" }); setLogs([]); }}
                      className="btn-secondary flex-1 justify-center text-sm">
                      Scan Another Repo
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Logs */}
        <AnimatePresence>
          {logs.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="terminal-bg overflow-hidden rounded-xl">
              <div className="flex items-center gap-1.5 px-4 py-3" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                <div className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-warning/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
                <span className="ml-2 text-[10px] text-muted-foreground font-mono">sandbox.log</span>
                {isProcessing && <span className="ml-auto text-[10px] text-primary flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />Live
                </span>}
              </div>
              <div className="max-h-56 overflow-y-auto p-4 space-y-1.5">
                {logs.map((log, i) => (
                  <div key={i} className="flex items-start gap-3 text-xs">
                    <span className="text-muted-foreground/40 font-mono shrink-0 w-16">{log.time}</span>
                    <span className={LOG_COLORS[log.level]}>{log.message}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageLayout>
  );
};

export default SandboxScanPage;
