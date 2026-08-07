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

  const getScoreColor = (score: number) =>
    score >= 80 ? 'text-green-500' : score >= 60 ? 'text-yellow-500' : 'text-red-500';

  const successRatePct = loadTestResults
    ? ((loadTestResults.successfulRequests / Math.max(loadTestResults.totalRequests, 1)) * 100).toFixed(1)
    : null;

  // ── Guards ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-black">
        <Navigation />
        <div className="container mx-auto py-8 px-4 flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading scan results…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!securityScan) {
    return (
      <div className="min-h-screen bg-black">
        <Navigation />
        <div className="container mx-auto py-8 px-4">
          <Alert variant="destructive"><AlertDescription>Scan results not found</AlertDescription></Alert>
        </div>
      </div>
    );
  }

  const overallScore = calculateOverallScore();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-black">
      <Navigation />
      <div className="container mx-auto py-8 px-4">

        {/* Back + header */}
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate('/website-scan')} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Scanner
          </Button>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Comprehensive Security Report</h1>
              <p className="text-muted-foreground">{securityScan.url}</p>
              <p className="text-sm text-muted-foreground">Scanned on {new Date(securityScan.scanDate).toLocaleString()}</p>
            </div>
            <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Export Report</Button>
          </div>
        </div>

        {/* Overall score */}
        <Card className="mb-6 border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Overall Security Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className={`text-6xl font-bold ${getScoreColor(overallScore)}`}>
                  {overallScore}<span className="text-2xl text-muted-foreground">/100</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {overallScore >= 80 ? 'Excellent security posture'
                    : overallScore >= 60 ? 'Good security with room for improvement'
                    : 'Critical issues require immediate attention'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-green-500">
                    {securityScan.vulnerabilities.filter((v: any) => !['critical', 'high'].includes(v.type)).length}
                  </div>
                  <div className="text-xs text-muted-foreground">Passed</div>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-red-500">
                    {securityScan.vulnerabilities.filter((v: any) => ['critical', 'high'].includes(v.type)).length}
                  </div>
                  <div className="text-xs text-muted-foreground">Critical / High</div>
                </div>
              </div>
            </div>
            <Progress value={overallScore} className="h-3" />
          </CardContent>
        </Card>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Security */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" /> Security Scan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{securityScan.securityScore}/100</div>
              <p className="text-xs text-muted-foreground">{securityScan.vulnerabilities.length} issues found</p>
            </CardContent>
          </Card>

          {/* Pentest */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" /> Penetration Test
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pentestLoading
                ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                : pentestResults
                  ? <><div className="text-2xl font-bold">{pentestResults.testsPerformed}</div>
                      <p className="text-xs text-muted-foreground">{pentestResults.vulnerabilitiesFound} vulns · risk {pentestResults.riskScore}</p></>
                  : <p className="text-xs text-muted-foreground">Not run yet</p>
              }
            </CardContent>
          </Card>

          {/* Load */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Load Test
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadTestLoading
                ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                : loadTestResults
                  ? <><div className="text-2xl font-bold">{loadTestResults.averageResponseTime}ms</div>
                      <p className="text-xs text-muted-foreground">{successRatePct}% success</p></>
                  : <p className="text-xs text-muted-foreground">Not run yet</p>
              }
            </CardContent>
          </Card>

          {/* Resilience */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" /> Resilience
              </CardTitle>
            </CardHeader>
            <CardContent>
              {resilienceLoading
                ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                : resilienceResults
                  ? <><div className="text-2xl font-bold">{resilienceResults.maxConcurrentUsers}</div>
                      <p className="text-xs text-muted-foreground">max concurrent users</p></>
                  : <p className="text-xs text-muted-foreground">Not run yet</p>
              }
            </CardContent>
          </Card>
        </div>

        {/* Detail tabs */}
        <Tabs defaultValue="security" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="pentest">Penetration</TabsTrigger>
            <TabsTrigger value="load">Load Test</TabsTrigger>
            <TabsTrigger value="resilience">Resilience</TabsTrigger>
          </TabsList>

          {/* ── Security ── */}
          <TabsContent value="security" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Security Vulnerabilities</CardTitle>
                <CardDescription>Found {securityScan.vulnerabilities.length} security issues</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {securityScan.vulnerabilities.map((vuln: any, i: number) => (
                    <div key={i} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getSeverityIcon(vuln.type)}
                          <h3 className="font-medium">{vuln.title}</h3>
                        </div>
                        <Badge variant={getSeverityColor(vuln.type)}>{vuln.type.toUpperCase()}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{vuln.description}</p>
                      <div className="bg-muted/50 p-3 rounded text-sm">
                        <p className="font-medium mb-1">Recommendation:</p>
                        <p className="text-muted-foreground">{vuln.recommendation}</p>
                      </div>
                      {vuln.evidence && (
                        <div className="mt-2 text-xs text-muted-foreground">Evidence: {vuln.evidence}</div>
                      )}
                    </div>
                  ))}
                  {securityScan.vulnerabilities.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">No vulnerabilities found 🎉</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>SSL/TLS Configuration</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valid Certificate:</span>
                    <span className={securityScan.ssl.valid ? 'text-green-500' : 'text-red-500'}>
                      {securityScan.ssl.valid ? 'Yes' : 'No'}
                    </span>
                  </div>
                  {securityScan.ssl.issuer && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Issuer:</span>
                      <span>{securityScan.ssl.issuer}</span>
                    </div>
                  )}
                  {securityScan.ssl.protocol && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Protocol:</span>
                      <span>{securityScan.ssl.protocol}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Detected Technologies</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {securityScan.technologies.map((tech: string, i: number) => (
                    <Badge key={i} variant="secondary">{tech}</Badge>
                  ))}
                  {securityScan.technologies.length === 0 && (
                    <p className="text-sm text-muted-foreground">No technologies detected</p>
                  )}
                </div>
              </CardContent>
            </Card>
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
  );
}
