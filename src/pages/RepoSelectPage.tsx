import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Search, Lock, Unlock, Star, ArrowRight, GitBranch,
  AlertCircle, GitFork, RefreshCw, Building2,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import { API_ENDPOINTS } from "@/config/api";
import { AuthService } from "@/services/auth.service";

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

// Language short codes — monospace labels
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

// Derive unique owner list from repos to count org repos
function getOwners(repos: Repository[]) {
  const map = new Map<string, number>();
  repos.forEach(r => {
    const owner = r.fullName.split("/")[0];
    map.set(owner, (map.get(owner) || 0) + 1);
  });
  return map;
}

const RepoSelectPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repoPage, setRepoPage] = useState(1);
  const [filterType, setFilterType] = useState<"all" | "public" | "private">("all");
  const REPOS_PER_PAGE = 12;

  useEffect(() => { fetchRepositories(); }, []);
  useEffect(() => { setRepoPage(1); }, [search, filterType]);

  const fetchRepositories = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(API_ENDPOINTS.auth.repositories, {
        credentials: 'include',   // sends httpOnly JWT cookie automatically
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

  const filtered = repositories.filter(r => {
    const matchesSearch =
      r.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (r.description || "").toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filterType === "all" ||
      (filterType === "public" && !r.isPrivate) ||
      (filterType === "private" && r.isPrivate);
    return matchesSearch && matchesFilter;
  });

  const handleSelect = (repo: Repository) => {
    navigate(`/code-scan?repo=${encodeURIComponent(repo.fullName)}`);
  };

  const owners = getOwners(repositories);
  const orgCount = [...owners.keys()].filter(o => {
    // Count owners that aren't the authenticated user's own username
    return repositories.some(r => r.fullName.startsWith(o + "/") && r.fullName !== r.name);
  }).length;

  const totalPages = Math.ceil(filtered.length / REPOS_PER_PAGE);
  const paginatedRepos = filtered.slice(
    (repoPage - 1) * REPOS_PER_PAGE,
    repoPage * REPOS_PER_PAGE
  );

  return (
    <PageLayout>
      <PageHeader
        title="Repositories"
        description="Select a repository to run a security scan. Includes personal and organization repositories."
        breadcrumbs={[{ label: "Platform" }, { label: "Code Scan" }, { label: "Select Repository" }]}
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

      {/* Stats bar */}
      {!loading && !error && repositories.length > 0 && (
        <div className="flex items-center gap-4 mb-5 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or description..."
              className="input-base pl-10 w-full"
            />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground">
                Clear
              </button>
            )}
          </div>

          {/* Filter pills */}
          <div className="flex items-center gap-1 shrink-0">
            {(["all", "public", "private"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilterType(f)}
                className="text-xs px-3 py-1.5 rounded-lg transition-all font-mono"
                style={{
                  background: filterType === f ? "hsl(var(--primary))" : "hsl(var(--muted))",
                  color: filterType === f ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                  border: `1px solid ${filterType === f ? "transparent" : "hsl(var(--border))"}`,
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Stat chips */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
            <span className="font-mono">{repositories.length} repos</span>
            <span className="w-px h-3 bg-border" />
            <span>{repositories.filter(r => !r.isPrivate).length} public</span>
            <span>{repositories.filter(r => r.isPrivate).length} private</span>
            {orgCount > 0 && (
              <>
                <span className="w-px h-3 bg-border" />
                <span className="flex items-center gap-1">
                  <Building2 className="w-3 h-3" />{orgCount} org{orgCount > 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Search bar when loading state done and no stats bar */}
      {!loading && !error && repositories.length === 0 && null}

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
            Make sure you've granted repository access during login. Organization repos require <code className="text-xs bg-muted px-1 py-0.5 rounded">read:org</code> permission.
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
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {paginatedRepos.map((repo, i) => {
              const langShort = LANG_SHORT[repo.language] || (repo.language !== "Unknown" ? repo.language?.toLowerCase()?.slice(0, 6) : null);
              const orgOwner = repo.fullName.split("/")[0];
              const isOrg = orgOwner.toLowerCase() !== repo.name.toLowerCase();

              return (
                <motion.div
                  key={repo.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.025, duration: 0.28 }}
                >
                  <div
                    onClick={() => handleSelect(repo)}
                    className="card-interactive cursor-pointer group"
                    style={{ height: 160, display: "flex", flexDirection: "column" }}
                  >
                    <div className="p-4 flex flex-col h-full">

                      {/* ── Header row ─────────────────────────────────── */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          {/* Repo name + lock icon */}
                          <div className="flex items-center gap-1.5">
                            {repo.isPrivate
                              ? <Lock className="w-3 h-3 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                              : <Unlock className="w-3 h-3 shrink-0 opacity-40" strokeWidth={1.5} />}
                            <h3
                              className="truncate font-semibold"
                              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "hsl(var(--foreground))" }}
                            >
                              {repo.name}
                            </h3>
                          </div>
                          {/* Owner / org badge row */}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {isOrg ? (
                              <span
                                className="flex items-center gap-1 shrink-0"
                                style={{
                                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
                                  color: "hsl(var(--primary))", background: "hsl(var(--primary) / 0.1)",
                                  border: "1px solid hsl(var(--primary) / 0.25)", borderRadius: 2, padding: "1px 5px",
                                }}
                              >
                                <Building2 className="w-2.5 h-2.5" />{orgOwner}
                              </span>
                            ) : (
                              <span
                                style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "hsl(var(--muted-foreground) / 0.5)" }}
                              >
                                {orgOwner}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Arrow on hover */}
                        <div
                          className="w-6 h-6 shrink-0 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
                          style={{ background: "hsl(var(--primary) / 0.12)", border: "1px solid hsl(var(--primary) / 0.25)" }}
                        >
                          <ArrowRight className="w-3 h-3 text-primary" />
                        </div>
                      </div>

                      {/* ── Description — fixed 2-line slot ────────────── */}
                      <p
                        className="line-clamp-2 flex-1"
                        style={{
                          fontSize: 11.5,
                          color: repo.description ? "hsl(var(--muted-foreground))" : "hsl(var(--muted-foreground) / 0.3)",
                          lineHeight: 1.5,
                          fontStyle: repo.description ? "normal" : "italic",
                        }}
                      >
                        {repo.description || "No description provided"}
                      </p>

                      {/* ── Meta row — pinned to bottom ────────────────── */}
                      <div
                        className="flex items-center gap-2.5 pt-2 mt-2 shrink-0"
                        style={{ borderTop: "1px solid hsl(var(--border))" }}
                      >
                        {langShort ? (
                          <span
                            style={{
                              fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 500,
                              color: "hsl(var(--muted-foreground))", background: "hsl(var(--muted))",
                              border: "1px solid hsl(var(--border))", borderRadius: 2, padding: "1px 5px",
                            }}
                          >
                            {langShort}
                          </span>
                        ) : (
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "hsl(var(--muted-foreground) / 0.3)" }}>
                            —
                          </span>
                        )}
                        <span className="flex items-center gap-1 ml-auto" style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                          <Star className="w-3 h-3" strokeWidth={1.5} />{repo.stars}
                        </span>
                        <span className="flex items-center gap-1" style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                          <GitFork className="w-3 h-3" strokeWidth={1.5} />{repo.forks}
                        </span>
                        <span style={{ fontSize: 9.5, color: "hsl(var(--dim-foreground))", fontFamily: "'JetBrains Mono', monospace" }}>
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
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - repoPage) <= 1)
                  .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && (arr[idx - 1] as number) < p - 1) acc.push("...");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, idx) => p === "..." ? (
                    <span key={`dots-${idx}`} className="text-xs text-muted-foreground px-1">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setRepoPage(p as number)}
                      className="w-7 h-7 rounded-lg text-xs font-mono font-medium transition-all"
                      style={{
                        background: repoPage === p ? "hsl(var(--primary))" : "transparent",
                        color: repoPage === p ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                        border: repoPage === p ? "none" : "1px solid transparent",
                      }}
                    >
                      {p}
                    </button>
                  ))}
                <button
                  onClick={() => setRepoPage(p => Math.min(totalPages, p + 1))}
                  disabled={repoPage === totalPages}
                  className="btn-ghost-border p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </PageLayout>
  );
};

export default RepoSelectPage;
