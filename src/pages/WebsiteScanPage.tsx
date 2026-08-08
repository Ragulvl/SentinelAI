import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Globe, AlertTriangle, Loader2, CheckCircle2,
  History, Info, Zap, Target, Activity,
} from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import { websiteScanService } from "@/services/websiteScan.service";
import { useToast } from "@/hooks/use-toast";

// WebsiteScanPage — comprehensive multi-stage website security scanner

interface ScanProgress {
  stage: string;
  progress: number;
  message: string;
}

const SCAN_STAGES = [
  { id: "security",   threshold: 10, doneAt: 30,  label: "Security",   icon: Shield   },
  { id: "pentest",    threshold: 30, doneAt: 50,  label: "Pentest",    icon: Target   },
  { id: "load",       threshold: 50, doneAt: 70,  label: "Load Test",  icon: Zap      },
  { id: "resilience", threshold: 85, doneAt: 100, label: "Resilience", icon: Activity },
];

export default function WebsiteScanPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [url, setUrl] = useState(searchParams.get("url") || "");
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress>({ stage: "", progress: 0, message: "" });
  const [verificationError, setVerificationError] = useState<{ domain: string; message: string } | null>(null);

  useEffect(() => {
    const urlParam = searchParams.get("url");
    if (urlParam) { setUrl(urlParam); checkVerification(urlParam); }
  }, [searchParams]);

  const checkVerification = async (urlToCheck: string) => {
    try {
      const result = await websiteScanService.checkDomainVerification(urlToCheck);
      if (!result.verified) {
        setVerificationError({ domain: result.domain, message: `Domain ${result.domain} is not verified.` });
      } else {
        setVerificationError(null);
      }
    } catch { }
  };

  const handleScan = async () => {
    if (!url.trim()) {
      toast({ title: "URL required", description: "Please enter a website URL to scan.", variant: "destructive" });
      return;
    }
    try {
      setScanning(true);
      setVerificationError(null);

      setScanProgress({ stage: "security", progress: 10, message: "Scanning security headers and SSL..." });
      const securityResult = await websiteScanService.scanWebsite(url);

      setScanProgress({ stage: "pentest", progress: 30, message: "Running penetration tests..." });
      const pentestResult = await websiteScanService.penetrationTest(url);

      setScanProgress({ stage: "load", progress: 50, message: "Performing load testing..." });
      const loadTestResult = await websiteScanService.loadTest(url, { duration: 30, concurrentUsers: 10, requestsPerSecond: 10 });

      setScanProgress({ stage: "resilience", progress: 85, message: "Testing resilience..." });
      await websiteScanService.testResilience(url);

      setScanProgress({ stage: "complete", progress: 100, message: "Scan complete!" });
      toast({ title: "Comprehensive Scan Complete", description: "All tests completed successfully." });
      navigate(`/website-scan/${securityResult._id}?pentest=${pentestResult._id}&load=${loadTestResult._id}`);
    } catch (error: any) {
      if (error.response?.data?.requiresVerification) {
        const domain = error.response.data.domain;
        setVerificationError({ domain, message: error.response.data.message });
      } else {
        toast({ title: "Scan Failed", description: error.response?.data?.error || error.message || "Failed to scan website", variant: "destructive" });
      }
    } finally {
      setScanning(false);
      setScanProgress({ stage: "", progress: 0, message: "" });
    }
  };

  return (
    <PageLayout>
      <PageHeader
        title="Website Scanner"
        description="Multi-stage comprehensive security audit covering headers, SSL, penetration tests, load capacity, and resilience."
        breadcrumbs={[{ label: "Security Tools" }, { label: "Website Scanner" }]}
        actions={
          <button onClick={() => navigate("/scan-history")} className="btn-ghost-border gap-2 text-xs">
            <History className="w-3.5 h-3.5" /> History
          </button>
        }
      />

      <div className="max-w-2xl space-y-5">
        {/* Verification error */}
        <AnimatePresence>
          {verificationError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-4 flex items-start gap-3"
              style={{
                background: 'hsl(var(--destructive) / 0.06)',
                border: '1px solid hsl(var(--destructive) / 0.4)',
                borderRadius: 'var(--radius-md)',
                borderLeft: '3px solid hsl(var(--destructive))',
              }}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'hsl(var(--destructive))' }} />
              <div className="flex-1">
                <p style={{ fontSize: 13, color: 'hsl(var(--foreground))' }}>{verificationError.message}</p>
                <div className="flex gap-3 mt-2">
                  <button onClick={() => navigate("/domain-verification")} className="text-xs" style={{ color: '#C8FF00' }}>
                    Verify domain
                  </button>
                  <button onClick={() => setVerificationError(null)} className="text-xs text-muted-foreground hover:underline">
                    Dismiss
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* URL input card */}
        <div className="card-elevated p-6 space-y-5">
          <div>
            <label className="section-label block mb-2">Website URL</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="url"
                value={url}
                onChange={e => { setUrl(e.target.value); setVerificationError(null); }}
                onBlur={() => url && checkVerification(url)}
                placeholder="https://example.com"
                disabled={scanning}
                className="input-base pl-10 font-mono text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">Enter the full URL including https://</p>
          </div>

          {/* Progress */}
          <AnimatePresence>
            {scanning && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3 p-4 rounded-xl overflow-hidden"
                style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{scanProgress.message}</span>
                  <span className="font-mono text-primary font-semibold">{scanProgress.progress}%</span>
                </div>
                <div className="progress-bar">
                  <motion.div
                    className="progress-bar-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${scanProgress.progress}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {SCAN_STAGES.map(stage => {
                    const Icon = stage.icon;
                    const done = scanProgress.progress >= stage.doneAt;
                    const active = scanProgress.progress >= stage.threshold && !done;
                    return (
                      <div
                        key={stage.id}
                        className="flex items-center gap-1.5"
                        style={{
                          fontSize: 10,
                          fontFamily: "'JetBrains Mono', monospace",
                          color: done ? '#C8FF00' : active ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground) / 0.4)',
                        }}
                      >
                        {done
                          ? <CheckCircle2 className="w-3 h-3 shrink-0" />
                          : active
                            ? <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                            : <Icon className="w-3 h-3 shrink-0" />
                        }
                        {stage.label}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleScan}
              disabled={scanning || !url.trim()}
              className="btn-primary flex-1 justify-center"
            >
              {scanning ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Running Comprehensive Scan...</>
              ) : (
                <><Shield className="w-4 h-4" /> Start Comprehensive Scan</>
              )}
            </button>
            <button onClick={() => navigate("/domain-verification")} className="btn-secondary px-4">
              Domains
            </button>
          </div>

          {/* Info box */}
          <div
            className="flex items-start gap-2.5 p-3.5 rounded-xl text-xs text-muted-foreground"
            style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}
          >
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground/60" />
            <ul className="space-y-1">
              <li>Verify domain ownership before scanning</li>
              <li>Only scan websites you own or are authorized to test</li>
              <li>Comprehensive scan takes 2–3 minutes</li>
            </ul>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
