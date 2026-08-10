import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Search, Lock, Unlock, Star, ArrowRight, GitBranch,
  AlertCircle, Key, Eye, EyeOff, GitFork, Clock, RefreshCw,
  ChevronDown, X, Zap, ChevronLeft, ChevronRight,
} from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import { API_ENDPOINTS } from "@/config/api";
import { AuthService } from "@/services/auth.service";
import { ScanService } from "@/services/scan.service";

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

interface Branch {
  name: string;
  protected: boolean;
}

// Language short codes — monospace labels instead of colored dots
const LANG_SHORT: Record<string, string> = {
  TypeScript: ".ts", JavaScript: ".js", Python: ".py",
  Go: ".go", Rust: ".rs", Java: ".java", "C++": ".cpp",
  C: ".c", Ruby: ".rb", PHP: ".php", Swift: ".swift",
  Kotlin: ".kt", Dart: ".dart", Shell: ".sh", HTML: ".html",
  CSS: ".css", Vue: ".vue", Svelte: ".svelte",
};

function timeAgo(dateStr: string): string {
  if (!dateStr) return "recently";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "recently";
  const diff = Date.now() - d.getTime();
  const hours = Math.floor(diff / 3.6e6);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

const RepoSelectPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiApiKey, setAiApiKey] = useState<string>("");
  const [showKey, setShowKey] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [repoPage, setRepoPage] = useState(1);
  const REPOS_PER_PAGE = 12;

  useEffect(() => { fetchRepositories(); }, []);
  // Reset repo page when search changes
  useEffect(() => { setRepoPage(1); }, [search]);

  const fetchRepositories = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = AuthService.getToken();
      if (!token) { setError("Not authenticated. Please log in again."); return; }

      const response = await fetch(API_ENDPOINTS.auth.repositories, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          const msg = errorData.error || "";
          if (msg.includes("GitHub access token")) {
            setError("GitHub access token missing. Please log out and log in again to re-authorize.");
          } else {
            setError("Session expired. Please log in again.");
            setTimeout(() => navigate("/login"), 2000);
          }
          return;
        }
        throw new Error(errorData.error || "Failed to fetch repositories");
      }

      const data = await response.json();
      setRepositories(data.repositories || []);
    } catch (err) {
      console.error("Error fetching repositories:", err);
      setError("Failed to load repositories. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async (repoFullName: string) => {
    try {
      setLoadingBranches(true);
      const token = AuthService.getToken();
      if (!token) return;
      const [owner, repo] = repoFullName.split("/");
      const response = await fetch(API_ENDPOINTS.auth.branches(owner, repo), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch branches");
      const data = await response.json();
      setBranches(data.branches || []);
      const selectedRepo = repositories.find(r => r.fullName === repoFullName);
      if (selectedRepo) setSelectedBranch(selectedRepo.defaultBranch);
    } catch {
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  };

  const filtered = repositories.filter(r =>
    r.fullName.toLowerCase().includes(search.toLowerCase()) ||
    (r.description || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (repo: Repository) => {
    if (selected === repo.id) {
      setSelected(null);
      setBranches([]);
      setSelectedBranch("");
      return;
    }
    setSelected(repo.id);
    fetchBranches(repo.fullName);
  };

  const handleScan = async () => {
    if (!selected || !selectedBranch) return;
    const selectedRepo = repositories.find(r => r.id === selected);
    if (!selectedRepo) return;
    try {
      setScanning(true);
      const { scanId } = await ScanService.startScan({
        repoId: selectedRepo.id,
        repoName: selectedRepo.name,
        repoFullName: selectedRepo.fullName,
        repoUrl: selectedRepo.url,
        defaultBranch: selectedBranch,
      });
      navigate(`/scan?scanId=${scanId}`);
    } catch (error: any) {
      console.error("Error starting scan:", error);
      setError(error.message || "Failed to start scan");
    } finally {
      setScanning(false);
    }
  };

  const selectedRepo = repositories.find(r => r.id === selected);

  return (
    <PageLayout>
      <PageHeader
        title="Code Scan"
        description="Select a repository to scan for security vulnerabilities, dependency issues, and code quality problems."
        breadcrumbs={[{ label: "Platform" }, { label: "Code Scan" }]}
        actions={
          <button onClick={fetchRepositories} className="btn-ghost-border gap-2 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        }
      />

      {/* Error banner */}
      {error && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-xl flex items-start gap-3"
          style={{ background: "hsl(var(--destructive) / 0.08)", border: "1px solid hsl(var(--destructive) / 0.25)" }}>
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-destructive">{error}</p>
            <div className="flex items-center gap-4 mt-2">
              <button onClick={fetchRepositories} className="text-xs text-primary hover:underline">Try again</button>
              {(error.includes("log out") || error.includes("re-authorize")) && (
                <button
                  onClick={async () => { await AuthService.logout(); navigate("/login"); }}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  Log out & re-authenticate
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Search + stats */}
      <div className="flex items-center gap-4 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search repositories by name or description..."
            className="input-base pl-10 w-full"
          />
          {search && (
            <button onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground">
              Clear
            </button>
          )}
        </div>
        {!loading && !error && repositories.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
            <span>{repositories.length} repos</span>
            <span className="w-px h-3 bg-border" />
            <span>{repositories.filter(r => !r.isPrivate).length} public</span>
            <span>{repositories.filter(r => r.isPrivate).length} private</span>
          </div>
        )}
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="card-base p-4 space-y-3">
              <div className="skeleton h-4 w-2/3" style={{ borderRadius: 2 }} />
              <div className="skeleton h-3 w-full" style={{ borderRadius: 2 }} />
              <div className="skeleton h-3 w-1/2" style={{ borderRadius: 2 }} />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && repositories.length === 0 && (
        <div className="text-center py-20">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
            <GitBranch className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground mb-2">No repositories found</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Make sure you've granted repository access during login.
          </p>
          <button onClick={fetchRepositories} className="btn-secondary mt-4 text-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      )}

      {/* No search results */}
      {!loading && !error && repositories.length > 0 && filtered.length === 0 && (
        <div className="text-center py-16">
          <Search className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No repositories match "{search}"</p>
          <button onClick={() => setSearch("")} className="text-xs text-primary mt-2 hover:underline">Clear search</button>
        </div>
      )}

      {/* Repo Grid — 3 cols, compact, flat cards */}
      {!loading && !error && filtered.length > 0 && (
        <>
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            style={{ paddingBottom: selected ? "140px" : "0" }}
          >
          {filtered
            .slice((repoPage - 1) * REPOS_PER_PAGE, repoPage * REPOS_PER_PAGE)
            .map((repo, i) => {
            const isSelected = selected === repo.id;
            const langShort = LANG_SHORT[repo.language] || repo.language?.toLowerCase()?.slice(0, 4);

            return (
              <motion.div
                key={repo.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.025, duration: 0.28 }}
              >
                <div
                  onClick={() => handleSelect(repo)}
                  className={`relative cursor-pointer transition-all h-full flex flex-col ${isSelected ? "card-interactive selected" : "card-interactive"}`}
                  style={isSelected ? {
                    borderColor: "hsl(72 100% 50% / 0.5)",
                    borderLeftColor: "#C8FF00",
                    borderLeftWidth: 3,
                  } : undefined}
                >
                  <div className="p-4 space-y-2.5 flex-1">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {repo.isPrivate
                            ? <Lock className="w-3 h-3 shrink-0" strokeWidth={1.5} style={{ color: "hsl(var(--muted-foreground))" }} />
                            : <Unlock className="w-3 h-3 shrink-0" strokeWidth={1.5} style={{ color: "hsl(var(--dim-foreground))" }} />}
                          <h3
                            className="truncate"
                            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))" }}
                          >
                            {repo.name}
                          </h3>
                        </div>
                        <p
                          className="truncate"
                          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "hsl(var(--muted-foreground) / 0.5)" }}
                        >
                          {repo.fullName}
                        </p>
                      </div>
                      {isSelected && (
                        <div
                          className="w-4 h-4 shrink-0 flex items-center justify-center"
                          style={{ borderRadius: 2, background: "#C8FF00" }}
                        >
                          <div style={{ width: 6, height: 6, borderRadius: 1, background: "#080808" }} />
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    {repo.description && (
                      <p className="line-clamp-2" style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", lineHeight: 1.55 }}>
                        {repo.description}
                      </p>
                    )}

                    {/* Meta row */}
                    <div
                      className="flex items-center gap-3 pt-2.5 mt-auto"
                      style={{ borderTop: "1px solid hsl(var(--border))" }}
                    >
                      {langShort && (
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 10,
                            fontWeight: 500,
                            color: "hsl(var(--muted-foreground))",
                            background: "hsl(var(--muted))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 2,
                            padding: "1px 5px",
                          }}
                        >
                          {langShort}
                        </span>
                      )}
                      <span
                        className="flex items-center gap-1 ml-auto"
                        style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}
                      >
                        <Star className="w-3 h-3" strokeWidth={1.5} />{repo.stars}
                      </span>
                      <span
                        className="flex items-center gap-1"
                        style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}
                      >
                        <GitFork className="w-3 h-3" strokeWidth={1.5} />{repo.forks}
                      </span>
                      <span
                        style={{ fontSize: 10, color: "hsl(var(--dim-foreground))", fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {timeAgo(repo.updatedAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Pagination */}
        {filtered.length > REPOS_PER_PAGE && (
          <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: "1px solid hsl(var(--border))" }}>
            <span className="text-xs text-muted-foreground font-mono">
              {(repoPage - 1) * REPOS_PER_PAGE + 1}–{Math.min(repoPage * REPOS_PER_PAGE, filtered.length)} of {filtered.length} repositories
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setRepoPage(p => Math.max(1, p - 1))}
                disabled={repoPage === 1}
                className="btn-ghost-border p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.ceil(filtered.length / REPOS_PER_PAGE) }, (_, i) => i + 1)
                .filter(p => p === 1 || p === Math.ceil(filtered.length / REPOS_PER_PAGE) || Math.abs(p - repoPage) <= 1)
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
                    onClick={() => setRepoPage(p as number)}
                    className="w-7 h-7 rounded-lg text-xs font-mono font-medium transition-all"
                    style={{
                      background: repoPage === p ? 'hsl(var(--primary))' : 'transparent',
                      color: repoPage === p ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                      border: repoPage === p ? 'none' : '1px solid transparent',
                    }}
                  >
                    {p}
                  </button>
                ))}
              <button
                onClick={() => setRepoPage(p => Math.min(Math.ceil(filtered.length / REPOS_PER_PAGE), p + 1))}
                disabled={repoPage === Math.ceil(filtered.length / REPOS_PER_PAGE)}
                className="btn-ghost-border p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {/* ── Sticky Bottom Action Panel ─ flat, no blur ────────── */}
      <AnimatePresence>
        {selectedRepo && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className="fixed bottom-0 left-0 right-0 md:left-[220px] z-40"
          >
            <div
              className="border-t"
              style={{
                background: "hsl(var(--surface-2))",
                borderColor: "hsl(var(--border-active))",
                boxShadow: "0 -4px 20px rgb(0 0 0 / 0.7)",
              }}
            >
              <div className="max-w-7xl mx-auto px-4 md:px-6 py-4">
                <div className="flex items-center gap-4 flex-wrap">
                  {/* Repo info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "hsl(var(--primary) / 0.12)", border: "1px solid hsl(var(--primary) / 0.25)" }}>
                      <GitBranch className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{selectedRepo.name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">{selectedRepo.fullName}</p>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="h-8 w-px bg-border shrink-0 hidden sm:block" />

                  {/* Branch selector */}
                  <div className="flex items-center gap-2 min-w-0">
                    <GitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    {loadingBranches ? (
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs text-muted-foreground">Loading branches...</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <select
                          value={selectedBranch}
                          onChange={e => setSelectedBranch(e.target.value)}
                          className="input-base py-1.5 pr-8 text-xs appearance-none min-w-[140px]"
                          style={{ paddingLeft: "10px" }}
                        >
                          {branches.map(branch => (
                            <option key={branch.name} value={branch.name}>
                              {branch.name}{branch.protected ? " 🔒" : ""}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      </div>
                    )}
                  </div>

                  {/* AI API Key */}
                  <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-xs">
                    <Key className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="relative flex-1">
                      <input
                        type={showKey ? "text" : "password"}
                        value={aiApiKey}
                        onChange={e => setAiApiKey(e.target.value)}
                        placeholder="AI API key (optional)"
                        className="input-base pr-8 text-xs py-1.5 w-full"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(v => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 ml-auto shrink-0">
                    <button onClick={() => { setSelected(null); setBranches([]); setSelectedBranch(""); }}
                      className="icon-btn text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      disabled={!selectedBranch || scanning}
                      onClick={handleScan}
                      className="btn-primary gap-2 text-sm px-5 py-2"
                    >
                      {scanning
                        ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Scanning...</>
                        : <><Zap className="w-4 h-4" /> Start Security Scan<ArrowRight className="w-4 h-4" /></>
                      }
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageLayout>
  );
};

export default RepoSelectPage;
