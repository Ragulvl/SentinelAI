import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, GitBranch, Globe, Target, Zap, Clock, AlertTriangle,
  XCircle, CheckCircle, Search, Activity, RefreshCw, ChevronRight,
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
  color: string;
  bg: string;
}> = {
  repository: { label: "Repo Scan", icon: GitBranch, color: "text-primary", bg: "hsl(234 100% 68% / 0.1)" },
  website: { label: "Website", icon: Globe, color: "text-success", bg: "hsl(142 71% 45% / 0.1)" },
  penetration: { label: "Pentest", icon: Target, color: "text-destructive", bg: "hsl(0 84% 60% / 0.1)" },
  load: { label: "Load Test", icon: Zap, color: "text-warning", bg: "hsl(38 92% 50% / 0.1)" },
};

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  completed: { icon: CheckCircle, color: "text-success", label: "Completed" },
  failed: { icon: XCircle, color: "text-destructive", label: "Failed" },
  running: { icon: Activity, color: "text-primary", label: "Running" },
  pending: { icon: Clock, color: "text-muted-foreground", label: "Pending" },
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

const UnifiedHistoryPage = () => {
  const navigate = useNavigate();
  const [history, setHistory] = useState<UnifiedScan[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<UnifiedScan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<ScanType | "all">("all");
  const [stats, setStats] = useState({
    totalScans: 0, repoScans: 0, websiteScans: 0, pentests: 0, loadTests: 0,
  });

  useEffect(() => { loadHistory(); }, []);
  useEffect(() => { filterHistory(); }, [history, searchQuery, filterType]);

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

      const [repoScans, websiteScans] = await Promise.allSettled([
        fetch(`${API_ENDPOINTS.scan.history}`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.ok ? r.json() : { scans: [] }),
        fetch(`${API_ENDPOINTS.websiteScan.history}`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.ok ? r.json() : []),
      ]);

      const repoScansData = repoScans.status === "fulfilled" ? repoScans.value.scans || [] : [];
      const websiteScansData = websiteScans.status === "fulfilled" ? websiteScans.value : [];

      const unifiedHistory: UnifiedScan[] = [
        ...repoScansData.map((scan: any) => ({
          id: scan.id, type: "repository" as ScanType, target: scan.repoFullName,
          url: scan.repoUrl || "", date: scan.startedAt, status: scan.status,
          summary: scan.summary, vulnerabilities: scan.summary?.total || 0,
          score: scan.summary ? calculateRepoScore(scan.summary) : 0,
        })),
        ...websiteScansData.map((scan: any) => ({
          id: scan._id, type: "website" as ScanType, target: scan.url,
          url: scan.url, date: scan.scanDate, status: "completed",
          vulnerabilities: scan.vulnerabilities?.length || 0,
          score: scan.securityScore || 0, technologies: scan.technologies || [],
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setHistory(unifiedHistory);
      setStats({
        totalScans: unifiedHistory.length, repoScans: repoScansData.length,
        websiteScans: websiteScansData.length, pentests: 0, loadTests: 0,
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
    else if (scan.type === "website") navigate(`/website-scan/${scan.id}`);
  };

  const filterTabs: Array<{ key: ScanType | "all"; label: string; count: number }> = [
    { key: "all", label: "All", count: stats.totalScans },
    { key: "repository", label: "Repo", count: stats.repoScans },
    { key: "website", label: "Website", count: stats.websiteScans },
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

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Scans", value: stats.totalScans, icon: Shield },
          { label: "Repo Scans", value: stats.repoScans, icon: GitBranch },
          { label: "Website Scans", value: stats.websiteScans, icon: Globe },
          { label: "Pentests", value: stats.pentests, icon: Target },
        ].map(s => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-elevated p-4"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Icon className="w-3.5 h-3.5" />
                {s.label}
              </div>
              <div className="text-2xl font-black gradient-text-primary metric-number">{s.value}</div>
            </motion.div>
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
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
          {filterTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilterType(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterType === tab.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1.5 text-[10px] opacity-60">{tab.count}</span>
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
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filteredHistory.map((scan, i) => {
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
                  className="card-interactive p-4 flex items-center gap-4 group"
                >
                  {/* Type icon */}
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
                    style={{ background: tc.bg }}
                  >
                    <TypeIcon className={`w-4 h-4 ${tc.color}`} />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-semibold text-sm text-foreground truncate">{scan.target}</span>
                      <span className={`badge text-[10px] ${tc.color}`}
                        style={{ background: tc.bg, border: `1px solid ${tc.bg}` }}>
                        {tc.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {timeAgo(scan.date)}
                      </span>
                      {scan.vulnerabilities !== undefined && (
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {scan.vulnerabilities} issues
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Score */}
                  {scan.score !== undefined && (
                    <div className="text-center shrink-0">
                      <div className={`text-lg font-black metric-number ${scoreColor}`}>{scan.score}</div>
                      <div className="text-[9px] text-muted-foreground">score</div>
                    </div>
                  )}

                  {/* Status */}
                  <div className={`flex items-center gap-1.5 text-xs shrink-0 ${sc.color}`}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline font-medium">{sc.label}</span>
                  </div>

                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </PageLayout>
  );
};

export default UnifiedHistoryPage;
