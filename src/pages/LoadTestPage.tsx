import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle, Loader2, Activity, Zap, TrendingUp,
  ArrowLeft, Download, Share2, Globe, Info, CheckCircle,
  XCircle, Users, Clock, BarChart3, Gauge, Shield,
  ChevronRight, Timer, Cpu,
} from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import { ApiClient } from "@/utils/api";
import { websiteScanService } from "@/services/websiteScan.service";
import { useToast } from "@/hooks/use-toast";
import { API_ENDPOINTS } from "@/config/api";
import { exportToPDF, downloadPDF, sharePDF } from "@/utils/pdfExport";

interface LoadTestResult {
  url: string;
  testDate: string;
  duration: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  requestsPerSecond: number;
  errors: Array<{ status: number; count: number; message: string }>;
  recommendations: string[];
}

const PremiumSlider = ({
  value, onChange, min, max, step, label, maxLabel, icon: Icon, color = "#5B6CFF",
}: {
  value: number; onChange: (v: number) => void; min: number; max: number; step: number;
  label: string; maxLabel?: string; icon?: React.ElementType; color?: string;
}) => {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
          <label className="text-xs font-medium text-foreground">{label}</label>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tabular-nums" style={{ color }}>{value}</span>
          {maxLabel && <span className="text-[10px] text-muted-foreground">{maxLabel}</span>}
        </div>
      </div>
      <div className="relative h-2 rounded-full" style={{ background: "hsl(var(--muted))" }}>
        <div className="absolute left-0 top-0 h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ WebkitAppearance: "none" }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-lg transition-all"
          style={{ left: `calc(${pct}% - 8px)`, background: color }} />
      </div>
    </div>
  );
};

export default function LoadTestPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const resultId = searchParams.get("resultId");
  const [url, setUrl] = useState(searchParams.get("url") || "");
  const [duration, setDuration] = useState(30);
  const [concurrentUsers, setConcurrentUsers] = useState(10);
  const [requestsPerSecond, setRequestsPerSecond] = useState(10);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LoadTestResult | null>(null);
  const [resilienceResult, setResilienceResult] = useState<any>(null);
  const [testType, setTestType] = useState<"load" | "resilience">("load");
  const [viewMode] = useState<"new" | "view">(resultId ? "view" : "new");
  const [domainVerified, setDomainVerified] = useState<boolean | null>(null);
  const [checkingDomain, setCheckingDomain] = useState(true); // true while initial fetch runs
  const [verifiedDomainsList, setVerifiedDomainsList] = useState<string[]>([]);

  // ── Live terminal state ──────────────────────────────────────────────────
  type TermLine = { text: string; color: string };
  const [termLines, setTermLines] = useState<TermLine[]>([]);
  const [liveStats, setLiveStats] = useState({ sent: 0, successRate: 0, avgRT: 0, rps: 0, elapsed: 0, total: 0 });
  const termRef = useRef<HTMLDivElement>(null);
  const addLine = (text: string, color = 'hsl(0 0% 70%)') =>
    setTermLines(prev => [...prev.slice(-200), { text, color }]); // keep last 200 lines
  const scrollTerm = () => setTimeout(() => termRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 30);

  useEffect(() => { if (resultId) loadExistingResult(resultId); }, [resultId]);

  // Fetch all verified domains ONCE on mount (same as DomainVerificationPage)
  useEffect(() => {
    websiteScanService.getVerifiedDomains()
      .then(domains => {
        // getVerifiedDomains returns all domains (verified + pending); filter to verified only
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
      // Use ApiClient — sends httpOnly cookie automatically (credentials: include)
      const data = await ApiClient.get<{ scan: any }>(API_ENDPOINTS.history.detail("load", id).replace(/^.*\/api/, '/api'));
      const scan = data.scan;
      setResult({
        url: scan.url, testDate: scan.testDate, duration: scan.results.duration,
        totalRequests: scan.results.totalRequests, successfulRequests: scan.results.successfulRequests,
        failedRequests: scan.results.failedRequests, rateLimitedRequests: scan.results.rateLimitedRequests || 0,
        averageResponseTime: scan.results.averageResponseTime, minResponseTime: scan.results.minResponseTime,
        maxResponseTime: scan.results.maxResponseTime, requestsPerSecond: scan.results.requestsPerSecond,
        errors: scan.results.errors || [], recommendations: scan.results.recommendations || [],
      });
      setUrl(scan.url);
    } catch {
      toast({ title: "Error", description: "Failed to load test result", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleLoadTest = async () => {
    if (!url.trim()) { toast({ title: "URL required", variant: "destructive" }); return; }
    if (domainVerified === false) {
      toast({ title: "Domain Not Verified", description: "Please verify domain ownership first.", variant: "destructive" });
      return;
    }
    const estimated = concurrentUsers * requestsPerSecond * duration;
    if (!confirm(`This will send ~${estimated} requests to the target. Proceed?`)) return;

    setTesting(true); setResult(null); setTermLines([]);
    setLiveStats({ sent: 0, successRate: 0, avgRT: 0, rps: 0, elapsed: 0, total: duration });

    const baseUrl = url.startsWith('http') ? url : `https://${url}`;
    const sseParams = new URLSearchParams({
      url: baseUrl,
      duration: String(duration),
      concurrentUsers: String(concurrentUsers),
      requestsPerSecond: String(requestsPerSecond),
    });
    const sseUrl = `/api/website-scan/loadtest/stream?${sseParams}`;
    const es = new EventSource(sseUrl, { withCredentials: true });

    const finish = () => { setTesting(false); es.close(); scrollTerm(); };

    es.addEventListener('connected', () => {
      addLine(`$ sentinel-loadtest --url ${baseUrl}`, 'hsl(145 60% 55%)');
      addLine(`$ config: ${concurrentUsers} users · ${requestsPerSecond} req/s · ${duration}s`, 'hsl(145 60% 55%)');
      addLine('  ─────────────────────────────────────────', 'hsl(0 0% 30%)');
      scrollTerm();
    });

    es.addEventListener('progress', (e: Event) => {
      const d = JSON.parse((e as MessageEvent).data);
      setLiveStats({ sent: d.requestsSent, successRate: d.successRate, avgRT: d.avgResponseTime, rps: d.currentRPS, elapsed: d.elapsed, total: d.totalDuration });
      // Color-code statuses in the batch
      const statuses = (d.lastStatuses as number[]);
      const ok = statuses.filter(s => s >= 200 && s < 400).length;
      const warn = statuses.filter(s => s === 429).length;
      const err = statuses.filter(s => s === 0 || s >= 500).length;
      const statusStr = statuses.slice(0, 12).map(s =>
        s >= 200 && s < 400 ? `\x1b[32m${s}\x1b[0m` : s === 429 ? `\x1b[33m${s}\x1b[0m` : `\x1b[31m${s}\x1b[0m`
      ).join(' ');
      const batchColor = err > 0 ? '#ef4444' : warn > 0 ? '#f97316' : 'hsl(145 60% 55%)';
      const tick = String(d.elapsed).padStart(3);
      const lineText = `  [${tick}s] batch=${statuses.length} ✓${ok} ⚡${warn} ✗${err}  avg=${d.avgResponseTime}ms  rps=${d.currentRPS}`;
      addLine(lineText, batchColor);
      scrollTerm();
    });

    es.addEventListener('done', (e: Event) => {
      const r = JSON.parse((e as MessageEvent).data) as LoadTestResult;
      setResult(r);
      const sr = r.totalRequests > 0 ? ((r.successfulRequests / r.totalRequests) * 100).toFixed(1) : '0.0';
      addLine('  ─────────────────────────────────────────', 'hsl(0 0% 30%)');
      addLine(`✔ Test complete — ${r.totalRequests} requests sent`, 'hsl(145 60% 55%)');
      addLine(`  Success: ${sr}%  Avg: ${r.averageResponseTime}ms  Min: ${r.minResponseTime}ms  Max: ${r.maxResponseTime}ms`, 'hsl(0 0% 70%)');
      addLine(`  Rate-limited: ${r.rateLimitedRequests}  Failed: ${r.failedRequests}`, 'hsl(0 0% 60%)');
      toast({ title: "Load Test Complete", description: `${r.totalRequests} requests · ${sr}% success` });
      finish();
    });

    es.addEventListener('error', (e: Event) => {
      const msg = (e as MessageEvent).data ? JSON.parse((e as MessageEvent).data)?.message : 'Connection error';
      addLine(`✗ Error: ${msg || 'Load test failed'}`, '#ef4444');
      if (msg === 'Domain not verified') setDomainVerified(false);
      toast({ title: "Test Failed", description: msg || 'Load test failed', variant: "destructive" });
      finish();
    });

    es.onerror = () => {
      if (!result) {
        addLine('✗ Stream disconnected', '#ef4444');
        finish();
      }
    };
  };

  const handleResilienceTest = async () => {
    if (!url.trim()) { toast({ title: "URL required", variant: "destructive" }); return; }
    if (domainVerified === false) {
      toast({ title: "Domain Not Verified", description: "Please verify domain ownership first.", variant: "destructive" });
      return;
    }
    try {
      setTesting(true);
      setResilienceResult(null);
      const response: any = await ApiClient.post("/api/website-scan/test-resilience", { url });
      setResilienceResult(response);
      toast({ title: "Resilience Test Complete", description: `Max concurrent users: ${response.maxConcurrentUsers}` });
    } catch (error: any) {
      if (error.response?.data?.requiresVerification) {
        setDomainVerified(false);
        toast({ title: "Domain Not Verified", description: error.response.data.message, variant: "destructive" });
      } else {
        toast({ title: "Test Failed", description: error.response?.data?.error || "Failed to test resilience", variant: "destructive" });
      }
    } finally { setTesting(false); }
  };

  const successRate = result ? (result.successfulRequests / result.totalRequests) * 100 : 0;
  const estimatedRequests = concurrentUsers * requestsPerSecond * duration;

  const handleExportPDF = () => {
    if (!result) return;
    const doc = exportToPDF({
      title: "Load Test Report", subtitle: result.url,
      metadata: { date: new Date(result.testDate).toLocaleString(), url: result.url },
      sections: [
        { title: "Configuration", table: { headers: ["Parameter", "Value"], rows: [["Duration", `${result.duration}s`], ["Total Requests", result.totalRequests.toString()], ["Req/Second", result.requestsPerSecond.toString()]] } },
        { title: "Results", table: { headers: ["Metric", "Value"], rows: [["Success Rate", `${successRate.toFixed(1)}%`], ["Avg Response", `${result.averageResponseTime}ms`], ["Min Response", `${result.minResponseTime}ms`], ["Max Response", `${result.maxResponseTime}ms`]] } },
        ...(result.recommendations.length > 0 ? [{ title: "Recommendations", list: result.recommendations }] : []),
      ],
    });
    downloadPDF(doc, `loadtest-${result.url.replace(/[^a-z0-9]/gi, "-")}-${Date.now()}.pdf`);
    toast({ title: "PDF Downloaded" });
  };

  const handleShare = async () => {
    if (!result) return;
    const doc = exportToPDF({ title: "Load Test Report", subtitle: result.url, metadata: { date: new Date(result.testDate).toLocaleString(), url: result.url }, sections: [{ title: "Summary", content: `Success Rate: ${successRate.toFixed(1)}%, Avg: ${result.averageResponseTime}ms` }] });
    const shared = await sharePDF(doc, `Load Test - ${result.url}`);
    toast({ title: shared ? "Shared" : "Downloaded" });
  };

  return (
    <PageLayout>
      <PageHeader
        title="Load & Stress Testing"
        description="Test your site's performance capacity, response times, and resilience under load."
        breadcrumbs={[{ label: "Security Tools" }, { label: "Load Testing" }]}
        actions={viewMode === "view" ? (
          <button onClick={() => navigate("/scan-history")} className="btn-ghost-border gap-2 text-xs">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to History
          </button>
        ) : undefined}
      />

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          {viewMode === "new" && !result && !resilienceResult && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* ── Left: Config ───────────────────────────────── */}
              <div className="lg:col-span-3 space-y-4">
                {/* Info banner */}
                <div className="p-4 rounded-xl flex items-start gap-3"
                  style={{ background: "hsl(234 100% 68% / 0.06)", border: "1px solid hsl(234 100% 68% / 0.2)" }}>
                  <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Controlled Capacity Evaluation</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Identify bottlenecks and evaluate response thresholds safely.
                      Runs within predefined rate limits against verified targets only.
                    </p>
                  </div>
                </div>

                <div className="card-elevated p-6 space-y-6">
                  {/* URL input */}
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: "hsl(234 100% 68% / 0.12)", border: "1px solid hsl(234 100% 68% / 0.25)" }}>
                        <BarChart3 className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground text-sm">Test Configuration</h3>
                        <p className="text-xs text-muted-foreground">Set your target and load parameters</p>
                      </div>
                    </div>

                    <label className="section-label block mb-2">Target URL</label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <input type="url" value={url} onChange={e => setUrl(e.target.value)}
                        disabled={testing} placeholder="https://example.com"
                        className="input-base pl-10 font-mono text-sm" />
                    </div>

                    {/* Domain verification status */}
                    {url.trim() && !checkingDomain && domainVerified === false && (
                      <div className="mt-3 p-3 rounded-lg flex items-start gap-3"
                        style={{ background: "hsl(var(--destructive) / 0.08)", border: "1px solid hsl(var(--destructive) / 0.3)" }}>
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-destructive">Domain not verified</p>
                          <p className="text-xs text-muted-foreground mt-0.5">You must verify ownership of this domain before running load tests.</p>
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
                        style={{ background: "hsl(var(--success) / 0.08)", border: "1px solid hsl(var(--success) / 0.25)" }}>
                        <CheckCircle className="w-3.5 h-3.5 text-success shrink-0" />
                        <p className="text-xs text-success font-medium">Domain verified — ready to test</p>
                      </div>
                    )}
                    {url.trim() && checkingDomain && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Checking domain verification...
                      </div>
                    )}
                  </div>

                  {/* Test type tabs */}
                  <div className="flex items-center p-1 rounded-xl gap-1"
                    style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
                    {[
                      { key: "load", label: "Load Test", icon: Zap, desc: "Sustained load" },
                      { key: "resilience", label: "Resilience", icon: TrendingUp, desc: "Breaking point" },
                    ].map(tab => {
                      const Icon = tab.icon;
                      return (
                        <button key={tab.key} onClick={() => setTestType(tab.key as any)}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${testType === tab.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                          <Icon className="w-3.5 h-3.5" /> {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  {testType === "load" ? (
                    <div className="space-y-6">
                      <PremiumSlider value={duration} onChange={setDuration} min={10} max={60} step={5}
                        label="Duration" maxLabel="max 60s" icon={Timer} color="#5B6CFF" />
                      <PremiumSlider value={concurrentUsers} onChange={setConcurrentUsers} min={1} max={100} step={1}
                        label="Concurrent Users" maxLabel="max 100" icon={Users} color="#7F5AF0" />
                      <PremiumSlider value={requestsPerSecond} onChange={setRequestsPerSecond} min={1} max={50} step={1}
                        label="Requests / Second" maxLabel="max 50" icon={Cpu} color="#00D4FF" />

                      {/* Estimated load display */}
                      <div className="p-4 rounded-xl flex items-center justify-between"
                        style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
                        <div>
                          <p className="text-xs text-muted-foreground">Estimated total requests</p>
                          <p className="text-2xl font-black metric-number text-foreground mt-0.5">
                            ~{estimatedRequests.toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">at peak</p>
                          <p className="text-sm font-semibold text-primary">{requestsPerSecond} req/s</p>
                        </div>
                      </div>

                      <button onClick={handleLoadTest} disabled={testing || !url.trim()}
                        className="btn-primary w-full justify-center py-3 text-sm">
                        {testing ? <><Loader2 className="w-4 h-4 animate-spin" /> Running test...</> : <><Zap className="w-4 h-4" /> Start Load Test</>}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl space-y-2"
                        style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
                        <p className="text-sm font-medium text-foreground">Incremental Load Test</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Gradually increases concurrent users until the system reaches its breaking point,
                          identifying max throughput capacity and degradation patterns.
                        </p>
                      </div>
                      <button onClick={handleResilienceTest} disabled={testing || !url.trim()}
                        className="btn-primary w-full justify-center py-3 text-sm">
                        {testing ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing...</> : <><TrendingUp className="w-4 h-4" /> Test Resilience</>}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Right: Terminal / Info Panel ───────────────── */}
              <div className="lg:col-span-2 space-y-4">
                {testing || termLines.length > 0 ? (
                  /* ── Live Terminal ────────────────────────────── */
                  <div className="card-elevated overflow-hidden" style={{ border: '1px solid hsl(145 60% 35% / 0.4)' }}>
                    {/* Terminal header */}
                    <div className="flex items-center gap-2 px-4 py-3" style={{ background: 'hsl(0 0% 8%)', borderBottom: '1px solid hsl(0 0% 15%)' }}>
                      <div className="flex gap-1.5">
                        <span className="w-3 h-3 rounded-full" style={{ background: '#FF5F57' }} />
                        <span className="w-3 h-3 rounded-full" style={{ background: '#FEBC2E' }} />
                        <span className="w-3 h-3 rounded-full" style={{ background: '#28C840' }} />
                      </div>
                      <span className="text-xs font-mono ml-2" style={{ color: 'hsl(0 0% 55%)' }}>
                        sentinel-loadtest
                      </span>
                      {testing && <Loader2 className="w-3 h-3 animate-spin ml-auto" style={{ color: 'hsl(145 60% 55%)' }} />}
                    </div>

                    {/* Progress bar */}
                    {testing && liveStats.total > 0 && (
                      <div className="px-4 py-2" style={{ background: 'hsl(0 0% 6%)' }}>
                        <div className="flex justify-between text-xs font-mono mb-1" style={{ color: 'hsl(0 0% 45%)' }}>
                          <span>{liveStats.elapsed}s elapsed</span>
                          <span>{liveStats.total}s total</span>
                        </div>
                        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'hsl(0 0% 15%)' }}>
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min((liveStats.elapsed / liveStats.total) * 100, 100)}%`, background: 'linear-gradient(90deg, hsl(145 60% 45%), hsl(190 90% 50%))' }} />
                        </div>
                      </div>
                    )}

                    {/* Live stats grid */}
                    {(testing || liveStats.sent > 0) && (
                      <div className="grid grid-cols-2 gap-px" style={{ background: 'hsl(0 0% 12%)', borderBottom: '1px solid hsl(0 0% 15%)' }}>
                        {[
                          { label: 'SENT', value: liveStats.sent.toLocaleString(), color: 'hsl(210 80% 65%)' },
                          { label: 'SUCCESS', value: `${liveStats.successRate.toFixed(1)}%`, color: liveStats.successRate >= 95 ? 'hsl(145 60% 55%)' : liveStats.successRate >= 80 ? '#f97316' : '#ef4444' },
                          { label: 'AVG RT', value: `${liveStats.avgRT}ms`, color: liveStats.avgRT < 500 ? 'hsl(145 60% 55%)' : liveStats.avgRT < 2000 ? '#f97316' : '#ef4444' },
                          { label: 'RPS', value: String(liveStats.rps), color: 'hsl(0 0% 70%)' },
                        ].map(s => (
                          <div key={s.label} className="px-3 py-2" style={{ background: 'hsl(0 0% 7%)' }}>
                            <p className="text-xs font-mono" style={{ color: 'hsl(0 0% 35%)' }}>{s.label}</p>
                            <p className="text-sm font-mono font-bold" style={{ color: s.color }}>{s.value}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Terminal output */}
                    <div ref={termRef} className="h-64 overflow-y-auto p-4 font-mono text-xs space-y-0.5"
                      style={{ background: 'hsl(0 0% 5%)', scrollbarWidth: 'thin', scrollbarColor: 'hsl(0 0% 20%) transparent' }}>
                      {termLines.map((line, i) => (
                        <div key={i} style={{ color: line.color, lineHeight: '1.6' }}>{line.text}</div>
                      ))}
                      {testing && (
                        <div style={{ color: 'hsl(145 60% 55%)' }}>
                          <span className="animate-pulse">▋</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="card-elevated p-5 space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Gauge className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold text-foreground text-sm">What We Measure</h3>
                  </div>
                  {[
                    { icon: Clock, label: "Response Times", desc: "Min / Avg / Max latency", color: "#5B6CFF" },
                    { icon: CheckCircle, label: "Success Rate", desc: "% of successful requests", color: "#22C55E" },
                    { icon: XCircle, label: "Failure Analysis", desc: "Error codes & frequency", color: "#EF4444" },
                    { icon: Users, label: "Concurrency", desc: "Peak user capacity", color: "#7F5AF0" },
                    { icon: Activity, label: "Throughput", desc: "Requests per second", color: "#00D4FF" },
                    { icon: Shield, label: "Rate Limits", desc: "429 detection & patterns", color: "#F59E0B" },
                  ].map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <motion.div key={item.label}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-center gap-3 p-2.5 rounded-lg"
                        style={{ background: "hsl(var(--muted) / 0.4)", border: "1px solid hsl(var(--border))" }}>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: `${item.color}18` }}>
                          <Icon className="w-3.5 h-3.5" style={{ color: item.color }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground">{item.label}</p>
                          <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                        </div>
                        <ChevronRight className="w-3 h-3 text-muted-foreground/40 ml-auto shrink-0" />
                      </motion.div>
                    );
                  })}
                </div>

                {/* Current config preview */}
                <div className="card-elevated p-5 space-y-3">
                  <h3 className="font-semibold text-foreground text-sm">Config Preview</h3>
                  <div className="space-y-2">
                    {[
                      { label: "Duration", value: `${duration}s`, color: "#5B6CFF" },
                      { label: "Users", value: concurrentUsers, color: "#7F5AF0" },
                      { label: "Req/s", value: requestsPerSecond, color: "#00D4FF" },
                      { label: "Total Est.", value: `~${estimatedRequests.toLocaleString()}`, color: "#F59E0B" },
                    ].map(item => (
                      <div key={item.label} className="flex items-center justify-between py-1.5"
                        style={{ borderBottom: "1px solid hsl(var(--border-subtle))" }}>
                        <span className="text-xs text-muted-foreground">{item.label}</span>
                        <span className="text-sm font-bold tabular-nums" style={{ color: item.color }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                  </div>
                </div>
                )} {/* end ternary: terminal vs info panel */}
              </div>
            </div>
          )}

          {/* Resilience Results */}
          {resilienceResult && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center justify-between mb-5">
                <button onClick={() => { setResilienceResult(null); }}
                  className="btn-ghost-border gap-2 text-xs">
                  <ArrowLeft className="w-3.5 h-3.5" /> New Test
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                {[
                  { label: "Max Concurrent Users", value: resilienceResult.maxConcurrentUsers ?? "—", color: "text-primary" },
                  { label: "Breaking Point", value: resilienceResult.breakingPoint ?? "—", color: "text-destructive" },
                  { label: "Avg Response at Peak", value: resilienceResult.averageResponseTime ? `${resilienceResult.averageResponseTime}ms` : "—", color: "text-warning" },
                  { label: "Success Rate at Peak", value: resilienceResult.successRate ? `${resilienceResult.successRate}%` : "—", color: "text-success" },
                ].map(m => (
                  <div key={m.label} className="text-center p-5 rounded-xl"
                    style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
                    <div className={`text-3xl font-black metric-number ${m.color}`}>{m.value}</div>
                    <div className="text-xs text-muted-foreground mt-1.5">{m.label}</div>
                  </div>
                ))}
              </div>
              {resilienceResult.recommendations?.length > 0 && (
                <div className="card-elevated p-5">
                  <p className="section-label mb-3">Recommendations</p>
                  <ul className="space-y-2">
                    {resilienceResult.recommendations.map((r: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="text-primary shrink-0 mt-1">•</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}

          {/* Load Test Results */}
          {result && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div className="flex items-center justify-between">
                <button onClick={() => { setResult(null); }}
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

              {/* Primary metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Requests", value: result.totalRequests.toLocaleString(), color: "text-foreground", bg: "hsl(var(--muted) / 0.5)" },
                  { label: "Success Rate", value: `${successRate.toFixed(1)}%`, color: successRate >= 99 ? "text-success" : successRate >= 95 ? "text-warning" : "text-destructive", bg: successRate >= 99 ? "hsl(var(--success) / 0.08)" : "hsl(var(--muted) / 0.5)" },
                  { label: "Avg Response", value: `${result.averageResponseTime}ms`, color: "text-primary", bg: "hsl(var(--muted) / 0.5)" },
                  { label: "Req/Second", value: result.requestsPerSecond, color: "text-foreground", bg: "hsl(var(--muted) / 0.5)" },
                ].map(s => (
                  <div key={s.label} className="text-center p-5 rounded-xl"
                    style={{ background: s.bg, border: "1px solid hsl(var(--border))" }}>
                    <div className={`text-3xl font-black metric-number ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-muted-foreground mt-1.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Secondary metrics */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Successful", value: result.successfulRequests.toLocaleString(), color: "text-success", bg: "hsl(var(--success) / 0.08)", border: "hsl(var(--success) / 0.25)" },
                  { label: "Failed", value: result.failedRequests.toLocaleString(), color: "text-destructive", bg: "hsl(0 84% 60% / 0.08)", border: "hsl(0 84% 60% / 0.25)" },
                  { label: "Rate Limited", value: result.rateLimitedRequests.toLocaleString(), color: "text-warning", bg: "hsl(38 92% 50% / 0.08)", border: "hsl(38 92% 50% / 0.25)" },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                    <div className={`text-2xl font-black metric-number ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Response time detail */}
              <div className="card-elevated p-5">
                <h3 className="font-semibold text-foreground text-sm mb-4">Response Time Breakdown</h3>
                <div className="space-y-3">
                  {[
                    { label: "Minimum Response", value: `${result.minResponseTime}ms`, bar: result.minResponseTime / result.maxResponseTime * 100, color: "#22C55E" },
                    { label: "Average Response", value: `${result.averageResponseTime}ms`, bar: result.averageResponseTime / result.maxResponseTime * 100, color: "#5B6CFF" },
                    { label: "Maximum Response", value: `${result.maxResponseTime}ms`, bar: 100, color: "#EF4444" },
                    { label: "Test Duration", value: `${result.duration}s`, bar: 60, color: "#7F5AF0" },
                  ].map(row => (
                    <div key={row.label}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground text-xs">{row.label}</span>
                        <span className="font-mono font-semibold text-foreground text-xs">{row.value}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(var(--muted))" }}>
                        <motion.div className="h-full rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${row.bar}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          style={{ background: row.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="card-elevated p-5">
                  <p className="section-label mb-3">Errors Encountered</p>
                  <div className="space-y-2">
                    {result.errors.map((err, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg text-sm"
                        style={{ background: "hsl(0 84% 60% / 0.07)", border: "1px solid hsl(0 84% 60% / 0.2)" }}>
                        <span className="text-foreground">HTTP {err.status}: {err.message}</span>
                        <span className="text-destructive font-mono font-semibold">{err.count}×</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.recommendations.length > 0 && (
                <div className="card-elevated p-5">
                  <p className="section-label mb-3">Recommendations</p>
                  <ul className="space-y-2">
                    {result.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="text-primary mt-1 shrink-0">•</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}
    </PageLayout>
  );
}
