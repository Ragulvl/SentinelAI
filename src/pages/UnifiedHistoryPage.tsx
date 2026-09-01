import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, GitBranch, Globe, Target, Zap, Clock, AlertTriangle,
  XCircle, CheckCircle, Search, Activity, RefreshCw, ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import { API_ENDPOINTS } from "@/config/api";
import { AuthService } from "@/services/auth.service";
import { toast } from "@/hooks/use-toast";

type ScanType = "repository" | "website" | "penetration" | "load";

interface UnifiedScan {
  id: string;
  type: ScanType;
  target: string;
  url: string;
  date: string;
  status: string;
  vulnerabilities?: number;
  score?: number;
  summary?: any;
  results?: any;
  technologies?: string[];
}

// ── Type config ───────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<ScanType, {
  label: string;
  icon: React.ElementType;
  short: string;
}> = {
  repository: { label: "Repo Scan", icon: GitBranch, short: "repo" },
  website: { label: "Website", icon: Globe, short: "web" },
  penetration: { label: "Pentest", icon: Target, short: "pentest" },
  load: { label: "Load Test", icon: Zap, short: "load" },
};

const STATUS_CONFIG: Record<string, { icon: React.ElementType; label: string }> = {
  completed: { icon: CheckCircle, label: "Completed" },
  failed: { icon: XCircle, label: "Failed" },
  running: { icon: Activity, label: "Running" },
  pending: { icon: Clock, label: "Pending" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const ITEMS_PER_PAGE = 10;

const UnifiedHistoryPage = () => {
  const navigate = useNavigate();
  const [history, setHistory] = useState<UnifiedScan[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<UnifiedScan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<ScanType | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [stats, setStats] = useState({
    totalScans: 0, repoScans: 0, websiteScans: 0, pentests: 0, loadTests: 0,
  });

  useEffect(() => { loadHistory(); }, []);
  useEffect(() => { filterHistory(); }, [history, searchQuery, filterType]);
  // Reset to first page whenever filter/search changes
  useEffect(() => { setCurrentPage(1); }, [filteredHistory]);

  const calculateRepoScore = (summary: any): number => {
    const total = summary.total || 0;
    if (total === 0) return 100;
    const weighted = (summary.critical || 0) * 10 + (summary.high || 0) * 5 + (summary.medium || 0) * 2 + (summary.low || 0);
    return Math.max(0, Math.min(100, 100 - weighted));
  };

  const loadHistory = async () => {
    try {
      setIsLoading(true);
      const token = AuthService.getToken();

      try {
        const response = await fetch(`${API_ENDPOINTS.history.all}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setHistory(data.history);
          setStats(data.stats);
          return;
        }
      } catch { }

      const repoScans = await Promise.allSettled([
        fetch(`${API_ENDPOINTS.scan.history}`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.ok ? r.json() : { scans: [] }),
      ]);

      const repoScansData = repoScans[0].status === "fulfilled" ? (repoScans[0].value.scans || []) : [];

      const unifiedHistory: UnifiedScan[] = [
        ...repoScansData.map((scan: any) => ({
          id: scan.id, type: "repository" as ScanType, target: scan.repoFullName,
          url: scan.repoUrl || "", date: scan.startedAt, status: scan.status,
          summary: scan.summary, vulnerabilities: scan.summary?.total || 0,
          score: scan.summary ? calculateRepoScore(scan.summary) : 0,
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setHistory(unifiedHistory);
      setStats({
        totalScans: unifiedHistory.length, repoScans: repoScansData.length,
        websiteScans: 0, pentests: 0, loadTests: 0,
      });
    } catch {
      toast({ title: "Error", description: "Failed to load scan history", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const filterHistory = () => {
    let filtered = history;
    if (searchQuery) {
      filtered = filtered.filter(s =>
        s.target.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.url.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    if (filterType !== "all") filtered = filtered.filter(s => s.type === filterType);
    setFilteredHistory(filtered);
  };

  const handleScanClick = (scan: UnifiedScan) => {
    if (scan.type === "repository") navigate(`/results?scanId=${scan.id}`);
  };

  const filterTabs: Array<{ key: ScanType | "all"; label: string; count: number }> = [
    { key: "all", label: "All", count: stats.totalScans },
    { key: "repository", label: "Repo", count: stats.repoScans },
    { key: "penetration", label: "Pentest", count: stats.pentests },
    { key: "load", label: "Load", count: stats.loadTests },
  ];

  return (
    <PageLayout>
      <PageHeader
        title="Scan History"
        description="Complete history of all security scans, pentests, and load tests."
        breadcrumbs={[{ label: "Data" }, { label: "History" }]}
        actions={
          <button onClick={loadHistory} className="btn-ghost-border gap-2 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        }
      />

      {/* Stats row — flat, no gradient text */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-px mb-6"
        style={{
          background: 'hsl(var(--border))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        {[
          { label: "Total Scans", value: stats.totalScans, icon: Shield },
          { label: "Repo Scans", value: stats.repoScans, icon: GitBranch },
          { label: "Pentests", value: stats.pentests, icon: Target },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="p-4" style={{ background: 'hsl(var(--surface))' }}>
              <div className="section-label mb-2 flex items-center gap-1.5">
                <Icon className="w-3 h-3" strokeWidth={1.5} />
                {s.label}
              </div>
              <div className="metric-number" style={{ fontSize: 22, fontWeight: 700 }}>{s.value}</div>
            </div>
          );
        })}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by target or URL..."
            className="input-base pl-10"
          />
        </div>
        {/* Filter tabs — flat, IBM Plex Mono */}
        <div
          className="flex items-center"
          style={{
            background: 'hsl(var(--surface))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          {filterTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilterType(tab.key)}
              style={{
                padding: '7px 12px',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.04em',
                border: 'none',
                cursor: 'pointer',
                borderRight: '1px solid hsl(var(--border))',
                transition: 'background 140ms, color 140ms',
                background: filterType === tab.key ? '#C8FF00' : 'transparent',
                color: filterType === tab.key ? '#080808' : 'hsl(var(--muted-foreground))',
              }}
            >
              {tab.label}
              {tab.count > 0 && (
                <span style={{ marginLeft: 4, opacity: filterType === tab.key ? 0.5 : 0.4, fontSize: 9 }}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card-base p-4 flex items-center gap-4">
              <div className="skeleton w-9 h-9 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-1/3 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
              </div>
              <div className="skeleton h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
            <Activity className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground mb-2">
            {searchQuery || filterType !== "all" ? "No matching scans" : "No scans yet"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {searchQuery ? `No scans match "${searchQuery}"` : "Run your first security scan to see results here."}
          </p>
          {!searchQuery && filterType === "all" && (
            <button onClick={() => navigate("/repos")} className="btn-primary text-sm mt-5 gap-2">
              <GitBranch className="w-4 h-4" /> Start First Scan
            </button>
          )}
        </div>
      ) : (
        <div>
          <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filteredHistory
              .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
              .map((scan, i) => {
              const tc = TYPE_CONFIG[scan.type];
              const sc = STATUS_CONFIG[scan.status] || STATUS_CONFIG.completed;
              const StatusIcon = sc.icon;
              const TypeIcon = tc.icon;
              const scoreColor = scan.score !== undefined
                ? scan.score >= 80 ? "text-success" : scan.score >= 60 ? "text-warning" : "text-destructive"
                : "";

              return (
                <motion.div
                  key={scan.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => handleScanClick(scan)}
                  className="card-interactive flex items-center gap-4 group"
                  style={{ padding: '12px 16px' }}
                >
                  {/* Type icon: flat, monochrome square */}
                  <div
                    className="shrink-0 flex items-center justify-center"
                    style={{
                      width: 32, height: 32,
                      borderRadius: 'var(--radius-md)',
                      background: 'hsl(var(--muted))',
                      border: '1px solid hsl(var(--border))',
                    }}
                  >
                    <TypeIcon className="w-3.5 h-3.5" style={{ color: 'hsl(var(--muted-foreground))' }} strokeWidth={1.5} />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'hsl(var(--foreground))',
                        }}
                        className="truncate"
                      >
                        {scan.target}
                      </span>
                      <span className="badge badge-muted">{tc.short}</span>
                    </div>
                    <div className="flex items-center gap-3" style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" strokeWidth={1.5} />
                        {timeAgo(scan.date)}
                      </span>
                      {scan.vulnerabilities !== undefined && (
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" strokeWidth={1.5} />
                          {scan.vulnerabilities} issues
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Score */}
                  {scan.score !== undefined && (
                    <div className="text-center shrink-0">
                      <div
                        className="metric-number"
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: scan.score < 60 ? 'hsl(var(--destructive))' : 'hsl(var(--foreground))',
                        }}
                      >
                        {scan.score}
                      </div>
                      <div style={{ fontSize: 9, color: 'hsl(var(--muted-foreground))', letterSpacing: '0.05em' }}>SCORE</div>
                    </div>
                  )}

                  {/* Status */}
                  <div
                    className="flex items-center gap-1.5 shrink-0"
                    style={{ fontSize: 11, color: scan.status === 'failed' ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))' }}
                  >
                    <StatusIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
                    <span className="hidden sm:inline" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
                      {sc.label}
                    </span>
                  </div>

                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'hsl(var(--muted-foreground) / 0.3)' }} />
                </motion.div>
              );
            })}
          </AnimatePresence>
          </div>

          {/* Pagination */}
          {filteredHistory.length > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-between mt-5 pt-4" style={{ borderTop: "1px solid hsl(var(--border))" }}>
              <span className="text-xs text-muted-foreground font-mono">
                {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredHistory.length)} of {filteredHistory.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="btn-ghost-border p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.ceil(filteredHistory.length / ITEMS_PER_PAGE) }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === Math.ceil(filteredHistory.length / ITEMS_PER_PAGE) || Math.abs(p - currentPage) <= 1)
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
                      onClick={() => setCurrentPage(p as number)}
                      className="w-7 h-7 rounded-lg text-xs font-mono font-medium transition-all"
                      style={{
                        background: currentPage === p ? 'hsl(var(--primary))' : 'transparent',
                        color: currentPage === p ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                        border: currentPage === p ? 'none' : '1px solid transparent',
                      }}
                    >
                      {p}
                    </button>
                  ))}
                <button
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredHistory.length / ITEMS_PER_PAGE), p + 1))}
                  disabled={currentPage === Math.ceil(filteredHistory.length / ITEMS_PER_PAGE)}
                  className="btn-ghost-border p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </PageLayout>
  );
};

export default UnifiedHistoryPage;
