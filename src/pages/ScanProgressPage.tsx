import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Terminal, CheckCircle, AlertTriangle, XCircle, Info,
  Shield, GitBranch, Cpu, Bot, GitPullRequest, Scan,
  ArrowLeft,
} from "lucide-react";
import { ScanService } from "@/services/scan.service";
import { Navigation } from "@/components/Navigation";
import type { ScanLog } from "@/types/sentinel";

// ── Pipeline steps ────────────────────────────────────────────────────────
const PIPELINE = [
  { id: "fetch", label: "Fetch Repository", icon: GitBranch, keywords: ["Fetching", "cloning", "fetch"] },
  { id: "scan", label: "Security Scanning", icon: Scan, keywords: ["Trivy", "Semgrep", "npm audit", "scanning"] },
  { id: "analyze", label: "AI Analysis", icon: Cpu, keywords: ["AI", "analyzing", "analysis"] },
  { id: "patch", label: "Generating Patches", icon: Bot, keywords: ["patch", "fix", "generated"] },
  { id: "deploy", label: "Preparing Results", icon: GitPullRequest, keywords: ["complete", "done", "result"] },
];

const LOG_ICONS: Record<string, React.ReactNode> = {
  info: <Info className="w-3.5 h-3.5 text-info" />,
  success: <CheckCircle className="w-3.5 h-3.5 text-success" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-warning" />,
  error: <XCircle className="w-3.5 h-3.5 text-destructive" />,
};
const LOG_COLORS: Record<string, string> = {
  info: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  error: "text-destructive",
};

const ScanProgressPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scanId = searchParams.get("scanId");
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [phase, setPhase] = useState("Initializing...");
  const [progress, setProgress] = useState(0);
  const [repoName, setRepoName] = useState("Repository");
  const [status, setStatus] = useState<"queued" | "scanning" | "completed" | "failed">("queued");
  const [error, setError] = useState<string | null>(null);
  const [activePipelineStep, setActivePipelineStep] = useState(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scanId) { navigate("/repos"); return; }
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval>;

    const pollScanStatus = async () => {
      try {
        const scanStatus = await ScanService.getScanStatus(scanId);
        if (cancelled) return;

        setRepoName(scanStatus.repoFullName);
        setStatus(scanStatus.status);
        setLogs(scanStatus.logs.map(log => ({
          time: new Date(log.time).toLocaleTimeString(),
          message: log.message,
          level: log.level,
        })));

        if (scanStatus.status === "queued") {
          setProgress(5); setPhase("Queued"); setActivePipelineStep(0);
        } else if (scanStatus.status === "scanning") {
          const logCount = scanStatus.logs.length;
          setProgress(Math.min(10 + logCount * 5, 92));
          const lastLog = scanStatus.logs[scanStatus.logs.length - 1];
          if (lastLog) {
            const msg = lastLog.message;
            const idx = PIPELINE.findIndex(p => p.keywords.some(k => msg.toLowerCase().includes(k.toLowerCase())));
            if (idx >= 0) setActivePipelineStep(idx);
            if (msg.includes("Fetching")) setPhase("Fetching Repository");
            else if (msg.includes("AI")) { setPhase("AI Security Analysis"); setActivePipelineStep(2); }
            else if (msg.includes("analysis")) { setPhase("Analyzing Code"); setActivePipelineStep(1); }
            else setPhase("Scanning");
          }
        } else if (scanStatus.status === "completed") {
          setProgress(100); setPhase("Complete"); setActivePipelineStep(PIPELINE.length);
          clearInterval(pollInterval);
          setTimeout(() => { if (!cancelled) navigate(`/results?scanId=${scanId}`); }, 1800);
        } else if (scanStatus.status === "failed") {
          setProgress(100); setPhase("Failed");
          setError(scanStatus.error || "Scan failed");
          clearInterval(pollInterval);
        }
      } catch (err: any) {
        if (!cancelled) { setError(err.message || "Failed to get scan status"); clearInterval(pollInterval); }
      }
    };

    pollScanStatus();
    pollInterval = setInterval(pollScanStatus, 2000);
    return () => { cancelled = true; clearInterval(pollInterval); };
  }, [scanId, navigate]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="md:pl-[224px] pt-14 md:pt-0">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {/* Back */}
            <button onClick={() => navigate("/repos")} className="btn-ghost text-xs mb-6 gap-1.5 pl-0">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to repositories
            </button>

            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
              <div className="relative shrink-0">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{
                    background: status === "failed"
                      ? "hsl(var(--destructive) / 0.1)"
                      : status === "completed"
                      ? "hsl(var(--success) / 0.1)"
                      : "hsl(var(--primary) / 0.1)",
                    border: `1px solid hsl(var(--${status === "failed" ? "destructive" : status === "completed" ? "success" : "primary"}) / 0.2)`,
                  }}
                >
                  <Shield className={`w-6 h-6 ${status === "failed" ? "text-destructive" : status === "completed" ? "text-success" : "text-primary"}`} />
                </div>
                {progress < 100 && status !== "failed" && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary animate-ping" />
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground" style={{ letterSpacing: "-0.025em" }}>
                  {status === "failed" ? "Scan Failed" : status === "completed" ? "Scan Complete" : "Scanning Repository"}
                </h1>
                <p className="text-sm text-muted-foreground font-mono mt-0.5">{repoName}</p>
                {error && <p className="text-xs text-destructive mt-1">{error}</p>}
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-6">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-muted-foreground font-medium">{phase}</span>
                <span className="font-mono text-primary font-semibold">{progress}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(var(--muted))" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: status === "failed"
                      ? "hsl(var(--destructive))"
                      : "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--secondary)))",
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
            </div>

            {/* Pipeline steps */}
            <div className="grid grid-cols-5 gap-2 mb-8">
              {PIPELINE.map((step, i) => {
                const Icon = step.icon;
                const isDone = i < activePipelineStep || status === "completed";
                const isActive = i === activePipelineStep && status === "scanning";
                return (
                  <div key={step.id} className="text-center">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-1.5 transition-all ${
                        isDone ? "bg-success/10 border border-success/25"
                        : isActive ? "bg-primary/10 border border-primary/25 animate-glow-pulse"
                        : "bg-muted border border-border"
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle className="w-4 h-4 text-success" />
                      ) : (
                        <Icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-muted-foreground/40"}`} />
                      )}
                    </div>
                    <div className={`text-[9px] font-medium leading-tight ${isDone ? "text-success" : isActive ? "text-primary" : "text-muted-foreground/40"}`}>
                      {step.label}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Terminal log */}
            <div className="terminal-bg overflow-hidden rounded-xl">
              <div className="flex items-center gap-1.5 px-4 py-3"
                style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                <div className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-warning/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
                <span className="ml-2 text-[10px] text-muted-foreground font-mono">scan-output.log</span>
                {status === "scanning" && (
                  <span className="ml-auto flex items-center gap-1.5 text-[10px] text-primary">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    Live
                  </span>
                )}
              </div>
              <div className="h-[380px] overflow-y-auto p-4 space-y-1.5">
                {logs.length === 0 && (
                  <div className="text-muted-foreground/40 text-xs font-mono">Waiting for output...</div>
                )}
                {logs.map((log, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-3 text-xs"
                  >
                    <span className="text-muted-foreground/40 font-mono shrink-0 w-16">{log.time}</span>
                    <span className="shrink-0 mt-0.5">{LOG_ICONS[log.level]}</span>
                    <span className={LOG_COLORS[log.level]}>{log.message}</span>
                  </motion.div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default ScanProgressPage;
