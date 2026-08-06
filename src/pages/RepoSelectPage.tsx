import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Search, Lock, Unlock, Star, ArrowRight, GitBranch,
  AlertCircle, Key, Eye, EyeOff, GitFork, Clock, RefreshCw,
  ChevronDown,
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

// Language color map
const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f7df1e",
  Python: "#3572A5",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Swift: "#FA7343",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Vue: "#4FC08D",
  Svelte: "#ff3e00",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3.6e6);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
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

  useEffect(() => { fetchRepositories(); }, []);

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

  const handleScan = async () => {
    if (!selected || !selectedBranch) return;
    const selectedRepo = repositories.find(r => r.id === selected);
    if (!selectedRepo) return;
    try {
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
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        }
      />

      {/* Error banner */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-xl flex items-start gap-3"
          style={{
            background: "hsl(var(--destructive) / 0.08)",
            border: "1px solid hsl(var(--destructive) / 0.25)",
          }}
        >
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

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search repositories by name or description..."
          className="input-base pl-10"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {/* Stats row */}
      {!loading && !error && repositories.length > 0 && (
        <div className="flex items-center gap-4 mb-5 text-xs text-muted-foreground">
          <span>{repositories.length} repositories</span>
          {search && <span>· {filtered.length} matching</span>}
          <span>· {repositories.filter(r => !r.isPrivate).length} public, {repositories.filter(r => r.isPrivate).length} private</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card-base p-4 space-y-3">
              <div className="skeleton h-4 w-2/3 rounded" />
              <div className="skeleton h-3 w-full rounded" />
              <div className="skeleton h-3 w-1/2 rounded" />
              <div className="skeleton h-8 w-full rounded mt-2" />
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

      {/* Repo Grid */}
      {!loading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((repo, i) => {
            const isSelected = selected === repo.id;
            const langColor = LANG_COLORS[repo.language] || "#94A3B8";

            return (
              <motion.div
                key={repo.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
              >
                <div
                  className={`rounded-xl cursor-pointer transition-all overflow-hidden ${isSelected ? "card-glow" : "card-interactive"}`}
                  onClick={() => {
                    setSelected(repo.id);
                    if (!isSelected) fetchBranches(repo.fullName);
                  }}
                >
                  <div className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          {repo.isPrivate ? (
                            <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
                          ) : (
                            <Unlock className="w-3 h-3 text-muted-foreground shrink-0" />
                          )}
                          <h3 className="font-semibold text-foreground text-sm truncate">{repo.name}</h3>
                        </div>
                        <p className="text-[10px] text-muted-foreground/60 font-mono truncate">{repo.fullName}</p>
                      </div>
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: "hsl(var(--primary))" }}
                        >
                          <div className="w-2 h-2 rounded-full bg-white" />
                        </motion.div>
                      )}
                    </div>

                    {/* Description */}
                    {repo.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {repo.description}
                      </p>
                    )}

                    {/* Meta row */}
                    <div className="flex items-center gap-3 pt-2 text-xs text-muted-foreground"
                      style={{ borderTop: "1px solid hsl(var(--border))" }}>
                      {repo.language && (
                        <span className="flex items-center gap-1.5 min-w-0 truncate">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: langColor }} />
                          <span className="truncate">{repo.language}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1 shrink-0 ml-auto">
                        <Star className="w-3 h-3" />
                        {repo.stars}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        <GitFork className="w-3 h-3" />
                        {repo.forks}
                      </span>
                    </div>

                    {/* Updated */}
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                      <Clock className="w-3 h-3" />
                      Updated {timeAgo(repo.updatedAt)}
                    </div>
                  </div>

                  {/* Expanded: branch + key + scan */}
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22 }}
                        className="overflow-hidden"
                      >
                        <div
                          className="px-4 pb-4 pt-3 space-y-3"
                          style={{ borderTop: "1px solid hsl(var(--border))" }}
                          onClick={e => e.stopPropagation()}
                        >
                          {/* Branch selector */}
                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 block mb-1.5">
                              Branch
                            </label>
                            {loadingBranches ? (
                              <div className="flex items-center gap-2 py-2">
                                <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs text-muted-foreground">Loading branches...</span>
                              </div>
                            ) : (
                              <div className="relative">
                                <GitBranch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                                <select
                                  value={selectedBranch}
                                  onChange={e => setSelectedBranch(e.target.value)}
                                  className="input-base pl-8 pr-8 py-2 text-xs appearance-none"
                                >
                                  {branches.map(branch => (
                                    <option key={branch.name} value={branch.name}>
                                      {branch.name}{branch.protected ? " (protected)" : ""}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                              </div>
                            )}
                          </div>

                          {/* AI API Key */}
                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 block mb-1.5">
                              AI API Key <span className="normal-case font-normal">(optional)</span>
                            </label>
                            <div className="relative">
                              <Key className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                              <input
                                type={showKey ? "text" : "password"}
                                value={aiApiKey}
                                onChange={e => setAiApiKey(e.target.value)}
                                placeholder="Leave empty to use default"
                                className="input-base pl-8 pr-8 py-2 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => setShowKey(v => !v)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>

                          {/* Scan CTA */}
                          <motion.button
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            disabled={!selectedBranch}
                            onClick={handleScan}
                            className="btn-primary w-full justify-center text-sm"
                          >
                            Start Security Scan
                            <ArrowRight className="w-4 h-4" />
                          </motion.button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </PageLayout>
  );
};

export default RepoSelectPage;
