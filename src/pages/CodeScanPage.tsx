import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  GitBranch, ChevronDown, Key, Eye, EyeOff, Zap,
  ArrowRight, ArrowLeft, Lock, Unlock, AlertCircle,
  Shield, CheckCircle, RefreshCw, Building2, Star, GitFork,
} from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import { API_ENDPOINTS } from "@/config/api";
import { ApiClient } from "@/utils/api";
import { AuthService } from "@/services/auth.service";
import { ScanService } from "@/services/scan.service";

interface Branch {
  name: string;
  protected: boolean;
}

interface Repository {
  id: string;
  name: string;
  fullName: string;
  description: string | null;
  isPrivate: boolean;
  language: string;
  stars: number;
  forks: number;
  updatedAt: string;
  url: string;
  defaultBranch: string;
}

const SCAN_FEATURES = [
  { icon: Shield, label: "SAST", desc: "Static code analysis for vulnerabilities" },
  { icon: CheckCircle, label: "Dependencies", desc: "SCA — known CVEs in packages" },
  { icon: Zap, label: "Secrets", desc: "API keys, tokens, credentials detection" },
  { icon: GitBranch, label: "AI Patches", desc: "Automated fix suggestions via AI" },
];

const CodeScanPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const repoFullName = searchParams.get("repo") || "";

  const [repo, setRepo] = useState<Repository | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [loadingRepo, setLoadingRepo] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [aiApiKey, setAiApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect back if no repo param
  useEffect(() => {
    if (!repoFullName) {
      navigate("/repos");
    }
  }, [repoFullName, navigate]);

  // Fetch repo info + branches on mount
  useEffect(() => {
    if (!repoFullName) return;
    fetchRepoAndBranches();
  }, [repoFullName]);

  const fetchRepoAndBranches = async () => {
    try {
      setLoadingRepo(true);
      setError(null);

      // Use ApiClient — sends httpOnly cookie automatically
      const reposData = await ApiClient.get<{ repositories: Repository[] }>(
        API_ENDPOINTS.auth.repositories.replace(/^.*\/api/, '/api')
      );
      const found: Repository | undefined = reposData.repositories?.find(
        (r: Repository) => r.fullName === repoFullName
      );
      if (!found) {
        setError(`Repository "${repoFullName}" not found or you don't have access to it.`);
        setLoadingRepo(false);
        return;
      }
      setRepo(found);

      // Load branches
      setLoadingBranches(true);
      const [owner, repoName] = repoFullName.split("/");
      const branchData = await ApiClient.get<{ branches: Branch[] }>(
        API_ENDPOINTS.auth.branches(owner, repoName).replace(/^.*\/api/, '/api')
      );
      setBranches(branchData.branches || []);
      setSelectedBranch(found.defaultBranch);
    } catch (err: any) {
      if (err?.status === 401 || err?.response?.status === 401) { navigate("/login"); return; }
      setError(err.message || "Failed to load repository details.");
    } finally {
      setLoadingRepo(false);
      setLoadingBranches(false);
    }
  };

  const handleScan = async () => {
    if (!repo || !selectedBranch) return;
    try {
      setScanning(true);
      setError(null);
      const { scanId } = await ScanService.startScan({
        repoId: repo.id,
        repoName: repo.name,
        repoFullName: repo.fullName,
        repoUrl: repo.url,
        defaultBranch: selectedBranch,
      });
      navigate(`/scan?scanId=${scanId}`);
    } catch (err: any) {
      setError(err.message || "Failed to start scan. Please try again.");
      setScanning(false);
    }
  };

  const isOrg = repo ? repo.fullName.split("/")[0] !== repo.name : false;

  return (
    <PageLayout>
      <PageHeader
        title="Configure Scan"
        description="Review settings and launch the security scan for the selected repository."
        breadcrumbs={[
          { label: "Platform" },
          { label: "Code Scan" },
          { label: "Select Repository", href: "/repos" },
          { label: repoFullName || "Configure" },
        ]}
        actions={
          <button onClick={() => navigate("/repos")} className="btn-ghost-border gap-2 text-xs">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to repositories
          </button>
        }
      />

      {/* Error banner */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-xl flex items-start gap-3"
          style={{ background: "hsl(var(--destructive) / 0.08)", border: "1px solid hsl(var(--destructive) / 0.25)" }}
        >
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl">

        {/* ── LEFT: Scan Config Panel ─────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Repository card */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <div className="card-base p-5">
              <div className="text-xs font-mono text-muted-foreground mb-3 uppercase tracking-wider">
                Selected Repository
              </div>
              {loadingRepo ? (
                <div className="space-y-2">
                  <div className="skeleton h-5 w-48" style={{ borderRadius: 3 }} />
                  <div className="skeleton h-3 w-72" style={{ borderRadius: 3 }} />
                  <div className="skeleton h-3 w-32" style={{ borderRadius: 3 }} />
                </div>
              ) : repo ? (
                <div className="flex items-start gap-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "hsl(var(--primary) / 0.1)", border: "1px solid hsl(var(--primary) / 0.2)" }}
                  >
                    <GitBranch className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {repo.isPrivate
                        ? <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
                        : <Unlock className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />}
                      <h2
                        className="font-semibold truncate"
                        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: "hsl(var(--foreground))" }}
                      >
                        {repo.name}
                      </h2>
                      {isOrg && (
                        <span
                          className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                          style={{
                            background: "hsl(var(--muted))",
                            border: "1px solid hsl(var(--border))",
                            color: "hsl(var(--muted-foreground))",
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          <Building2 className="w-2.5 h-2.5" /> org
                        </span>
                      )}
                    </div>
                    <p
                      className="text-xs mb-1"
                      style={{ fontFamily: "'JetBrains Mono', monospace", color: "hsl(var(--muted-foreground) / 0.6)" }}
                    >
                      {repo.fullName}
                    </p>
                    {repo.description && (
                      <p className="text-xs text-muted-foreground mt-1">{repo.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {repo.language && repo.language !== "Unknown" && (
                        <span
                          className="px-1.5 py-0.5 rounded"
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 10,
                            background: "hsl(var(--muted))",
                            border: "1px solid hsl(var(--border))",
                          }}
                        >
                          {repo.language}
                        </span>
                      )}
                      <span className="flex items-center gap-1"><Star className="w-3 h-3" strokeWidth={1.5} />{repo.stars}</span>
                      <span className="flex items-center gap-1"><GitFork className="w-3 h-3" strokeWidth={1.5} />{repo.forks}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate("/repos")}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors shrink-0 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Change
                  </button>
                </div>
              ) : null}
            </div>
          </motion.div>

          {/* Branch selector */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
            <div className="card-base p-5">
              <div className="text-xs font-mono text-muted-foreground mb-3 uppercase tracking-wider">
                Branch
              </div>
              {loadingBranches ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-muted-foreground">Loading branches...</span>
                </div>
              ) : (
                <div className="relative max-w-xs">
                  <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <select
                    value={selectedBranch}
                    onChange={e => setSelectedBranch(e.target.value)}
                    className="input-base pl-9 pr-8 appearance-none w-full text-sm"
                  >
                    {branches.map(branch => (
                      <option key={branch.name} value={branch.name}>
                        {branch.name}{branch.protected ? " 🔒" : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                </div>
              )}
              {selectedBranch && repo && selectedBranch === repo.defaultBranch && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  Default branch · scanning from HEAD
                </p>
              )}
            </div>
          </motion.div>

          {/* AI API Key */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
            <div className="card-base p-5">
              <div className="text-xs font-mono text-muted-foreground mb-1 uppercase tracking-wider">
                AI API Key
                <span className="ml-2 normal-case font-sans tracking-normal font-medium px-1.5 py-0.5 rounded text-[10px]"
                  style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
                  optional
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Provide a Gemini or OpenAI API key to enable AI-powered patch suggestions and deeper analysis.
              </p>
              <div className="relative max-w-sm">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type={showKey ? "text" : "password"}
                  value={aiApiKey}
                  onChange={e => setAiApiKey(e.target.value)}
                  placeholder="sk-... or AIza..."
                  className="input-base pl-9 pr-10 w-full text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </motion.div>

          {/* Launch button */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
            <motion.button
              whileHover={!scanning && repo && selectedBranch ? { scale: 1.015 } : {}}
              whileTap={!scanning && repo && selectedBranch ? { scale: 0.985 } : {}}
              disabled={!repo || !selectedBranch || scanning || loadingRepo || loadingBranches}
              onClick={handleScan}
              className="btn-primary w-full gap-3 py-3.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ fontSize: 14 }}
            >
              {scanning ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Starting scan...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Start Security Scan
                  <ArrowRight className="w-4 h-4 ml-auto" />
                </>
              )}
            </motion.button>
          </motion.div>
        </div>

        {/* ── RIGHT: What's included sidebar ────────────────────────────── */}
        <div className="space-y-5">
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.08 }}
          >
            <div className="card-base p-5">
              <div className="text-xs font-mono text-muted-foreground mb-4 uppercase tracking-wider">
                What's Included
              </div>
              <div className="space-y-4">
                {SCAN_FEATURES.map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="flex items-start gap-3">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: "hsl(var(--primary) / 0.1)", border: "1px solid hsl(var(--primary) / 0.2)" }}
                    >
                      <Icon className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-foreground">{label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Estimated time */}
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.12 }}
          >
            <div className="card-base p-5">
              <div className="text-xs font-mono text-muted-foreground mb-3 uppercase tracking-wider">
                Estimated Time
              </div>
              <div className="space-y-2">
                {[
                  { range: "< 1 min", label: "Small repos (< 1k files)" },
                  { range: "1–3 min", label: "Medium repos (1k–10k files)" },
                  { range: "3–8 min", label: "Large repos (10k+ files)" },
                ].map(({ range, label }) => (
                  <div key={range} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono text-foreground">{range}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Org repo note */}
          <AnimatePresence>
            {isOrg && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
              >
                <div
                  className="p-4 rounded-xl text-xs"
                  style={{
                    background: "hsl(var(--primary) / 0.06)",
                    border: "1px solid hsl(var(--primary) / 0.2)",
                  }}
                >
                  <div className="flex items-center gap-2 font-semibold text-foreground mb-1">
                    <Building2 className="w-3.5 h-3.5 text-primary" />
                    Organization Repository
                  </div>
                  <p className="text-muted-foreground">
                    This repo belongs to an org. Make sure your GitHub token has <code className="bg-muted px-1 py-0.5 rounded">read:org</code> permission for full access.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </PageLayout>
  );
};

export default CodeScanPage;
