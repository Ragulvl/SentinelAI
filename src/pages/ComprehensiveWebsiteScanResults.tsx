import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { websiteScanService, PenetrationTestReport } from '@/services/websiteScan.service';
import { ApiClient } from '@/utils/api';
import {
  Shield, AlertTriangle, CheckCircle2, XCircle, Info,
  Download, ArrowLeft, Activity, Zap, Lock, TrendingUp,
  Loader2, Play,
} from 'lucide-react';

// ── Local types ────────────────────────────────────────────────────────────────

interface LoadTestSummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsPerSecond: number;
}

interface ResilienceSummary {
  maxConcurrentUsers: number;
  breakingPoint: number;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ComprehensiveWebsiteScanResults() {
  const { scanId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Security scan (always loaded)
  const [loading, setLoading] = useState(true);
  const [securityScan, setSecurityScan] = useState<any>(null);

  // Pentest per-tab state
  const [pentestResults, setPentestResults] = useState<PenetrationTestReport | null>(null);
  const [pentestLoading, setPentestLoading] = useState(false);
  const [pentestError, setPentestError] = useState<string | null>(null);

  // Load test per-tab state
  const [loadTestResults, setLoadTestResults] = useState<LoadTestSummary | null>(null);
  const [loadTestLoading, setLoadTestLoading] = useState(false);
  const [loadTestError, setLoadTestError] = useState<string | null>(null);

  // Resilience (derived from load test)
  const [resilienceResults, setResilienceResults] = useState<ResilienceSummary | null>(null);
  const [resilienceLoading, setResilienceLoading] = useState(false);

  // ── Boot ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadSecurityScan();
  }, [scanId]);

  // Once the security scan is known, load linked test results if IDs are in the URL
  useEffect(() => {
    if (!securityScan) return;
    const pentestId = searchParams.get('pentest');
    const loadId = searchParams.get('load');
    if (pentestId) fetchPentestById(pentestId);
    if (loadId) fetchLoadTestById(loadId);
  }, [securityScan]);

  // ── Loaders ───────────────────────────────────────────────────────────────

  const loadSecurityScan = async () => {
    try {
      setLoading(true);
      if (scanId) {
        const scan = await websiteScanService.getScanById(scanId);
        setSecurityScan(scan);
      }
    } catch (err) {
      console.error('Failed to load security scan:', err);
    } finally {
      setLoading(false);
    }
  };

  /** Load a specific pentest result by its history ID */
  const fetchPentestById = async (id: string) => {
    try {
      setPentestLoading(true);
      setPentestError(null);
      // Route: GET /api/history/:type/:id — type = 'penetration'
      const data = await ApiClient.get<{ scan: any; type: string }>(`/api/history/penetration/${id}`);
      const s = data.scan;
      const total: number = s.summary?.totalTests ?? 0;
      const failed: number = s.summary?.failed ?? 0;
      setPentestResults({
        url: s.url,
        testDate: s.testDate,
        testsPerformed: total,
        vulnerabilitiesFound: failed,
        riskScore: total > 0 ? Math.round((failed / total) * 100) : 0,
        results: (s.results ?? []).map((r: any) => ({
          testName: r.testName,
          category: r.category,
          // Model stores `passed: boolean`; PenetrationTestResult expects `vulnerable: boolean`
          vulnerable: !r.passed,
          severity: r.severity,
          description: r.description,
          evidence: r.evidence,
          payload: r.payload,
          recommendation: r.recommendation,
        })),
      });
    } catch (err: any) {
      setPentestError(err.message ?? 'Failed to load pentest results');
    } finally {
      setPentestLoading(false);
    }
  };

  /** Load a specific load-test result by its history ID */
  const fetchLoadTestById = async (id: string) => {
    try {
      setLoadTestLoading(true);
      setLoadTestError(null);
      // Route: GET /api/history/:type/:id — type = 'load' (NOT 'loadtest')
      const data = await ApiClient.get<{ scan: any; type: string }>(`/api/history/load/${id}`);
      // Controller returns { scan, type }; load test data lives under scan.results
      const r = data.scan.results;
      setLoadTestResults({
        totalRequests: r.totalRequests,
        successfulRequests: r.successfulRequests,
        failedRequests: r.failedRequests,
        averageResponseTime: r.averageResponseTime,
        requestsPerSecond: r.requestsPerSecond,
      });
      applyResilienceFromLoadResult(r);
    } catch (err: any) {
      setLoadTestError(err.message ?? 'Failed to load test results');
    } finally {
      setLoadTestLoading(false);
    }
  };

  // ── On-demand runners ─────────────────────────────────────────────────────

  const runPentest = async () => {
    if (!securityScan?.url) return;
    try {
      setPentestLoading(true);
      setPentestError(null);
      const result = await websiteScanService.performPenetrationTest(securityScan.url);
      setPentestResults(result);
    } catch (err: any) {
      if (err.response?.data?.requiresVerification) {
        navigate('/domain-verification');
      } else {
        setPentestError(err.response?.data?.error ?? err.message ?? 'Penetration test failed');
      }
    } finally {
      setPentestLoading(false);
    }
  };

  const runLoadTest = async () => {
    if (!securityScan?.url) return;
    try {
      setLoadTestLoading(true);
      setResilienceLoading(true);
      setLoadTestError(null);
      const result: any = await websiteScanService.loadTest(securityScan.url, {
        duration: 30,
        concurrentUsers: 10,
        requestsPerSecond: 10,
      });
      setLoadTestResults({
        totalRequests: result.totalRequests,
        successfulRequests: result.successfulRequests,
        failedRequests: result.failedRequests,
        averageResponseTime: result.averageResponseTime,
        requestsPerSecond: result.requestsPerSecond,
      });
      applyResilienceFromLoadResult(result);
    } catch (err: any) {
      setLoadTestError(err.response?.data?.error ?? err.message ?? 'Load test failed');
    } finally {
      setLoadTestLoading(false);
      setResilienceLoading(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const applyResilienceFromLoadResult = (r: any) => {
    if (r.maxConcurrentUsers != null) {
      setResilienceResults({ maxConcurrentUsers: r.maxConcurrentUsers, breakingPoint: r.breakingPoint ?? 0 });
    } else {
      const rate = r.successfulRequests / Math.max(r.totalRequests, 1);
      setResilienceResults({ maxConcurrentUsers: Math.round(10 * rate), breakingPoint: r.failedRequests > 0 ? 10 : 50 });
    }
  };

  const getSeverityColor = (type: string): 'destructive' | 'default' | 'secondary' | 'outline' => {
    if (type === 'critical' || type === 'high') return 'destructive';
    if (type === 'medium') return 'default';
    if (type === 'low') return 'secondary';
    return 'outline';
  };

  const getSeverityIcon = (type: string) => {
    if (type === 'critical' || type === 'high') return <XCircle className="h-4 w-4" />;
    if (type === 'medium') return <AlertTriangle className="h-4 w-4" />;
    if (type === 'low' || type === 'info') return <Info className="h-4 w-4" />;
    return <CheckCircle2 className="h-4 w-4" />;
  };

  const calculateOverallScore = () => {
    if (!securityScan) return 0;
    let total = 0;
    let count = 0;
    if (securityScan.securityScore != null) { total += securityScan.securityScore; count++; }
    if (pentestResults?.riskScore != null) { total += (100 - pentestResults.riskScore); count++; }
    if (loadTestResults) {
      total += (loadTestResults.successfulRequests / Math.max(loadTestResults.totalRequests, 1)) * 100;
      count++;
    }
    return count > 0 ? Math.round(total / count) : 0;
  };

  // Severity color discipline: only critical/high get vivid color
  const getScoreColor = (score: number) =>
    score >= 80 ? '#C8FF00' : score >= 60 ? '#F2F2F2' : '#E5373A';

  const getSeverityEdgeClass = (type: string) => {
    const t = type?.toLowerCase();
    if (t === 'critical') return 'severity-edge-critical';
    if (t === 'high') return 'severity-edge-high';
    return 'severity-edge-medium';
  };

  const getSeverityBadgeClass = (type: string) => {
    const t = type?.toLowerCase();
    if (t === 'critical') return 'badge badge-critical';
    if (t === 'high') return 'badge badge-high';
    if (t === 'medium') return 'badge badge-medium';
    if (t === 'low') return 'badge badge-low';
    return 'badge badge-info';
  };

  const successRatePct = loadTestResults
    ? ((loadTestResults.successfulRequests / Math.max(loadTestResults.totalRequests, 1)) * 100).toFixed(1)
    : null;

  // ── Guards ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'hsl(var(--background))' }}>
        <Navigation />
        <div className="flex items-center justify-center h-screen">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>Loading scan results…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!securityScan) {
    return (
      <div className="min-h-screen" style={{ background: 'hsl(var(--background))' }}>
        <Navigation />
        <div className="max-w-4xl mx-auto py-12 px-6">
          <div
            className="p-5 flex items-start gap-3"
            style={{
              borderRadius: 'var(--radius-lg)',
              background: 'hsl(var(--destructive) / 0.08)',
              border: '1px solid hsl(var(--destructive) / 0.25)',
            }}
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'hsl(var(--destructive))' }} />
            <p style={{ fontSize: 13, color: 'hsl(var(--destructive))' }}>Scan results not found</p>
          </div>
        </div>
      </div>
    );
  }

  const overallScore = calculateOverallScore();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      <Navigation />
      <div className="md:pl-[220px] min-h-screen">
        <div className="max-w-5xl mx-auto py-8 px-6 md:px-8 space-y-6">

          {/* Back + export row */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/website-scan')}
              className="flex items-center gap-1.5 btn-ghost"
              style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
            >
              <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
              Back to Scanner
            </button>
            <button className="btn-secondary flex items-center gap-2" style={{ fontSize: 12, padding: '6px 12px' }}>
              <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
              Export Report
            </button>
          </div>

          {/* ── HERO METRIC BLOCK ─────────────────────────────────── */}
          {/* The score dominates — everything else is subordinate */}
          <div className="py-2">
            {/* Score number: the primary visual anchor */}
            <div
              className="hero-metric mb-3"
              style={{
                fontSize: 'clamp(64px, 8vw, 96px)',
                color: getScoreColor(overallScore),
              }}
            >
              {overallScore}
              <span
                style={{
                  fontSize: 'clamp(20px, 2.5vw, 28px)',
                  color: 'hsl(var(--muted-foreground))',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 400,
                  marginLeft: 4,
                }}
              >
                /100
              </span>
            </div>

            {/* One-line context: status · issues · time · url */}
            <div
              className="flex items-center gap-1.5 flex-wrap mb-1"
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'hsl(var(--muted-foreground))' }}
            >
              <span style={{ color: overallScore >= 80 ? '#C8FF00' : 'hsl(var(--destructive))' }}>
                {overallScore >= 80 ? 'Excellent posture' : overallScore >= 60 ? 'Needs attention' : 'Critical issues'}
              </span>
              <span style={{ color: 'hsl(var(--border-active))' }}>·</span>
              <span>{securityScan.vulnerabilities.length} issues found</span>
              <span style={{ color: 'hsl(var(--border-active))' }}>·</span>
              <span>{new Date(securityScan.scanDate).toLocaleDateString()}</span>
              <span style={{ color: 'hsl(var(--border-active))' }}>·</span>
              <span style={{ color: 'hsl(var(--dim-foreground))' }}>{securityScan.url}</span>
            </div>

            {/* Thin progress bar — 3px, accent colored */}
            <div className="progress-bar mt-4" style={{ maxWidth: 360 }}>
              <div
                className={`progress-bar-fill ${overallScore < 60 ? 'critical' : ''}`}
                style={{ width: `${overallScore}%` }}
              />
            </div>
          </div>

          {/* ── SUMMARY ROW: compact inline stats ─────────────────── */}
          {/* Replace 4 equal-weight cards with a compact inline stat row */}
          <div
            className="grid grid-cols-2 md:grid-cols-4 gap-px"
            style={{
              background: 'hsl(var(--border))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
            }}
          >
            {/* Security Scan */}
            <div className="p-4" style={{ background: 'hsl(var(--surface))' }}>
              <div className="section-label mb-2 flex items-center gap-1.5">
                <Lock className="w-3 h-3" strokeWidth={1.5} /> Security
              </div>
              <div
                className="metric-number"
                style={{ fontSize: 22, fontWeight: 700, color: 'hsl(var(--foreground))' }}
              >
                {securityScan.securityScore}/100
              </div>
              <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                {securityScan.vulnerabilities.length} issues
              </div>
            </div>

            {/* Pentest */}
            <div className="p-4" style={{ background: 'hsl(var(--surface))' }}>
              <div className="section-label mb-2 flex items-center gap-1.5">
                <Shield className="w-3 h-3" strokeWidth={1.5} /> Pentest
              </div>
              {pentestLoading
                ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'hsl(var(--muted-foreground))' }} />
                : pentestResults
                  ? <>
                    <div className="metric-number" style={{ fontSize: 22, fontWeight: 700 }}>{pentestResults.testsPerformed}</div>
                    <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                      {pentestResults.vulnerabilitiesFound} vulns · risk {pentestResults.riskScore}
                    </div>
                  </>
                  : <div style={{ fontSize: 11, color: 'hsl(var(--dim-foreground))', fontFamily: "'JetBrains Mono', monospace" }}>Not run yet</div>
              }
            </div>

            {/* Load Test */}
            <div className="p-4" style={{ background: 'hsl(var(--surface))' }}>
              <div className="section-label mb-2 flex items-center gap-1.5">
                <Activity className="w-3 h-3" strokeWidth={1.5} /> Load Test
              </div>
              {loadTestLoading
                ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'hsl(var(--muted-foreground))' }} />
                : loadTestResults
                  ? <>
                    <div className="metric-number" style={{ fontSize: 22, fontWeight: 700 }}>{loadTestResults.averageResponseTime}ms</div>
                    <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>{successRatePct}% success</div>
                  </>
                  : <div style={{ fontSize: 11, color: 'hsl(var(--dim-foreground))', fontFamily: "'JetBrains Mono', monospace" }}>Not run yet</div>
              }
            </div>

            {/* Resilience */}
            <div className="p-4" style={{ background: 'hsl(var(--surface))' }}>
              <div className="section-label mb-2 flex items-center gap-1.5">
                <Zap className="w-3 h-3" strokeWidth={1.5} /> Resilience
              </div>
              {resilienceLoading
                ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'hsl(var(--muted-foreground))' }} />
                : resilienceResults
                  ? <>
                    <div className="metric-number" style={{ fontSize: 22, fontWeight: 700 }}>{resilienceResults.maxConcurrentUsers}</div>
                    <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>max concurrent users</div>
                  </>
                  : <div style={{ fontSize: 11, color: 'hsl(var(--dim-foreground))', fontFamily: "'JetBrains Mono', monospace" }}>Not run yet</div>
              }
            </div>
          </div>

          {/* Detail tabs */}
          <div
            style={{
              borderRadius: 'var(--radius-lg)',
              border: '1px solid hsl(var(--border))',
              overflow: 'hidden',
            }}
          >
            {/* Tab bar — flat, compact, IBM Plex Mono */}
            <div
              className="flex items-center"
              style={{
                background: 'hsl(var(--surface))',
                borderBottom: '1px solid hsl(var(--border))',
              }}
            >
              {(['security', 'pentest', 'load', 'resilience'] as const).map((tab, i) => (
                <button
                  key={tab}
                  id={`tab-${tab}`}
                  style={{
                    padding: '10px 16px',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'hsl(var(--muted-foreground))',
                    borderBottom: '2px solid transparent',
                    transition: 'color 140ms, border-color 140ms',
                  }}
                >
                  {['Security', 'Pentest', 'Load Test', 'Resilience'][i]}
                </button>
              ))}
            </div>
            <div style={{ background: 'hsl(var(--background))' }}>

        <Tabs defaultValue="security" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4" style={{ display: 'none' }}>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="pentest">Penetration</TabsTrigger>
            <TabsTrigger value="load">Load Test</TabsTrigger>
            <TabsTrigger value="resilience">Resilience</TabsTrigger>
          </TabsList>

          {/* ── Security ── */}
          <TabsContent value="security">
            {/* Vulnerability list — full width, severity edge lines */}
            <div className="p-4 space-y-2">
              <div
                className="flex items-center justify-between mb-3"
                style={{ paddingBottom: 12, borderBottom: '1px solid hsl(var(--border))' }}
              >
                <div>
                  <h3 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 600 }}>Security Vulnerabilities</h3>
                  <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                    Found {securityScan.vulnerabilities.length} security issues
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {securityScan.vulnerabilities.filter((v: any) => v.type === 'critical').length > 0 && (
                    <span className="badge badge-critical">
                      {securityScan.vulnerabilities.filter((v: any) => v.type === 'critical').length} critical
                    </span>
                  )}
                  {securityScan.vulnerabilities.filter((v: any) => v.type === 'high').length > 0 && (
                    <span className="badge badge-high">
                      {securityScan.vulnerabilities.filter((v: any) => v.type === 'high').length} high
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {securityScan.vulnerabilities.map((vuln: any, i: number) => (
                  <div
                    key={i}
                    className={`p-4 ${getSeverityEdgeClass(vuln.type)}`}
                    style={{
                      background: 'hsl(var(--surface))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-4 mb-2.5">
                      <h4
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'hsl(var(--foreground))',
                          lineHeight: 1.4,
                        }}
                      >
                        {vuln.title}
                      </h4>
                      <span className={getSeverityBadgeClass(vuln.type)} style={{ flexShrink: 0 }}>
                        {vuln.type?.toUpperCase()}
                      </span>
                    </div>

                    <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', lineHeight: 1.65, marginBottom: 10 }}>
                      {vuln.description}
                    </p>

                    <div
                      style={{
                        background: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 'var(--radius-sm)',
                        padding: '8px 12px',
                      }}
                    >
                      <p
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: 'hsl(var(--muted-foreground))',
                          marginBottom: 4,
                        }}
                      >
                        Recommendation
                      </p>
                      <p style={{ fontSize: 12, color: 'hsl(var(--foreground) / 0.8)', lineHeight: 1.65 }}>
                        {vuln.recommendation}
                      </p>
                    </div>

                    {vuln.evidence && (
                      <p
                        className="mt-2 line-clamp-2"
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 10,
                          color: 'hsl(var(--muted-foreground) / 0.5)',
                          lineHeight: 1.5,
                        }}
                      >
                        {vuln.evidence}
                      </p>
                    )}
                  </div>
                ))}

                {securityScan.vulnerabilities.length === 0 && (
                  <div
                    className="text-center py-12"
                    style={{
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 'var(--radius-lg)',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 12,
                        color: '#C8FF00',
                        marginBottom: 4,
                      }}
                    >
                      ✔︎ All clear
                    </div>
                    <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>No vulnerabilities found</p>
                  </div>
                )}
              </div>
            </div>

            {/* SSL/TLS */}
            <div
              className="mx-4 mb-4"
              style={{
                background: 'hsl(var(--surface))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div
                className="flex items-center gap-2 px-4 py-3"
                style={{ borderBottom: '1px solid hsl(var(--border))' }}
              >
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: 'hsl(var(--muted-foreground))',
                  }}
                >
                  SSL / TLS Configuration
                </span>
              </div>
              <div className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>Valid Certificate</span>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      fontWeight: 600,
                      color: securityScan.ssl.valid ? '#C8FF00' : 'hsl(var(--destructive))',
                    }}
                  >
                    {securityScan.ssl.valid ? 'Yes' : 'No'}
                  </span>
                </div>
                {securityScan.ssl.issuer && (
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>Issuer</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'hsl(var(--foreground))' }}>
                      {securityScan.ssl.issuer}
                    </span>
                  </div>
                )}
                {securityScan.ssl.protocol && (
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>Protocol</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'hsl(var(--foreground))' }}>
                      {securityScan.ssl.protocol}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Detected Technologies */}
            <div
              className="mx-4 mb-4"
              style={{
                background: 'hsl(var(--surface))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div
                className="flex items-center gap-2 px-4 py-3"
                style={{ borderBottom: '1px solid hsl(var(--border))' }}
              >
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: 'hsl(var(--muted-foreground))',
                  }}
                >
                  Detected Technologies
                </span>
              </div>
              <div className="px-4 py-3 flex flex-wrap gap-1.5">
                {securityScan.technologies.map((tech: string, i: number) => (
                  <span key={i} className="badge badge-muted">{tech}</span>
                ))}
                {securityScan.technologies.length === 0 && (
                  <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>No technologies detected</p>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── Penetration ── */}
          <TabsContent value="pentest" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Penetration Test Results</CardTitle>
                <CardDescription>
                  {pentestResults
                    ? `${pentestResults.testsPerformed} tests · ${pentestResults.vulnerabilitiesFound} vulnerabilities · risk ${pentestResults.riskScore}/100`
                    : `Active security testing against ${securityScan.url}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pentestLoading ? (
                  <div className="flex items-center justify-center gap-3 py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Running penetration tests (1–3 min)…</span>
                  </div>
                ) : pentestError ? (
                  <Alert variant="destructive">
                    <AlertDescription>{pentestError}</AlertDescription>
                  </Alert>
                ) : pentestResults ? (
                  <div className="space-y-4">
                    {/* Summary grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: 'Tests Run', value: pentestResults.testsPerformed, color: '' },
                        { label: 'Vulnerabilities', value: pentestResults.vulnerabilitiesFound, color: 'text-red-500' },
                        { label: 'Risk Score', value: pentestResults.riskScore, color: '' },
                        { label: 'Passed', value: pentestResults.testsPerformed - pentestResults.vulnerabilitiesFound, color: 'text-green-500' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="text-center p-4 bg-muted/50 rounded-lg">
                          <div className={`text-2xl font-bold ${color}`}>{value}</div>
                          <div className="text-xs text-muted-foreground">{label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Vulnerable findings */}
                    {pentestResults.results.filter(r => r.vulnerable).length > 0 && (
                      <div className="space-y-3">
                        <h4 className="font-medium text-sm">Vulnerabilities Found</h4>
                        {pentestResults.results.filter(r => r.vulnerable).map((r, i) => (
                          <div key={i} className="border border-destructive/30 rounded-lg p-3 bg-destructive/5">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm">{r.testName}</span>
                              <Badge variant="destructive" className="text-xs capitalize">{r.severity}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{r.description}</p>
                            {r.recommendation && (
                              <p className="text-xs text-muted-foreground mt-1">
                                <span className="font-medium">Fix: </span>{r.recommendation}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        Tests include XSS, SQL injection, CSRF, command injection, path traversal, SSRF, and more.
                      </AlertDescription>
                    </Alert>
                  </div>
                ) : (
                  <div className="text-center py-10 space-y-4">
                    <Shield className="h-10 w-10 text-muted-foreground mx-auto" />
                    <div>
                      <p className="text-sm font-medium">No penetration test run yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Domain must be verified to run active tests.</p>
                    </div>
                    <Button onClick={runPentest} size="sm">
                      <Play className="mr-2 h-4 w-4" /> Run Penetration Test
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Load Test ── */}
          <TabsContent value="load" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Load Test Results</CardTitle>
                <CardDescription>Performance under simulated concurrent load</CardDescription>
              </CardHeader>
              <CardContent>
                {loadTestLoading ? (
                  <div className="flex items-center justify-center gap-3 py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Running load test (30s)…</span>
                  </div>
                ) : loadTestError ? (
                  <Alert variant="destructive"><AlertDescription>{loadTestError}</AlertDescription></Alert>
                ) : loadTestResults ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {[
                      { label: 'Total Requests', value: loadTestResults.totalRequests, color: '' },
                      { label: 'Successful', value: loadTestResults.successfulRequests, color: 'text-green-500' },
                      { label: 'Failed', value: loadTestResults.failedRequests, color: 'text-red-500' },
                      { label: 'Avg Response', value: `${loadTestResults.averageResponseTime}ms`, color: '' },
                      { label: 'Req / Second', value: loadTestResults.requestsPerSecond, color: '' },
                      { label: 'Success Rate', value: `${successRatePct}%`, color: '' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="text-center p-4 bg-muted/50 rounded-lg">
                        <div className={`text-2xl font-bold ${color}`}>{value}</div>
                        <div className="text-xs text-muted-foreground">{label}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 space-y-4">
                    <Activity className="h-10 w-10 text-muted-foreground mx-auto" />
                    <div>
                      <p className="text-sm font-medium">No load test run yet</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Runs 10 concurrent users for 30 s against {securityScan.url}.
                      </p>
                    </div>
                    <Button onClick={runLoadTest} size="sm">
                      <Play className="mr-2 h-4 w-4" /> Run Load Test
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Resilience ── */}
          <TabsContent value="resilience" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Resilience Test Results</CardTitle>
                <CardDescription>Scalability and breaking-point analysis</CardDescription>
              </CardHeader>
              <CardContent>
                {resilienceLoading ? (
                  <div className="flex items-center justify-center gap-3 py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Analysing resilience…</span>
                  </div>
                ) : resilienceResults ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold text-green-500">{resilienceResults.maxConcurrentUsers}</div>
                        <div className="text-xs text-muted-foreground">Max Concurrent Users</div>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold text-yellow-500">{resilienceResults.breakingPoint}</div>
                        <div className="text-xs text-muted-foreground">Breaking Point</div>
                      </div>
                    </div>
                    <Alert>
                      <TrendingUp className="h-4 w-4" />
                      <AlertDescription>
                        Your site reliably handles {resilienceResults.maxConcurrentUsers} concurrent users.
                        {resilienceResults.breakingPoint > 0 &&
                          ` Performance degrades at ${resilienceResults.breakingPoint} users.`}
                      </AlertDescription>
                    </Alert>
                    <div className="space-y-2">
                      <h4 className="font-medium">Recommendations</h4>
                      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                        <li>Implement auto-scaling to handle traffic spikes</li>
                        <li>Use a load balancer to distribute traffic</li>
                        <li>Add caching layers to reduce server load</li>
                        <li>Serve static assets via a CDN</li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-10 space-y-4">
                    <Zap className="h-10 w-10 text-muted-foreground mx-auto" />
                    <div>
                      <p className="text-sm font-medium">No resilience data yet</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Run the Load Test tab first — resilience data is derived from the same test.
                      </p>
                    </div>
                    <Button onClick={runLoadTest} size="sm" disabled={loadTestLoading}>
                      <Play className="mr-2 h-4 w-4" /> Run Load + Resilience Test
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
