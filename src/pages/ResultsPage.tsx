import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, Download, GitPullRequest, Code2,
  ChevronDown, ChevronRight, FileWarning, CheckCircle2,
  XCircle, Loader2, Shield, ArrowLeft, ExternalLink,
  ChevronLeft, Terminal, Flame, FileText, Package,
} from "lucide-react";
import { Severity, Vulnerability, ScanResult } from "@/types/sentinel";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import { ScanService } from "@/services/scan.service";
import { AuthService } from "@/services/auth.service";
import { API_ENDPOINTS } from "@/config/api";

// ── Severity config ───────────────────────────────────────────────────────
const SEV_CONFIG: Record<Severity, { color: string; bg: string; border: string; label: string }> = {
  critical: { color: "text-destructive", bg: "severity-bg-critical", border: "border-destructive/30", label: "Critical" },
  high: { color: "severity-high", bg: "severity-bg-high", border: "border-orange-500/30", label: "High" },
  medium: { color: "severity-medium", bg: "severity-bg-medium", border: "border-yellow-500/30", label: "Medium" },
  low: { color: "severity-low", bg: "severity-bg-low", border: "border-blue-400/30", label: "Low" },
};

// ── Score ring ────────────────────────────────────────────────────────────
const ScoreRing = ({ score }: { score: number }) => {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = (score / 100) * circumference;
  const color = score >= 80 ? "#22C55E" : score >= 50 ? "#F59E0B" : "#EF4444";

  return (
    <div className="relative w-28 h-28 flex items-center justify-center">
      <svg width="112" height="112" className="score-ring">
        <circle cx="56" cy="56" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
        <motion.circle
          cx="56" cy="56" r={radius} fill="none"
          stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - strokeDash }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6 }}
          className="text-2xl font-black metric-number"
          style={{ 
            color,
            fontFamily: "'Departure Mono', monospace",
            fontWeight: 400,
            letterSpacing: "-0.03em",
          }}
        >
          {score}
        </motion.span>
        <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">Score</span>
      </div>
    </div>
  );
};

// ── Severity badge ────────────────────────────────────────────────────────
const SeverityBadge = ({ severity }: { severity: Severity }) => {
  const cfg = SEV_CONFIG[severity];
  return (
    <span className={`badge text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 ${cfg.color} ${cfg.bg} border ${cfg.border}`}>
      {cfg.label}
    </span>
  );
};

// ── Vulnerability row ─────────────────────────────────────────────────────
const VulnRow = ({ vuln, onViewDiff }: { vuln: Vulnerability; onViewDiff: () => void }) => {
  const [open, setOpen] = useState(false);
  const cfg = SEV_CONFIG[vuln.severity];

  const priorityLabel = (p?: number) => {
    if (!p) return null;
    const map: Record<number, { label: string; color: string }> = {
      1: { label: "P1 Fix Now",    color: "hsl(var(--destructive))" },
      2: { label: "P2 High",       color: "#F97316" },
      3: { label: "P3 Medium",     color: "#EAB308" },
      4: { label: "P4 Low",        color: "hsl(var(--muted-foreground))" },
      5: { label: "P5 Info",       color: "hsl(var(--muted-foreground))" },
    };
    return map[p] || null;
  };
  const pri = priorityLabel((vuln as any).remediationPriority);
  const cvss = (vuln as any).cvssScore;
  const lineEnd = (vuln as any).lineEnd;
  const exploitExample = (vuln as any).exploitExample;

  return (
    <div className={`rounded-xl overflow-hidden border ${cfg.border} card-base`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-card-hover transition-colors group"
      >
        <span className="shrink-0 text-muted-foreground transition-transform duration-200"
          style={{ transform: open ? "rotate(90deg)" : "" }}>
          <ChevronRight className="w-4 h-4" />
        </span>
        <SeverityBadge severity={vuln.severity} />
        {/* CVSS score badge */}
        {cvss !== undefined && (
          <span
            className="shrink-0 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
            style={{
              background: cvss >= 9 ? "hsl(var(--destructive) / 0.15)" : cvss >= 7 ? "hsl(25 95% 53% / 0.15)" : "hsl(var(--muted))",
              color: cvss >= 9 ? "hsl(var(--destructive))" : cvss >= 7 ? "#F97316" : "hsl(var(--muted-foreground))",
              border: `1px solid ${cvss >= 9 ? "hsl(var(--destructive) / 0.3)" : cvss >= 7 ? "rgba(249,115,22,0.3)" : "hsl(var(--border))"}`,
            }}
          >
            CVSS {cvss.toFixed(1)}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">{vuln.title}</div>
          <div className="text-xs text-muted-foreground font-mono mt-0.5 flex items-center gap-2">
            <FileWarning className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {vuln.file}:{vuln.line}{lineEnd && lineEnd !== vuln.line ? `–${lineEnd}` : ""}
            </span>
            <span className="opacity-40">·</span>
            <span>{vuln.cweId}</span>
            {pri && (
              <>
                <span className="opacity-40">·</span>
                <span style={{ color: pri.color, fontWeight: 600 }}>{pri.label}</span>
              </>
            )}
          </div>
        </div>
        {vuln.fixAvailable ? (
          <span className="shrink-0 flex items-center gap-1 text-xs text-success font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> Patch ready
          </span>
        ) : (
          <span className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground">
            <XCircle className="w-3.5 h-3.5" /> Manual fix
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-4 space-y-4" style={{ borderTop: "1px solid hsl(var(--border))" }}>
              <p className="text-sm text-muted-foreground leading-relaxed">{vuln.description}</p>

              {/* Exploit PoC */}
              {exploitExample && (
                <div>
                  <div className="text-[10px] font-mono font-semibold mb-2 uppercase tracking-wider flex items-center gap-1.5"
                    style={{ color: "#F97316" }}>
                    <Flame className="w-3 h-3" /> Exploit PoC
                  </div>
                  <pre
                    className="terminal-bg p-3 text-xs overflow-x-auto whitespace-pre-wrap rounded-lg"
                    style={{ borderColor: "rgba(249,115,22,0.25)", color: "#FED7AA" }}
                  >
                    {exploitExample}
                  </pre>
                </div>
              )}

              {(vuln.originalCode || vuln.patchedCode) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-mono font-semibold text-destructive mb-2 uppercase tracking-wider">— Vulnerable</div>
                    <pre className="terminal-bg p-3 text-xs text-foreground overflow-x-auto whitespace-pre-wrap rounded-lg"
                      style={{ borderColor: "hsl(var(--destructive) / 0.25)" }}>
                      {vuln.originalCode}
                    </pre>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono font-semibold text-success mb-2 uppercase tracking-wider">+ Patched</div>
                    <pre className="terminal-bg p-3 text-xs text-foreground overflow-x-auto whitespace-pre-wrap rounded-lg"
                      style={{ borderColor: "hsl(var(--success) / 0.25)" }}>
                      {vuln.patchedCode}
                    </pre>
                  </div>
                </div>
              )}

              <button
                onClick={onViewDiff}
                className="btn-secondary text-xs gap-2"
              >
                <Code2 className="w-3.5 h-3.5" />
                Open in Editor
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────
const ResultsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scanId = searchParams.get("scanId");
  const isWebsite = searchParams.get("mode") === "website";
  const websiteUrl = searchParams.get("url") || "";

  const [scanData, setScanData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingPR, setCreatingPR] = useState(false);
  const [prCreated, setPrCreated] = useState<{ url: string; number: number } | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<Severity | "all">("all");
  const [vulnPage, setVulnPage] = useState(1);

  const VULNS_PER_PAGE = 15;

  useEffect(() => {
    if (!scanId && !isWebsite) { navigate("/repos"); return; }
    if (scanId) fetchScanResults();
    else setLoading(false);
  }, [scanId]);

  // Reset vuln page when filter changes — must be here (before early returns) to avoid hooks-order violation
  useEffect(() => { setVulnPage(1); }, [filterSeverity]);

  const fetchScanResults = async () => {
    if (!scanId) return;
    try {
      setLoading(true);
      const results = await ScanService.getScanResults(scanId);
      setScanData(results);
    } catch (err: any) {
      setError(err.message || "Failed to load scan results");
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePR = async () => {
    if (!scanId || !scanData) return;
    try {
      setCreatingPR(true);
      const result = await ScanService.createFixPR(scanId);
      setPrCreated({ url: result.prUrl, number: result.prNumber });
    } catch (err: any) {
      alert(err.message || "Failed to create pull request");
    } finally {
      setCreatingPR(false);
    }
  };

  const handleDownload = async () => {
    if (!scanId) return;
        if (!token) return;
    try {
      // CWE-798: Never put tokens in URLs — use Authorization header via fetch
      const response = await fetch(API_ENDPOINTS.scan.download(scanId), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sentinelai-fixes-${scanId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  const handleDownloadPdf = async () => {
    if (!scanId) return;
        if (!token) return;
    try {
      const response = await fetch(`/api/scan/${scanId}/report.pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('PDF generation failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sentinelai-report-${scanId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF download error:', err);
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-glow-pulse"
              style={{ background: "hsl(var(--primary) / 0.1)", border: "1px solid hsl(var(--primary) / 0.2)" }}>
              <Shield className="w-6 h-6 text-primary animate-pulse" />
            </div>
            <p className="text-muted-foreground text-sm">Loading scan results...</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error || !scanData) {
    return (
      <PageLayout>
        <div className="text-center py-20">
          <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-4" />
          <h2 className="text-lg font-bold text-foreground mb-2">Failed to Load Results</h2>
          <p className="text-sm text-muted-foreground mb-5">{error || "Scan results not found"}</p>
          <button onClick={() => navigate("/repos")} className="btn-primary text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to Scans
          </button>
        </div>
      </PageLayout>
    );
  }
  const { summary, vulnerabilities } = scanData;
  const fixableCount = vulnerabilities.filter(v => v.fixAvailable).length;

  const scoreWeighted = (summary.critical * 10) + (summary.high * 5) + (summary.medium * 2) + summary.low;
  const score = Math.max(0, Math.min(100, 100 - scoreWeighted));

  const filtered = filterSeverity === "all" ? vulnerabilities
    : vulnerabilities.filter(v => v.severity === filterSeverity);
  const totalVulnPages = Math.ceil(filtered.length / VULNS_PER_PAGE);
  const pagedVulns = filtered.slice((vulnPage - 1) * VULNS_PER_PAGE, vulnPage * VULNS_PER_PAGE);

  const severityFilters: Array<{ key: Severity | "all"; label: string }> = [
    { key: "all", label: `All (${vulnerabilities.length})` },
    { key: "critical", label: `Critical (${summary.critical})` },
    { key: "high", label: `High (${summary.high})` },
    { key: "medium", label: `Medium (${summary.medium})` },
    { key: "low", label: `Low (${summary.low})` },
  ];

  return (
    <PageLayout>
      <PageHeader
        title="Scan Results"
        description={`${isWebsite ? websiteUrl : scanData.repoName} · ${summary.total} vulnerabilities · ${fixableCount} auto-patchable`}
        breadcrumbs={[{ label: "Code Scan", path: "/repos" }, { label: "Results" }]}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(`/editor?scanId=${scanId}`)} className="btn-ghost-border gap-2 text-xs">
              <Code2 className="w-3.5 h-3.5" /> Editor
            </button>
            <button
              onClick={handleDownload}
              disabled={fixableCount === 0}
              className="btn-ghost-border gap-2 text-xs"
            >
              <Download className="w-3.5 h-3.5" /> Download ({fixableCount})
            </button>
            <button
              onClick={handleDownloadPdf}
              className="btn-ghost-border gap-2 text-xs"
              title="Download PDF Report"
            >
              <FileText className="w-3.5 h-3.5" /> PDF Report
            </button>
            {!prCreated && fixableCount > 0 && (
              <button
                onClick={handleCreatePR}
                disabled={creatingPR}
                className="btn-primary text-xs gap-2 py-2"
              >
                {creatingPR ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating...</> : <><GitPullRequest className="w-3.5 h-3.5" /> Create PR ({fixableCount})</>}
              </button>
            )}
          </div>
        }
      />

      {/* PR Success Banner */}
      <AnimatePresence>
        {prCreated && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl flex items-center gap-3"
            style={{ background: "hsl(var(--success) / 0.08)", border: "1px solid hsl(var(--success) / 0.25)" }}
          >
            <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-success">Pull Request Created!</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Security fixes committed to a new branch</p>
            </div>
            <a href={prCreated.url} target="_blank" rel="noopener noreferrer"
              className="btn-secondary text-xs gap-1.5 py-1.5">
              <ExternalLink className="w-3 h-3" /> View PR #{prCreated.number}
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary hero */}
      <div className="card-elevated p-6 mb-6 flex flex-col md:flex-row items-center gap-6">
        <ScoreRing score={score} />

        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Critical", value: summary.critical, color: "text-destructive" },
            { label: "High", value: summary.high, color: "severity-high" },
            { label: "Medium", value: summary.medium, color: "severity-medium" },
            { label: "Low", value: summary.low, color: "severity-low" },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className={`text-3xl font-black metric-number ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="text-center md:text-right">
          <div className="text-2xl font-black text-success metric-number">{fixableCount}</div>
          <div className="text-xs text-muted-foreground">Auto-patchable</div>
          <div className="text-2xl font-black text-foreground metric-number mt-2">{summary.total}</div>
          <div className="text-xs text-muted-foreground">Total found</div>
        </div>
      </div>

      {/* Severity filter tabs */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {severityFilters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilterSeverity(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filterSeverity === f.key
                ? "bg-primary/10 text-primary border border-primary/25"
                : "text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Vulnerability list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No vulnerabilities for this filter.
          </div>
        ) : (
          <>
            {pagedVulns.map(v => (
              <VulnRow key={v.id} vuln={v} onViewDiff={() => navigate(`/editor?scanId=${scanId}`)} />
            ))}

            {/* Pagination */}
            {totalVulnPages > 1 && (
              <div className="flex items-center justify-between mt-5 pt-4" style={{ borderTop: "1px solid hsl(var(--border))" }}>
                <span className="text-xs text-muted-foreground font-mono">
                  {(vulnPage - 1) * VULNS_PER_PAGE + 1}–{Math.min(vulnPage * VULNS_PER_PAGE, filtered.length)} of {filtered.length} vulnerabilities
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setVulnPage(p => Math.max(1, p - 1))}
                    disabled={vulnPage === 1}
                    className="btn-ghost-border p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: totalVulnPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalVulnPages || Math.abs(p - vulnPage) <= 1)
                    .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                      if (idx > 0 && (arr[idx - 1] as number) < p - 1) acc.push('...');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, idx) => p === '...' ? (
                      <span key={`dots-${idx}`} className="text-xs text-muted-foreground px-1">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setVulnPage(p as number)}
                        className="w-7 h-7 rounded-lg text-xs font-mono font-medium transition-all"
                        style={{
                          background: vulnPage === p ? 'hsl(var(--primary))' : 'transparent',
                          color: vulnPage === p ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                          border: vulnPage === p ? 'none' : '1px solid transparent',
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  <button
                    onClick={() => setVulnPage(p => Math.min(totalVulnPages, p + 1))}
                    disabled={vulnPage === totalVulnPages}
                    className="btn-ghost-border p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* CVE Dependency Results */}
      {((scanData as any).cveResults?.length > 0) && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Dependency CVEs</h2>
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-mono" style={{ background: 'rgba(37,99,235,0.15)', color: '#60A5FA', border: '1px solid rgba(37,99,235,0.3)' }}>
              {(scanData as any).cveResults.length}
            </span>
          </div>
          <div className="space-y-2">
            {(scanData as any).cveResults.map((cve: any, i: number) => {
              const sev = cve.severity as keyof typeof SEV_CONFIG;
              const cfg = SEV_CONFIG[sev] ?? SEV_CONFIG.low;
              return (
                <div key={i} className={`rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 border ${cfg.border} card-base`}>
                  <span className={`badge text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 shrink-0 ${cfg.color} ${cfg.bg} border ${cfg.border}`}>
                    {sev}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground font-mono">{cve.pkg}</span>
                      <span className="text-xs text-muted-foreground">v{cve.version}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(37,99,235,0.1)', color: '#60A5FA', border: '1px solid rgba(37,99,235,0.2)', fontFamily: 'monospace' }}>
                        {cve.cveId}
                      </span>
                      <span className="text-xs text-muted-foreground">{cve.ecosystem}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{cve.summary}</p>
                  </div>
                  {cve.fixedIn && (
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Fix in</div>
                      <div className="text-xs font-mono text-green-400 font-semibold">v{cve.fixedIn}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PageLayout>
  );
};

export default ResultsPage;
