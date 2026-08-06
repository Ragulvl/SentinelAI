import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle, Loader2, Activity, Zap, TrendingUp,
  ArrowLeft, Download, Share2, Globe, Info, CheckCircle,
  XCircle,
} from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import { ApiClient } from "@/utils/api";
import { useToast } from "@/hooks/use-toast";
import { API_ENDPOINTS } from "@/config/api";
import { AuthService } from "@/services/auth.service";
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

  useEffect(() => { if (resultId) loadExistingResult(resultId); }, [resultId]);

  const loadExistingResult = async (id: string) => {
    try {
      setLoading(true);
      const token = AuthService.getToken();
      const response = await fetch(API_ENDPOINTS.history.detail("load", id), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to load");
      const data = await response.json();
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
    const estimated = concurrentUsers * requestsPerSecond * duration;
    if (!confirm(`This will send ~${estimated} requests to the target. Proceed?`)) return;
    try {
      setTesting(true); setResult(null);
      const response: LoadTestResult = await ApiClient.post("/api/website-scan/loadtest", {
        url, duration, concurrentUsers, requestsPerSecond, method: "GET",
      });
      setResult(response);
      toast({ title: "Load Test Complete", description: `Sent ${response.totalRequests} requests` });
    } catch (error: any) {
      if (error.response?.data?.requiresVerification) {
        toast({ title: "Domain Not Verified", description: error.response.data.message, variant: "destructive" });
        navigate("/domain-verification");
      } else {
        toast({ title: "Test Failed", description: error.response?.data?.error || error.message || "Failed to perform load test", variant: "destructive" });
      }
    } finally { setTesting(false); }
  };

  const handleResilienceTest = async () => {
    if (!url.trim()) { toast({ title: "URL required", variant: "destructive" }); return; }
    try {
      setTesting(true);
      setResilienceResult(null);
      const response: any = await ApiClient.post("/api/website-scan/test-resilience", { url });
      setResilienceResult(response);
      toast({ title: "Resilience Test Complete", description: `Max concurrent users: ${response.maxConcurrentUsers}` });
    } catch (error: any) {
      toast({ title: "Test Failed", description: error.response?.data?.error || "Failed to test resilience", variant: "destructive" });
    } finally { setTesting(false); }
  };

  const successRate = result ? (result.successfulRequests / result.totalRequests) * 100 : 0;

  const handleExportPDF = () => {
    if (!result) return;
    const doc = exportToPDF({
      title: "Load Test Report", subtitle: result.url,
      metadata: { date: new Date(result.testDate).toLocaleString(), url: result.url },
      sections: [
        { title: "Configuration", table: { headers: ["Parameter", "Value"], rows: [["Duration", `${result.duration}s`], ["Total Requests", result.totalRequests.toString()], ["Req/Second", result.requestsPerSecond.toString()]] }},
        { title: "Results", table: { headers: ["Metric", "Value"], rows: [["Success Rate", `${successRate.toFixed(1)}%`], ["Avg Response", `${result.averageResponseTime}ms`], ["Min Response", `${result.minResponseTime}ms`], ["Max Response", `${result.maxResponseTime}ms`]] }},
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

  const Slider = ({ value, onChange, min, max, step, label, maxLabel }: { value: number; onChange: (v: number) => void; min: number; max: number; step: number; label: string; maxLabel?: string }) => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="section-label">{label}: {value}</label>
        {maxLabel && <span className="text-xs text-muted-foreground">{maxLabel}</span>}
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} disabled={testing}
        className="w-full" style={{ accentColor: "hsl(var(--primary))" }} />
    </div>
  );

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

      {/* Info banner */}
      <div className="mb-5 p-4 rounded-xl flex items-start gap-3"
        style={{ background: "hsl(234 100% 68% / 0.06)", border: "1px solid hsl(234 100% 68% / 0.2)" }}>
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground">Controlled Capacity Evaluation</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Perform controlled load and capacity checks to identify bottlenecks and evaluate response thresholds.
            Runs within predefined rate limits against verified targets only.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Config form */}
          {viewMode === "new" && (
            <div className="card-elevated p-6 space-y-5 max-w-2xl">
              <div>
                <label className="section-label block mb-2">Target URL</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input type="url" value={url} onChange={e => setUrl(e.target.value)}
                    disabled={testing} placeholder="https://example.com"
                    className="input-base pl-10 font-mono text-sm" />
                </div>
              </div>

              {/* Test type tabs */}
              <div className="flex items-center p-1 rounded-xl gap-1" style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
                {[{ key: "load", label: "Load Test", icon: Zap }, { key: "resilience", label: "Resilience", icon: TrendingUp }].map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button key={tab.key} onClick={() => setTestType(tab.key as any)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${testType === tab.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                      <Icon className="w-3.5 h-3.5" /> {tab.label}
                    </button>
                  );
                })}
              </div>

              {testType === "load" ? (
                <div className="space-y-5">
                  <Slider value={duration} onChange={setDuration} min={10} max={60} step={5} label="Duration (seconds)" maxLabel="Max: 60s" />
                  <Slider value={concurrentUsers} onChange={setConcurrentUsers} min={1} max={100} step={1} label="Concurrent Users" maxLabel="Max: 100" />
                  <Slider value={requestsPerSecond} onChange={setRequestsPerSecond} min={1} max={50} step={1} label="Requests/Second" maxLabel="Max: 50" />

                  <div className="p-3.5 rounded-xl text-xs"
                    style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
                    <span className="text-muted-foreground">Estimated load: </span>
                    <span className="text-foreground font-semibold">~{concurrentUsers * requestsPerSecond * duration} requests</span>
                  </div>

                  <button onClick={handleLoadTest} disabled={testing || !url.trim()} className="btn-primary w-full justify-center">
                    {testing ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing...</> : <><Zap className="w-4 h-4" /> Start Load Test</>}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Incrementally raises concurrent user load to identify system thresholds and performance limits.
                  </p>
                  <button onClick={handleResilienceTest} disabled={testing || !url.trim()} className="btn-primary w-full justify-center">
                    {testing ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing...</> : <><TrendingUp className="w-4 h-4" /> Test Resilience</>}
                  </button>
                  {resilienceResult && (
                    <div className="p-4 rounded-xl space-y-3" style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
                      <p className="text-xs font-semibold text-foreground">Resilience Results</p>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: "Max Concurrent Users", value: resilienceResult.maxConcurrentUsers ?? "—" },
                          { label: "Breaking Point", value: resilienceResult.breakingPoint ?? "—" },
                          { label: "Avg Response at Peak", value: resilienceResult.averageResponseTime ? `${resilienceResult.averageResponseTime}ms` : "—" },
                          { label: "Success Rate at Peak", value: resilienceResult.successRate ? `${resilienceResult.successRate}%` : "—" },
                        ].map(m => (
                          <div key={m.label} className="text-center p-3 rounded-lg" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
                            <div className="text-lg font-black metric-number text-primary">{m.value}</div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">{m.label}</div>
                          </div>
                        ))}
                      </div>
                      {resilienceResult.recommendations?.length > 0 && (
                        <div>
                          <p className="section-label mb-1.5">Recommendations</p>
                          <ul className="space-y-1">
                            {resilienceResult.recommendations.map((r: string, i: number) => (
                              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                <span className="text-primary shrink-0 mt-0.5">•</span>{r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {result && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card-elevated p-5 space-y-5 max-w-4xl">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground text-sm">Test Results</h3>
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
                  { label: "Total Requests", value: result.totalRequests, color: "text-foreground" },
                  { label: "Success Rate", value: `${successRate.toFixed(1)}%`, color: successRate >= 99 ? "text-success" : successRate >= 95 ? "text-warning" : "text-destructive" },
                  { label: "Avg Response", value: `${result.averageResponseTime}ms`, color: "text-primary" },
                  { label: "Req/Second", value: result.requestsPerSecond, color: "text-foreground" },
                ].map(s => (
                  <div key={s.label} className="text-center p-4 rounded-xl"
                    style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
                    <div className={`text-2xl font-black metric-number ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Successful", value: result.successfulRequests, color: "text-success", bg: "hsl(var(--success) / 0.08)", border: "hsl(var(--success) / 0.25)" },
                  { label: "Failed", value: result.failedRequests, color: "text-destructive", bg: "hsl(0 84% 60% / 0.08)", border: "hsl(0 84% 60% / 0.25)" },
                  { label: "Rate Limited", value: result.rateLimitedRequests, color: "text-warning", bg: "hsl(38 92% 50% / 0.08)", border: "hsl(38 92% 50% / 0.25)" },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                    <div className={`text-xl font-black metric-number ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {[
                  { label: "Min Response", value: `${result.minResponseTime}ms` },
                  { label: "Max Response", value: `${result.maxResponseTime}ms` },
                  { label: "Duration", value: `${result.duration}s` },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between text-sm py-1.5"
                    style={{ borderBottom: "1px solid hsl(var(--border-subtle))" }}>
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-mono font-medium text-foreground">{row.value}</span>
                  </div>
                ))}
              </div>

              {result.errors.length > 0 && (
                <div>
                  <p className="section-label mb-2">Errors</p>
                  <div className="space-y-2">
                    {result.errors.map((err, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg text-sm"
                        style={{ background: "hsl(0 84% 60% / 0.07)", border: "1px solid hsl(0 84% 60% / 0.2)" }}>
                        <span className="text-foreground">HTTP {err.status}: {err.message}</span>
                        <span className="text-destructive font-mono font-medium">{err.count}×</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.recommendations.length > 0 && (
                <div>
                  <p className="section-label mb-2">Recommendations</p>
                  <ul className="space-y-2">
                    {result.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <span className="text-primary mt-0.5">•</span>
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
