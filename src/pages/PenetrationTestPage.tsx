import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, Loader2, Target, Zap, CheckCircle, XCircle,
  Info, ArrowLeft, Download, Share2, Globe, Shield, Lock,
  ChevronRight, Activity, Bug, Eye, Database, Cpu, KeyRound, User, EyeOff,
  Sparkles, Link, Code2, Package, ChevronDown,
} from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import { websiteScanService, PenetrationTestReport } from "@/services/websiteScan.service";
import { useToast } from "@/hooks/use-toast";
import { API_ENDPOINTS } from "@/config/api";
import { AuthService } from "@/services/auth.service";
import { exportToPDF, downloadPDF, sharePDF } from "@/utils/pdfExport";

const SEVERITY_CONFIG = {
  critical: { color: "text-destructive", bg: "severity-bg-critical", icon: XCircle },
  high: { color: "severity-high", bg: "severity-bg-high", icon: AlertTriangle },
  medium: { color: "severity-medium", bg: "severity-bg-medium", icon: AlertTriangle },
  low: { color: "severity-low", bg: "severity-bg-low", icon: Info },
  info: { color: "text-muted-foreground", bg: "badge-muted", icon: Info },
};

const TEST_CATEGORIES = [
  { icon: Bug, label: "XSS (Cross-Site Scripting)", color: "#EF4444" },
  { icon: Database, label: "SQL Injection", color: "#F59E0B" },
  { icon: Cpu, label: "Command Injection", color: "#EF4444" },
  { icon: Globe, label: "Path Traversal", color: "#F59E0B" },
  { icon: Shield, label: "CSRF & SSRF", color: "#8B5CF6" },
  { icon: Eye, label: "Open Redirect", color: "#3B82F6" },
  { icon: Lock, label: "XXE Injection", color: "#EF4444" },
  { icon: Activity, label: "Security Misconfigurations", color: "#F59E0B" },
  { icon: Shield, label: "Session Management", color: "#10B981" },
  { icon: Globe, label: "HTTP Header Analysis", color: "#3B82F6" },
];

export default function PenetrationTestPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const resultId = searchParams.get("resultId");
  const [url, setUrl] = useState(searchParams.get("url") || "");
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<PenetrationTestReport | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"new" | "view">(resultId ? "view" : "new");
  const [authorized, setAuthorized] = useState(false);
  const [domainVerified, setDomainVerified] = useState<boolean | null>(null);
  const [checkingDomain, setCheckingDomain] = useState(true);
  const [verifiedDomainsList, setVerifiedDomainsList] = useState<string[]>([]);
  const [expandedFixes, setExpandedFixes] = useState<Set<number>>(new Set());
  const toggleFix = (i: number) => setExpandedFixes(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; });

  // Authenticated scan state
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoginUrl, setAuthLoginUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [authMode, setAuthMode] = useState<"credentials" | "token">("credentials");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => { if (resultId) loadExistingResult(resultId); }, [resultId]);

  // Fetch verified domains ONCE on mount (same as DomainVerificationPage)
  useEffect(() => {
    websiteScanService.getVerifiedDomains()
      .then(domains => {
        const verified = (Array.isArray(domains) ? domains : [])
          .filter((d: any) => d.verified === true)
          .map((d: any) => (d.domain ?? '').toLowerCase().trim());
        setVerifiedDomainsList(verified);
      })
      .catch(() => { setVerifiedDomainsList([]); })
      .finally(() => { setCheckingDomain(false); });
  }, []);

  // When URL changes, check synchronously against the cached list
  useEffect(() => {
    if (!url.trim() || !url.includes('.')) { setDomainVerified(null); return; }
    if (checkingDomain) return; // still loading the list
    try {
      const hostname = new URL(url.startsWith('http') ? url : `https://${url}`)
        .hostname.replace(/^www\./, '').toLowerCase();
      setDomainVerified(verifiedDomainsList.includes(hostname));
    } catch { setDomainVerified(null); }
  }, [url, verifiedDomainsList, checkingDomain]);


  const loadExistingResult = async (id: string) => {
    try {
      setLoading(true);
      const token = AuthService.getToken();
      const response = await fetch(API_ENDPOINTS.history.detail("penetration", id), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to load test result");
      const data = await response.json();
      const scan = data.scan;
      setReport({
        url: scan.url, testDate: scan.testDate,
        testsPerformed: scan.summary.totalTests,
        vulnerabilitiesFound: scan.summary.failed,
        riskScore: Math.round((scan.summary.failed / scan.summary.totalTests) * 100),
        results: scan.results.map((r: any) => ({
          testName: r.testName, category: r.category, vulnerable: !r.passed,
          severity: r.severity, description: r.description, evidence: r.evidence,
          payload: r.payload, recommendation: r.recommendation,
        })),
      });
      setUrl(scan.url);
    } catch {
      toast({ title: "Error", description: "Failed to load test result", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!url.trim()) {
      toast({ title: "URL required", description: "Please enter a URL to test", variant: "destructive" });
      return;
    }
    if (!authorized) {
      toast({ title: "Authorization required", description: "Please confirm you are authorized to test this domain.", variant: "destructive" });
      return;
    }
    if (domainVerified === false) {
      toast({ title: "Domain Not Verified", description: "Please verify domain ownership before running penetration tests.", variant: "destructive" });
      return;
    }

    try {
      setTesting(true);
      setReport(null);

      // Build credentials object if auth toggle is on
      const credentials = authEnabled
        ? authMode === "token"
          ? { token: authToken.trim() || undefined }
          : {
              username: authUsername.trim() || undefined,
              password: authPassword || undefined,
              loginUrl: authLoginUrl.trim() || undefined,
            }
        : undefined;

      const result = await websiteScanService.performPenetrationTest(url, credentials);
      setReport(result);
      toast({ title: "Penetration Test Complete", description: `Found ${result.vulnerabilitiesFound} vulnerabilities` });
    } catch (error: any) {
      if (error.response?.data?.requiresVerification) {
        setDomainVerified(false);
        toast({ title: "Domain Not Verified", description: error.response.data.message, variant: "destructive" });
      } else {
        toast({ title: "Test Failed", description: error.response?.data?.error || error.message || "Failed to perform penetration test", variant: "destructive" });
      }
    } finally {
      setTesting(false);
    }
  };

  const categories = report ? Array.from(new Set(report.results.map(r => r.category))) : [];
  const filteredResults = selectedCategory ? report?.results.filter(r => r.category === selectedCategory) : report?.results;
  const sortedResults = filteredResults ? [...filteredResults].sort((a, b) => {
    if (a.vulnerable && !b.vulnerable) return -1;
    if (!a.vulnerable && b.vulnerable) return 1;
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return (order[a.severity as keyof typeof order] || 4) - (order[b.severity as keyof typeof order] || 4);
  }) : [];
  const vulnerableResults = report?.results.filter(r => r.vulnerable) || [];

  const handleExportPDF = () => {
    if (!report) return;
    const vulnTests = report.results.filter(r => r.vulnerable);
    const safeTests = report.results.filter(r => !r.vulnerable);
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    vulnTests.sort((a, b) => (sevOrder[a.severity as keyof typeof sevOrder] || 4) - (sevOrder[b.severity as keyof typeof sevOrder] || 4));
    const doc = exportToPDF({
      title: "PENETRATION TEST REPORT", subtitle: report.url,
      metadata: { date: new Date(report.testDate).toLocaleString(), url: report.url, score: report.riskScore },
      sections: [
        { title: "Executive Summary", table: { headers: ["Metric", "Value"], rows: [
          ["Tests Performed", report.testsPerformed.toString()],
          ["Vulnerabilities Found", report.vulnerabilitiesFound.toString()],
          ["Risk Score", `${report.riskScore}/100`],
          ["Passed Tests", (report.testsPerformed - report.vulnerabilitiesFound).toString()],
        ]}},
        ...vulnTests.map(r => ({ title: `VULNERABILITY: ${r.testName}`, content: `Severity: ${r.severity.toUpperCase()}\nCategory: ${r.category}\n\nDescription:\n${r.description}`, list: [r.evidence && `Evidence:\n${r.evidence}`, r.payload && `Payload:\n${r.payload}`, `Recommendation:\n${r.recommendation}`].filter(Boolean) as string[] })),
        ...safeTests.map(r => ({ title: `${r.testName} — SECURE`, content: `Description: ${r.description}`, list: [`Recommendation: ${r.recommendation}`] })),
      ],
    });
    downloadPDF(doc, `pentest-${report.url.replace(/[^a-z0-9]/gi, "-")}-${Date.now()}.pdf`);
    toast({ title: "PDF Downloaded" });
  };

  const handleShare = async () => {
    if (!report) return;
    const doc = exportToPDF({ title: "Penetration Test Report", subtitle: report.url, metadata: { date: new Date(report.testDate).toLocaleString(), url: report.url, score: report.riskScore }, sections: [{ title: "Summary", content: `Tests: ${report.testsPerformed}, Vulnerabilities: ${report.vulnerabilitiesFound}` }] });
    const shared = await sharePDF(doc, `Pentest Report - ${report.url}`);
    toast({ title: shared ? "Shared" : "Downloaded", description: shared ? "Report shared" : "PDF downloaded instead" });
  };

  return (
    <PageLayout>
      <PageHeader
        title="Penetration Testing"
        description="Active security testing for verified domains — XSS, SQL injection, CSRF, path traversal, and more."
        breadcrumbs={[{ label: "Security Tools" }, { label: "Pentest" }]}
        actions={
          viewMode === "view" ? (
            <button onClick={() => navigate("/scan-history")} className="btn-ghost-border gap-2 text-xs">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to History
            </button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading test results...</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {viewMode === "new" && !report && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* ── Left: Config Form ──────────────────────────── */}
              <div className="lg:col-span-3 space-y-4">
                {/* Warning */}
                <div className="p-4 rounded-xl flex items-start gap-3"
                  style={{ background: "hsl(0 84% 60% / 0.07)", border: "1px solid hsl(0 84% 60% / 0.25)" }}>
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Active Auditing Mode</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Executes live vulnerability scans including injection and path traversal.
                      Only run on domains you own or have explicit authorization to test.
                    </p>
                  </div>
                </div>

                {/* Form */}
                <div className="card-elevated p-6 space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "hsl(0 84% 60% / 0.12)", border: "1px solid hsl(0 84% 60% / 0.25)" }}>
                      <Target className="w-4 h-4 text-destructive" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground text-sm">Target Configuration</h3>
                      <p className="text-xs text-muted-foreground">Configure the target you want to test</p>
                    </div>
                  </div>

                  <div>
                    <label className="section-label block mb-2">Target URL</label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <input
                        type="url" value={url} onChange={e => setUrl(e.target.value)}
                        disabled={testing} placeholder="https://example.com"
                        className="input-base pl-10 font-mono text-sm"
                        onKeyDown={e => e.key === "Enter" && handleTest()}
                      />
                    </div>

                    {/* Domain verification status */}
                    {url.trim() && !checkingDomain && domainVerified === false && (
                      <div className="mt-3 p-3 rounded-lg flex items-start gap-3"
                        style={{ background: "hsl(var(--destructive) / 0.08)", border: "1px solid hsl(var(--destructive) / 0.3)" }}>
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-destructive">Domain not verified</p>
                          <p className="text-xs text-muted-foreground mt-0.5">You must verify ownership before running penetration tests.</p>
                        </div>
                        <button onClick={() => navigate("/domain-verification")}
                          className="text-xs font-medium shrink-0 px-3 py-1.5 rounded-lg transition-colors"
                          style={{ background: "hsl(var(--destructive) / 0.15)", color: "hsl(var(--destructive))", border: "1px solid hsl(var(--destructive) / 0.3)" }}>
                          Verify Domain
                        </button>
                      </div>
                    )}
                    {url.trim() && !checkingDomain && domainVerified === true && (
                      <div className="mt-3 p-2.5 rounded-lg flex items-center gap-2"
                        style={{ background: "hsl(142 70% 45% / 0.08)", border: "1px solid hsl(142 70% 45% / 0.25)" }}>
                        <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "hsl(142 70% 45%)" }} />
                        <p className="text-xs font-medium" style={{ color: "hsl(142 70% 45%)" }}>Domain verified — ready to test</p>
                      </div>
                    )}
                    {url.trim() && checkingDomain && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Checking domain verification...
                      </div>
                    )}
                  </div>

                  {/* Authorization checkbox */}
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg transition-all"
                    style={{ background: authorized ? "hsl(0 84% 60% / 0.05)" : "hsl(var(--muted)/0.4)", border: `1px solid ${authorized ? "hsl(0 84% 60% / 0.3)" : "hsl(var(--border))"}` }}>
                    <input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)}
                      className="mt-0.5 accent-red-500 shrink-0" />
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      I confirm I am the <span className="text-foreground font-semibold">owner or authorized tester</span> of this domain.
                      I understand this executes active vulnerability scans including injection attacks.
                    </span>
                  </label>

                  {/* Authenticated Scan Toggle */}
                  <div className="rounded-xl overflow-hidden transition-all"
                    style={{ border: "1px solid hsl(var(--border))", background: "hsl(var(--muted)/0.3)" }}>
                    <label className="flex items-center gap-3 p-3 cursor-pointer select-none">
                      <div className={`relative w-9 h-5 rounded-full transition-colors ${authEnabled ? "bg-violet-500" : "bg-muted-foreground/30"}`}
                        onClick={() => setAuthEnabled(v => !v)}>
                        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${authEnabled ? "translate-x-4" : ""}`} />
                      </div>
                      <KeyRound className="w-4 h-4 text-violet-400" />
                      <span className="text-sm font-medium text-foreground">Authenticated Scan</span>
                      <span className="ml-auto text-xs text-muted-foreground">Test behind login</span>
                    </label>

                    <AnimatePresence>
                      {authEnabled && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                          className="overflow-hidden">
                          <div className="px-3 pb-3 space-y-3 border-t" style={{ borderColor: "hsl(var(--border))" }}>
                            {/* Mode toggle */}
                            <div className="flex gap-2 pt-3">
                              {(["credentials", "token"] as const).map(m => (
                                <button key={m} onClick={() => setAuthMode(m)}
                                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${authMode === m ? "bg-violet-500 text-white" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                                  {m === "credentials" ? "Username / Password" : "Bearer Token"}
                                </button>
                              ))}
                            </div>

                            {authMode === "credentials" ? (
                              <div className="space-y-2">
                                <div className="relative">
                                  <User className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                                  <input value={authUsername} onChange={e => setAuthUsername(e.target.value)}
                                    placeholder="Username or email"
                                    className="w-full bg-background border rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                                    style={{ borderColor: "hsl(var(--border))" }} />
                                </div>
                                <div className="relative">
                                  <Lock className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                                  <input value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Password"
                                    className="w-full bg-background border rounded-lg pl-8 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                                    style={{ borderColor: "hsl(var(--border))" }} />
                                  <button type="button" onClick={() => setShowPassword(v => !v)}
                                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                                <input value={authLoginUrl} onChange={e => setAuthLoginUrl(e.target.value)}
                                  placeholder="Login URL (optional — auto-detected)"
                                  className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                                  style={{ borderColor: "hsl(var(--border))" }} />
                                <p className="text-xs text-muted-foreground">
                                  Credentials are used <span className="text-foreground">only in-memory</span> during the scan and never stored.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <input value={authToken} onChange={e => setAuthToken(e.target.value)}
                                  placeholder="Bearer token / JWT"
                                  className="w-full bg-background border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                                  style={{ borderColor: "hsl(var(--border))" }} />
                                <p className="text-xs text-muted-foreground">
                                  Token is used <span className="text-foreground">only in-memory</span> during the scan and never stored.
                                </p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={handleTest} disabled={testing || !url.trim() || !authorized}
                      className="btn-primary flex-1 justify-center py-2.5"
                      style={{ background: testing || !authorized ? undefined : "hsl(0 84% 60%)", boxShadow: !testing && authorized ? "0 4px 24px hsl(0 84% 60% / 0.35)" : undefined }}>
                      {testing ? <><Loader2 className="w-4 h-4 animate-spin" /> Running tests...</> : <><Zap className="w-4 h-4" /> Start Penetration Test</>}
                    </button>
                    <button onClick={() => navigate("/domain-verification")} className="btn-secondary px-4 shrink-0">
                      <Shield className="w-4 h-4" />
                    </button>
                  </div>

                  {testing && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="p-4 rounded-xl space-y-2"
                      style={{ background: "hsl(0 84% 60% / 0.05)", border: "1px solid hsl(0 84% 60% / 0.15)" }}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                        <span className="text-xs font-medium text-foreground">Running AI-powered penetration tests...</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Running 42 security tests + AI bundle analysis, endpoint discovery, and vulnerability chaining. This may take 2-4 minutes.</p>
                      <div className="h-1 rounded-full overflow-hidden mt-2" style={{ background: "hsl(var(--muted))" }}>
                        <motion.div className="h-full rounded-full"
                          style={{ background: "hsl(0 84% 60%)" }}
                          animate={{ width: ["10%", "85%"] }}
                          transition={{ duration: 220, ease: "linear" }} />
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* ── Right: Info Panel ──────────────────────────── */}
              <div className="lg:col-span-2 space-y-4">
                <div className="card-elevated p-5 space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold text-foreground text-sm">Tests Performed</h3>
                  </div>
                  <div className="space-y-2">
                    {TEST_CATEGORIES.map((test, i) => {
                      const Icon = test.icon;
                      return (
                        <motion.div key={test.label}
                          initial={{ opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="flex items-center gap-3 p-2.5 rounded-lg group"
                          style={{ background: "hsl(var(--muted) / 0.4)", border: "1px solid hsl(var(--border))" }}>
                          <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                            style={{ background: `${test.color}18` }}>
                            <Icon className="w-3 h-3" style={{ color: test.color }} />
                          </div>
                          <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">{test.label}</span>
                          <ChevronRight className="w-3 h-3 text-muted-foreground/40 ml-auto" />
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                <div className="card-elevated p-5 space-y-3">
                  <h3 className="font-semibold text-foreground text-sm">Risk Levels</h3>
                  {[
                    { label: "Critical", color: "#EF4444", desc: "Immediate exploitation possible" },
                    { label: "High", color: "#F97316", desc: "Significant security risk" },
                    { label: "Medium", color: "#F59E0B", desc: "Moderate impact potential" },
                    { label: "Low", color: "#3B82F6", desc: "Minor security concern" },
                  ].map(level => (
                    <div key={level.label} className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: level.color }} />
                      <span className="text-xs font-medium text-foreground w-16 shrink-0">{level.label}</span>
                      <span className="text-xs text-muted-foreground">{level.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {report && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              {/* Run new test button */}
              <div className="flex items-center justify-between">
                <button onClick={() => { setReport(null); setUrl(""); }}
                  className="btn-ghost-border gap-2 text-xs">
                  <ArrowLeft className="w-3.5 h-3.5" /> New Test
                </button>
                <div className="flex gap-2">
                  <button onClick={handleShare} className="btn-ghost-border gap-2 text-xs py-1.5">
                    <Share2 className="w-3.5 h-3.5" /> Share
                  </button>
                  <button onClick={handleExportPDF} className="btn-ghost-border gap-2 text-xs py-1.5">
                    <Download className="w-3.5 h-3.5" /> PDF
                  </button>
                </div>
              </div>

              {/* Summary grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Tests Run", value: report.testsPerformed, color: "text-foreground", bg: "hsl(var(--muted) / 0.5)" },
                  { label: "Vulnerabilities", value: report.vulnerabilitiesFound, color: "text-destructive", bg: "hsl(0 84% 60% / 0.08)" },
                  { label: "Risk Score", value: `${report.riskScore}/100`, color: report.riskScore > 50 ? "text-destructive" : "text-warning", bg: "hsl(var(--muted) / 0.5)" },
                  { label: "Passed Tests", value: report.testsPerformed - report.vulnerabilitiesFound, color: "text-success", bg: "hsl(var(--success) / 0.08)" },
                ].map(s => (
                  <div key={s.label} className="text-center p-5 rounded-xl"
                    style={{ background: s.bg, border: "1px solid hsl(var(--border))" }}>
                    <div className={`text-3xl font-black metric-number ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-muted-foreground mt-1.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {vulnerableResults.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(SEVERITY_CONFIG).map(([sev, cfg]) => {
                    const count = vulnerableResults.filter(r => r.severity === sev).length;
                    if (!count) return null;
                    return (
                      <span key={sev} className={`badge ${cfg.color} ${cfg.bg}`}>
                        {count} {sev}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* AI Attack Chains */}
              {report.attackChains && report.attackChains.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl p-5 space-y-3"
                  style={{ background: "hsl(280 84% 60% / 0.06)", border: "1px solid hsl(280 84% 60% / 0.25)" }}>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" style={{ color: "hsl(280 84% 70%)" }} />
                    <h3 className="font-semibold text-sm" style={{ color: "hsl(280 84% 70%)" }}>AI Attack Chains</h3>
                    <span className="text-xs text-muted-foreground">— vulnerabilities that can be chained together</span>
                  </div>
                  <div className="space-y-3">
                    {report.attackChains.map((chain, ci) => (
                      <div key={ci} className="rounded-lg p-3 space-y-2"
                        style={{ background: "hsl(var(--background))", border: "1px solid hsl(280 84% 60% / 0.2)" }}>
                        <div className="flex items-center gap-2">
                          <span className={`badge text-[10px] ${
                            chain.severity === 'critical' ? 'text-destructive severity-bg-critical' :
                            chain.severity === 'high' ? 'severity-high severity-bg-high' : 'severity-medium severity-bg-medium'
                          }`}>{chain.severity}</span>
                          <span className="text-sm font-semibold text-foreground">{chain.title}</span>
                        </div>
                        <div className="space-y-1">
                          {chain.steps.map((step, si) => (
                            <p key={si} className="text-xs text-muted-foreground flex gap-2">
                              <span className="shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold mt-0.5">{si + 1}</span>
                              {step}
                            </p>
                          ))}
                        </div>
                        <p className="text-xs font-medium" style={{ color: "hsl(280 84% 70%)" }}>Impact: {chain.impact}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* JS Bundle Findings */}
              {((report.jsBundleFindings && report.jsBundleFindings.length > 0) || (report.discoveredEndpoints && report.discoveredEndpoints.length > 0)) && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl p-5 space-y-3"
                  style={{ background: "hsl(40 84% 60% / 0.06)", border: "1px solid hsl(40 84% 60% / 0.25)" }}>
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4" style={{ color: "hsl(40 84% 70%)" }} />
                    <h3 className="font-semibold text-sm" style={{ color: "hsl(40 84% 70%)" }}>JS Bundle Analysis</h3>
                    <span className="text-xs text-muted-foreground">— AI-scanned your JavaScript bundles</span>
                  </div>
                  {report.jsBundleFindings && report.jsBundleFindings.length > 0 && (
                    <div>
                      <p className="section-label mb-2">Secrets / Credentials Found</p>
                      <div className="space-y-1">
                        {report.jsBundleFindings.map((s, si) => (
                          <div key={si} className="flex items-start gap-2 text-xs">
                            <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                            <span className="text-foreground">{s}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {report.discoveredEndpoints && report.discoveredEndpoints.length > 0 && (
                    <div>
                      <p className="section-label mb-2">Hidden Endpoints Discovered</p>
                      <div className="flex flex-wrap gap-1.5">
                        {report.discoveredEndpoints.map((ep, ei) => (
                          <div key={ei} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono"
                            style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
                            <Link className="w-3 h-3 text-muted-foreground" />
                            {ep}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Detailed results */}
              <div className="card-elevated p-5">
                <div className="flex items-center gap-2 mb-5 flex-wrap">
                  <h3 className="font-semibold text-foreground text-sm mr-2">Detailed Results</h3>
                  {[{ key: null, label: `All (${report.results.length})` }, ...categories.map(c => ({ key: c, label: `${c} (${report.results.filter(r => r.category === c).length})` }))].map(f => (
                    <button key={f.key ?? "all"} onClick={() => setSelectedCategory(f.key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${selectedCategory === f.key ? "bg-primary/10 text-primary border border-primary/25" : "text-muted-foreground hover:text-foreground border border-transparent hover:border-border"}`}>
                      {f.label}
                    </button>
                  ))}
                </div>

                  <div className="space-y-3">
                  {sortedResults.map((result, i) => {
                    const cfg = SEVERITY_CONFIG[result.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.info;
                    const Icon = result.vulnerable ? cfg.icon : CheckCircle;
                    return (
                      <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                        className={`rounded-xl p-4 border ${result.vulnerable ? `${cfg.bg}` : ""}`}
                        style={{ borderColor: result.vulnerable ? undefined : "hsl(var(--success) / 0.25)", background: result.vulnerable ? undefined : "hsl(var(--success) / 0.06)" }}>
                        <div className="flex items-start gap-3">
                          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${result.vulnerable ? cfg.color : "text-success"}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              <h4 className="font-semibold text-foreground text-sm">{result.testName.replace('[AI] ', '')}</h4>
                              <span className={`badge text-[10px] ${result.vulnerable ? `${cfg.color} ${cfg.bg}` : "badge-success"}`}>
                                {result.vulnerable ? "VULNERABLE" : "SECURE"}
                              </span>
                              <span className="badge text-[10px] badge-muted">{result.severity}</span>
                              {result.aiEnhanced && (
                                <span className="flex items-center gap-1 badge text-[10px] px-1.5" style={{ background: "hsl(280 84% 60% / 0.12)", color: "hsl(280 84% 70%)", border: "1px solid hsl(280 84% 60% / 0.3)" }}>
                                  <Sparkles className="w-2.5 h-2.5" /> AI
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed mb-2">{result.description}</p>
                            {result.evidence && (
                              <div className="mb-2">
                                <p className="section-label mb-1">Evidence</p>
                                <code className="block text-xs terminal-bg p-2 rounded-lg">{result.evidence}</code>
                              </div>
                            )}
                            {result.payload && (
                              <div className="mb-2">
                                <p className="section-label mb-1">Payload</p>
                                <code className="block text-xs terminal-bg p-2 rounded-lg break-all">{result.payload}</code>
                              </div>
                            )}
                            <div className="mt-2 p-2.5 rounded-lg" style={{ background: "hsl(var(--muted) / 0.5)" }}>
                              <p className="section-label mb-1">Recommendation</p>
                              <p className="text-xs text-muted-foreground leading-relaxed">{result.recommendation}</p>
                            </div>
                            {result.fix && (
                              <div className="mt-2">
                                <button onClick={() => toggleFix(i)}
                                  className="flex items-center gap-1.5 text-xs font-medium hover:opacity-80 transition-opacity"
                                  style={{ color: "hsl(280 84% 70%)" }}>
                                  <Code2 className="w-3.5 h-3.5" />
                                  View AI-Generated Fix
                                  <ChevronDown className={`w-3 h-3 transition-transform ${expandedFixes.has(i) ? 'rotate-180' : ''}`} />
                                </button>
                                <AnimatePresence>
                                  {expandedFixes.has(i) && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                      className="overflow-hidden">
                                      <pre className="mt-2 text-xs terminal-bg p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-words"
                                        style={{ border: "1px solid hsl(280 84% 60% / 0.2)" }}>{result.fix}</pre>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </PageLayout>
  );
}
