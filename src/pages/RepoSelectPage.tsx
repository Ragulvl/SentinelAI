import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Search, Lock, Unlock, Star, ArrowRight, GitBranch,
  AlertCircle, Key, Eye, EyeOff, GitFork, Clock, RefreshCw,
  ChevronDown, X, Zap,
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

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6", JavaScript: "#f7df1e", Python: "#3572A5",
  Go: "#00ADD8", Rust: "#dea584", Java: "#b07219", "C++": "#f34b7d",
  C: "#555555", Ruby: "#701516", PHP: "#4F5D95", Swift: "#FA7343",
  Kotlin: "#A97BFF", Dart: "#00B4AB", Shell: "#89e051", HTML: "#e34c26",
  CSS: "#563d7c", Vue: "#4FC08D", Svelte: "#ff3e00",
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
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
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

      {/* Repo Grid — cards do NOT expand, selection is tracked separately */}
      {!loading && !error && filtered.length > 0 && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          style={{ paddingBottom: selected ? "160px" : "0" }}
        >
          {filtered.map((repo, i) => {
            const isSelected = selected === repo.id;
            const langColor = LANG_COLORS[repo.language] || "#94A3B8";

            return (
              <motion.div
                key={repo.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.3 }}
              >
                <div
                  onClick={() => handleSelect(repo)}
                  className={`relative rounded-xl cursor-pointer transition-all overflow-hidden h-full flex flex-col ${isSelected ? "card-glow ring-2" : "card-interactive"}`}
                  style={isSelected ? { ringColor: "hsl(var(--primary) / 0.5)" } : undefined}
                >
                  {/* Selected indicator */}
                  {isSelected && (
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl"
                      style={{ background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--secondary)))" }}
                    />
                  )}

                  <div className="p-4 space-y-3 flex-1">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {repo.isPrivate
                            ? <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
                            : <Unlock className="w-3 h-3 text-muted-foreground shrink-0" />}
                          <h3 className="font-semibold text-foreground text-sm truncate">{repo.name}</h3>
                        </div>
                        <p className="text-[10px] text-muted-foreground/60 font-mono truncate">{repo.fullName}</p>
                      </div>
                      <motion.div
                        animate={{ scale: isSelected ? 1 : 0, opacity: isSelected ? 1 : 0 }}
                        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: "hsl(var(--primary))" }}
                      >
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </motion.div>
                    </div>

                    {/* Description */}
                    {repo.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {repo.description}
                      </p>
                    )}

                    {/* Meta row */}
                    <div className="flex items-center gap-3 pt-2 text-xs text-muted-foreground mt-auto"
                      style={{ borderTop: "1px solid hsl(var(--border))" }}>
                      {repo.language && (
                        <span className="flex items-center gap-1.5 min-w-0 truncate">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: langColor }} />
                          <span className="truncate">{repo.language}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1 shrink-0 ml-auto">
                        <Star className="w-3 h-3" />{repo.stars}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        <GitFork className="w-3 h-3" />{repo.forks}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                      <Clock className="w-3 h-3" />
                      Updated {timeAgo(repo.updatedAt)}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Sticky Bottom Action Panel ───────────────────────── */}
      <AnimatePresence>
        {selectedRepo && (
          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className="fixed bottom-0 left-0 right-0 md:left-[224px] z-40"
            style={{ backdropFilter: "blur(24px)" }}
          >
            <div
              className="border-t"
              style={{
                background: "hsl(222 22% 7% / 0.97)",
                borderColor: "hsl(var(--border))",
                boxShadow: "0 -8px 40px hsl(234 100% 68% / 0.1)",
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
