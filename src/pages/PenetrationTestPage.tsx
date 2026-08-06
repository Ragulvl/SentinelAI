import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, Loader2, Target, Zap, CheckCircle, XCircle,
  Info, ArrowLeft, Download, Share2, Globe,
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

  useEffect(() => { if (resultId) loadExistingResult(resultId); }, [resultId]);

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
    if (!confirm("Warning: This executes active vulnerability scans. Only proceed on domains you own or are authorized to test. Continue?")) return;

    try {
      setTesting(true);
      setReport(null);
      const result = await websiteScanService.performPenetrationTest(url);
      setReport(result);
      toast({ title: "Penetration Test Complete", description: `Found ${result.vulnerabilitiesFound} vulnerabilities` });
    } catch (error: any) {
      if (error.response?.data?.requiresVerification) {
        toast({ title: "Domain Not Verified", description: error.response.data.message, variant: "destructive" });
        navigate("/domain-verification");
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

      {/* Warning banner */}
      <div className="mb-5 p-4 rounded-xl flex items-start gap-3"
        style={{ background: "hsl(0 84% 60% / 0.07)", border: "1px solid hsl(0 84% 60% / 0.25)" }}>
        <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground">Active Auditing Mode Warning</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            This executes active vulnerability checks including injection and path traversal.
            Only run on domains you own or have explicit authorization to test.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading test results...</p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Input form */}
          {viewMode === "new" && (
            <div className="card-elevated p-6 space-y-4 max-w-2xl">
              <h3 className="font-semibold text-foreground text-sm">Target Configuration</h3>
              <div>
                <label className="section-label block mb-2">Target URL</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="url" value={url} onChange={e => setUrl(e.target.value)}
                    disabled={testing} placeholder="https://example.com"
                    className="input-base pl-10 font-mono text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={handleTest} disabled={testing || !url.trim()}
                  className="btn-primary flex-1 justify-center"
                  style={{ background: testing ? undefined : "hsl(0 84% 60%)", boxShadow: "0 4px 24px hsl(0 84% 60% / 0.35)" }}>
                  {testing ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing...</> : <><Zap className="w-4 h-4" /> Start Penetration Test</>}
                </button>
                <button onClick={() => navigate("/domain-verification")} className="btn-secondary px-4">Verify Domain</button>
              </div>

              <div className="p-3.5 rounded-xl text-xs text-muted-foreground"
                style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
                <p className="font-medium text-foreground mb-2">Tests performed:</p>
                <div className="grid grid-cols-2 gap-1">
                  {["XSS (Cross-Site Scripting)", "SQL Injection", "Command Injection", "Path Traversal", "CSRF", "SSRF", "Open Redirect", "XXE", "Security Misconfigurations", "Session Management"].map(t => (
                    <span key={t} className="flex items-center gap-1"><span className="opacity-40">•</span>{t}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {report && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              {/* Summary */}
              <div className="card-elevated p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-foreground text-sm">Test Summary</h3>
                  <div className="flex gap-2">
                    <button onClick={handleShare} className="btn-ghost-border gap-2 text-xs py-1.5">
                      <Share2 className="w-3.5 h-3.5" /> Share
                    </button>
                    <button onClick={handleExportPDF} className="btn-ghost-border gap-2 text-xs py-1.5">
                      <Download className="w-3.5 h-3.5" /> PDF
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Tests Run", value: report.testsPerformed, color: "text-foreground" },
                    { label: "Vulnerabilities", value: report.vulnerabilitiesFound, color: "text-destructive" },
                    { label: "Risk Score", value: report.riskScore, color: report.riskScore > 50 ? "text-destructive" : "text-warning" },
                    { label: "Passed", value: report.testsPerformed - report.vulnerabilitiesFound, color: "text-success" },
                  ].map(s => (
                    <div key={s.label} className="text-center p-4 rounded-xl"
                      style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
                      <div className={`text-2xl font-black metric-number ${s.color}`}>{s.value}</div>
                      <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>

                {vulnerableResults.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
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
              </div>

              {/* Detailed results */}
              <div className="card-elevated p-5">
                <div className="flex items-center gap-2 mb-4 flex-wrap">
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
                              <h4 className="font-semibold text-foreground text-sm">{result.testName}</h4>
                              <span className={`badge text-[10px] ${result.vulnerable ? `${cfg.color} ${cfg.bg}` : "badge-success"}`}>
                                {result.vulnerable ? "VULNERABLE" : "SECURE"}
                              </span>
                              <span className={`badge text-[10px] badge-muted`}>{result.severity}</span>
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
