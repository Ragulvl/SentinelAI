import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PageLayout } from '@/components/PageLayout';
import {
  Users, ShieldCheck, BarChart3, Activity, Cpu, RefreshCw,
  Ban, Trash2, ChevronRight, Search, Shield, Database,
  Server, AlertTriangle, CheckCircle2, XCircle, Clock,
  TrendingUp, Zap, Globe, Code2, Target, MemoryStick,
  FolderDown, Lock, Unlock, Star, GitFork, Download, X,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface AdminStats {
  users: { total: number; today: number; week: number; activeMonth: number; banned: number; admins: number };
  scans: { code: { total: number; today: number }; pentest: { total: number; today: number }; website: { total: number; today: number }; loadtest: { total: number }; totalToday: number };
  monitoring: { activeSites: number };
  charts: { userGrowth: { _id: string; count: number }[]; scanActivity: { _id: string; count: number }[] };
  system: { dbStatus: string; uptime: number; memoryMB: number; nodeVersion: string; timestamp: string };
}
interface AdminUser {
  _id: string; githubId: number; username: string; name: string; email: string;
  avatarUrl: string; role: string; isBanned: boolean; bannedReason?: string;
  loginCount: number; createdAt: string; lastLogin: string; lastActive: string;
  scanCount: number;
}
interface Activity { type: string; icon: string; message: string; time: string; meta: any }

// ── API Helper ─────────────────────────────────────────────────────────────
const getToken = () => localStorage.getItem('token') || '';
const apiFetch = async (path: string, opts?: RequestInit) => {
  const r = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
      ...(opts?.headers || {}),
    },
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
};

// ── Tiny helpers ───────────────────────────────────────────────────────────
function timeSince(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function fmtUptime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

// ── Sub-components ─────────────────────────────────────────────────────────
const Pill = ({ label, color }: { label: string; color: 'lime' | 'red' | 'amber' | 'violet' | 'muted' }) => {
  const map = {
    lime:   'bg-[hsl(72_100%_50%/0.1)]   text-[hsl(72_100%_50%)]   border-[hsl(72_100%_50%/0.25)]',
    red:    'bg-[hsl(358_75%_55%/0.1)]   text-[hsl(358_75%_60%)]   border-[hsl(358_75%_55%/0.25)]',
    amber:  'bg-[hsl(35_80%_45%/0.12)]   text-[hsl(35_80%_60%)]    border-[hsl(35_80%_45%/0.25)]',
    violet: 'bg-[hsl(258_90%_66%/0.1)]   text-[hsl(258_90%_70%)]   border-[hsl(258_90%_66%/0.25)]',
    muted:  'bg-[hsl(240_4%_11%)]        text-muted-foreground      border-border',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase border ${map[color]}`}>
      {label}
    </span>
  );
};

const RolePill = ({ role }: { role: string }) => {
  if (role === 'superadmin') return <Pill label="SUPER" color="lime" />;
  if (role === 'admin')      return <Pill label="ADMIN" color="violet" />;
  return <Pill label="USER" color="muted" />;
};

function KPICard({ icon: Icon, label, value, sub, accent = false }: {
  icon: any; label: string; value: string | number; sub?: string; accent?: boolean;
}) {
  return (
    <div className="relative rounded-xl border border-border bg-card p-5 overflow-hidden group hover:border-[hsl(var(--accent)/0.35)] transition-colors duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-2">{label}</p>
          <p className={`text-3xl font-black tabular-nums ${accent ? 'text-[hsl(var(--accent))]' : 'text-foreground'}`}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-lg ${accent ? 'bg-[hsl(var(--accent)/0.1)]' : 'bg-muted'}`}>
          <Icon size={18} className={accent ? 'text-[hsl(var(--accent))]' : 'text-muted-foreground'} />
        </div>
      </div>
      {accent && (
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--accent)/0.4)] to-transparent" />
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-muted-foreground px-2">{children}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function MiniChart({ title, data, color }: { title: string; data: { _id: string; count: number }[]; color: string }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-semibold text-muted-foreground mb-4">{title}</p>
      {data.length === 0 ? (
        <div className="text-center text-muted-foreground text-xs py-6">No data this week</div>
      ) : (
        <div className="flex items-end gap-1.5 h-16">
          {data.map(d => (
            <div key={d._id} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[9px] text-muted-foreground">{d.count}</span>
              <div
                className="w-full rounded-sm transition-all"
                style={{
                  height: Math.max(3, (d.count / max) * 44),
                  background: `${color}`,
                  opacity: 0.7 + (d.count / max) * 0.3,
                }}
              />
              <span className="text-[9px] text-muted-foreground/60 truncate w-full text-center">{d._id.slice(5)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoCard({ title, icon: Icon, items }: { title: string; icon: any; items: [string, React.ReactNode][] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={15} className="text-[hsl(var(--accent))]" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <div className="space-y-2.5">
        {items.map(([k, v]) => (
          <div key={k} className="flex justify-between items-center py-1.5 border-b border-border/50 last:border-0">
            <span className="text-xs text-muted-foreground">{k}</span>
            <span className="text-xs font-medium text-foreground text-right max-w-[55%] break-all">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Repo Browser Modal ───────────────────────────────────────────────────
interface GHRepo { id: number; name: string; fullName: string; description: string | null; private: boolean; language: string | null; stargazers: number; forks: number; size: number; defaultBranch: string; updatedAt: string; htmlUrl: string; owner: string }

function RepoModal({ userId, username, onClose }: { userId: string; username: string; onClose: () => void }) {
  const [repos, setRepos] = useState<GHRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token') || '';
    fetch(`/api/admin/users/${userId}/repos`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.repos) setRepos(d.repos); else setError(d.error || 'Failed'); })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, [userId]);

  const downloadRepo = async (repo: GHRepo) => {
    const key = repo.fullName;
    setDownloading(key);
    try {
      const token = localStorage.getItem('token') || '';
      // Step 1: Ask backend for the pre-signed GitHub CDN URL
      // Include the default branch so GitHub's CDN URL contains a valid ref
      const ref = encodeURIComponent(repo.defaultBranch || 'HEAD');
      const res = await fetch(
        `/api/admin/users/${userId}/repos/${repo.owner}/${repo.name}/download?ref=${ref}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);

      // Step 2: Open the CDN URL directly in the browser.
      // window.open / <a> navigation is NOT subject to CORS — browser downloads
      // the ZIP straight from GitHub CDN without any cross-origin restrictions.
      const a = document.createElement('a');
      a.href = data.downloadUrl;
      a.download = data.filename || `${repo.owner}-${repo.name}.zip`;
      a.target = '_blank';        // open in new tab as fallback
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e: any) { alert(e.message); }
    finally { setDownloading(null); }
  };

  const filtered = repos.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/75 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose}>
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl animate-in slide-in-from-bottom-4 duration-200 m-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <FolderDown size={16} className="text-[hsl(var(--accent))]" />
              <h3 className="text-sm font-bold text-foreground">@{username}'s Repositories</h3>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[hsl(var(--accent)/0.1)] text-[hsl(var(--accent))] border border-[hsl(var(--accent)/0.25)]">{repos.length}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Public + private repos via OAuth token</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><X size={16} /></button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-border">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter repositories..." className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-muted text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[hsl(var(--accent)/0.5)] transition-colors" />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
          {loading ? (
            <div className="flex justify-center py-12"><div className="w-7 h-7 rounded-full border-2 border-border border-t-[hsl(var(--accent))] animate-spin" /></div>
          ) : error ? (
            <div className="text-center py-12 text-sm text-[hsl(358_75%_60%)]">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-xs text-muted-foreground">No repositories found</div>
          ) : filtered.map(r => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 hover:border-[hsl(var(--accent)/0.25)] transition-colors group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {r.private ? <Lock size={10} className="text-muted-foreground shrink-0" /> : <Unlock size={10} className="text-muted-foreground shrink-0" />}
                  <span className="text-xs font-semibold text-foreground truncate">{r.name}</span>
                  {r.private && <span className="text-[9px] px-1.5 py-px rounded border border-border text-muted-foreground bg-muted">private</span>}
                  {r.language && <span className="text-[9px] px-1.5 py-px rounded border border-[hsl(var(--accent)/0.2)] text-[hsl(var(--accent))] bg-[hsl(var(--accent)/0.05)]">{r.language}</span>}
                </div>
                {r.description && <p className="text-[10px] text-muted-foreground truncate">{r.description}</p>}
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Star size={9} />{r.stargazers}</span>
                  <span className="flex items-center gap-1"><GitFork size={9} />{r.forks}</span>
                  <span>{(r.size / 1024).toFixed(1)} MB</span>
                  <span>Updated {new Date(r.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
              <button
                onClick={() => downloadRepo(r)}
                disabled={downloading === r.fullName}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[hsl(var(--accent)/0.3)] bg-[hsl(var(--accent)/0.07)] text-[hsl(var(--accent))] text-[10px] font-semibold hover:bg-[hsl(var(--accent)/0.14)] disabled:opacity-50 transition-colors shrink-0"
              >
                {downloading === r.fullName
                  ? <><RefreshCw size={10} className="animate-spin" /> Downloading...</>
                  : <><Download size={10} /> ZIP</>}
              </button>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div className="px-6 py-3 border-t border-border">
          <p className="text-[10px] text-muted-foreground">Downloads use @{username}'s stored OAuth token · Only repos within the authorized scope are accessible</p>
        </div>
      </div>
    </div>
  );
}

// ── Tab definitions ────────────────────────────────────────────────────────
const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'users',     label: 'Users',     icon: Users },
  { id: 'scans',     label: 'Scans',     icon: ShieldCheck },
  { id: 'activity',  label: 'Activity',  icon: Activity },
  { id: 'system',    label: 'System',    icon: Cpu },
] as const;
type TabId = typeof TABS[number]['id'];

// ── Main Component ─────────────────────────────────────────────────────────
export default function AdminPage() {
  const { user, loading: authLoading, isSuperAdmin } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab]               = useState<TabId>('dashboard');
  const [stats, setStats]           = useState<AdminStats | null>(null);
  const [users, setUsers]           = useState<AdminUser[]>([]);
  const [userTotal, setUserTotal]   = useState(0);
  const [userPage, setUserPage]     = useState(1);
  const [userSearch, setUserSearch] = useState('');
  const [activity, setActivity]     = useState<Activity[]>([]);
  const [system, setSystem]         = useState<any>(null);
  const [scans, setScans]           = useState<any[]>([]);
  const [scanTotal, setScanTotal]   = useState(0);
  const [loading, setLoading]       = useState(false);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);
  const [confirm, setConfirm]       = useState<{ msg: string; onConfirm: () => void } | null>(null);
  const [repoModal, setRepoModal]   = useState<{ userId: string; username: string } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [authLoading, user, navigate]);

  // ── Loaders ──
  const loadStats = useCallback(async () => {
    setLoading(true);
    try { setStats(await apiFetch('/api/admin/stats')); }
    catch (e: any) { showToast(e.message, false); }
    finally { setLoading(false); }
  }, []);

  const loadUsers = useCallback(async (page = 1, search = '') => {
    setLoading(true);
    try {
      const d = await apiFetch(`/api/admin/users?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
      setUsers(d.users); setUserTotal(d.total); setUserPage(page);
    } catch (e: any) { showToast(e.message, false); }
    finally { setLoading(false); }
  }, []);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    try { const d = await apiFetch('/api/admin/activity'); setActivity(d.feed); }
    catch (e: any) { showToast(e.message, false); }
    finally { setLoading(false); }
  }, []);

  const loadSystem = useCallback(async () => {
    setLoading(true);
    try { setSystem(await apiFetch('/api/admin/system')); }
    catch (e: any) { showToast(e.message, false); }
    finally { setLoading(false); }
  }, []);

  const loadScans = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const d = await apiFetch(`/api/admin/scans?page=${page}&limit=25`);
      setScans(d.scans); setScanTotal(d.total);
    } catch (e: any) { showToast(e.message, false); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'dashboard') loadStats();
    else if (tab === 'users')    loadUsers();
    else if (tab === 'activity') loadActivity();
    else if (tab === 'system')   loadSystem();
    else if (tab === 'scans')    loadScans();
  }, [tab]);

  // ── Actions ──
  const updateRole = async (userId: string, role: string) => {
    try {
      await apiFetch(`/api/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
      showToast(`Role updated → ${role}`);
      loadUsers(userPage, userSearch);
    } catch (e: any) { showToast(e.message, false); }
  };

  const banUser = async (userId: string, banned: boolean) => {
    try {
      await apiFetch(`/api/admin/users/${userId}/ban`, { method: 'PATCH', body: JSON.stringify({ banned }) });
      showToast(banned ? 'User banned' : 'User unbanned');
      loadUsers(userPage, userSearch);
    } catch (e: any) { showToast(e.message, false); }
  };

  const deleteUser = (userId: string, username: string) => {
    setConfirm({
      msg: `Permanently delete @${username} and ALL their data? This cannot be undone.`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
          showToast(`@${username} deleted`);
          loadUsers(userPage, userSearch);
        } catch (e: any) { showToast(e.message, false); }
      },
    });
  };

  const scanTypeColor = (t: string) =>
    t === 'pentest' ? 'amber' : t === 'loadtest' ? 'red' : t === 'website' ? 'violet' : 'lime';

  return (
    <PageLayout>
      {/* ── Repo Modal ── */}
      {repoModal && <RepoModal userId={repoModal.userId} username={repoModal.username} onClose={() => setRepoModal(null)} />}

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[200] flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold shadow-xl backdrop-blur-sm animate-in slide-in-from-top-2 duration-200
          ${toast.ok
            ? 'border-[hsl(142_45%_38%/0.4)] bg-[hsl(142_45%_38%/0.12)] text-[hsl(142_45%_55%)]'
            : 'border-[hsl(358_75%_55%/0.4)] bg-[hsl(358_75%_55%/0.12)] text-[hsl(358_75%_60%)]'}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* ── Confirm modal ── */}
      {confirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="rounded-2xl border border-[hsl(358_75%_55%/0.3)] bg-card p-8 max-w-sm w-[90%] shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
            <AlertTriangle size={32} className="text-[hsl(358_75%_60%)] mb-4" />
            <p className="text-sm text-foreground/90 leading-relaxed mb-6">{confirm.msg}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)}
                className="flex-1 py-2.5 rounded-lg bg-muted text-muted-foreground text-sm font-semibold hover:bg-muted/80 transition-colors">
                Cancel
              </button>
              <button onClick={confirm.onConfirm}
                className="flex-1 py-2.5 rounded-lg border border-[hsl(358_75%_55%/0.4)] bg-[hsl(358_75%_55%/0.1)] text-[hsl(358_75%_60%)] text-sm font-semibold hover:bg-[hsl(358_75%_55%/0.18)] transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
          <span>Platform</span>
          <ChevronRight size={12} />
          <span className="text-[hsl(var(--accent))] font-semibold">Admin Console</span>
          {isSuperAdmin && (
            <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[hsl(var(--accent)/0.3)] bg-[hsl(var(--accent)/0.07)] text-[10px] font-bold tracking-widest text-[hsl(var(--accent))] uppercase">
              <Shield size={9} /> SUPER
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">Admin Console</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Platform control — logged in as <span className="text-foreground font-medium">@{user?.username}</span>
            </p>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto pb-px">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all duration-150 -mb-px
                ${active
                  ? 'border-[hsl(var(--accent))] text-[hsl(var(--accent))]'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'}`}>
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── DASHBOARD ─────────────────────────────────────────────────── */}
      {tab === 'dashboard' && (
        <div className="animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-foreground">Platform Overview</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Real-time statistics and health</p>
            </div>
            <button onClick={loadStats}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-[hsl(var(--accent)/0.4)] transition-colors">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          {loading && !stats ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-border border-t-[hsl(var(--accent))] animate-spin" />
            </div>
          ) : stats ? (
            <div className="space-y-6">
              <div>
                <SectionLabel>Users</SectionLabel>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KPICard icon={Users}      label="Total Users"        value={stats.users.total}       sub={`+${stats.users.today} today`}  accent />
                  <KPICard icon={TrendingUp} label="Active This Month"  value={stats.users.activeMonth} sub={`+${stats.users.week} this week`} />
                  <KPICard icon={ShieldCheck} label="Admins"            value={stats.users.admins} />
                  <KPICard icon={Ban}         label="Banned"            value={stats.users.banned} />
                </div>
              </div>
              <div>
                <SectionLabel>Scan Activity</SectionLabel>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KPICard icon={Code2}   label="Code Scans"   value={stats.scans.code.total}    sub={`+${stats.scans.code.today} today`}    accent />
                  <KPICard icon={Target}  label="Pen Tests"    value={stats.scans.pentest.total} sub={`+${stats.scans.pentest.today} today`} />
                  <KPICard icon={Globe}   label="Web Scans"    value={stats.scans.website.total} sub={`+${stats.scans.website.today} today`} />
                  <KPICard icon={Zap}     label="Load Tests"   value={stats.scans.loadtest.total} />
                </div>
              </div>
              <div>
                <SectionLabel>Infrastructure</SectionLabel>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KPICard icon={Database}    label="DB Status"  value={stats.system.dbStatus.toUpperCase()} accent={stats.system.dbStatus === 'connected'} />
                  <KPICard icon={MemoryStick} label="Memory"     value={`${stats.system.memoryMB} MB`} />
                  <KPICard icon={Clock}       label="Uptime"     value={fmtUptime(stats.system.uptime)} />
                  <KPICard icon={Activity}    label="Monitors"   value={stats.monitoring.activeSites} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <MiniChart title="User Growth — 7 days" data={stats.charts.userGrowth}  color="hsl(72,100%,50%)" />
                <MiniChart title="Scan Activity — 7 days" data={stats.charts.scanActivity} color="hsl(142,45%,45%)" />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-10 text-center">
              <p className="text-muted-foreground text-sm">Failed to load stats.</p>
              <button onClick={loadStats} className="mt-3 text-xs text-[hsl(var(--accent))] font-semibold hover:underline">Retry</button>
            </div>
          )}
        </div>
      )}

      {/* ── USERS ─────────────────────────────────────────────────────── */}
      {tab === 'users' && (
        <div className="animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-foreground">User Management</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{userTotal.toLocaleString()} total users</p>
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={userSearch}
                onChange={e => { setUserSearch(e.target.value); loadUsers(1, e.target.value); }}
                placeholder="Search users..."
                className="pl-8 pr-3 py-2 rounded-lg border border-border bg-muted text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[hsl(var(--accent)/0.5)] w-48 transition-colors"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 rounded-full border-2 border-border border-t-[hsl(var(--accent))] animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      {['User', 'Role', 'Status', 'Scans', 'Logins', 'Joined', 'Last Active', 'Actions'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold tracking-widest uppercase text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u._id} className="border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <img src={u.avatarUrl} alt="" className="w-7 h-7 rounded-full border border-border" />
                            <div>
                              <div className="font-semibold text-foreground text-xs">{u.name}</div>
                              <div className="text-muted-foreground text-[10px]">@{u.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3"><RolePill role={u.role} /></td>
                        <td className="px-4 py-3">
                          {u.isBanned
                            ? <Pill label="Banned" color="red" />
                            : <Pill label="Active" color="lime" />}
                        </td>
                        <td className="px-4 py-3 font-semibold text-foreground">{u.scanCount}</td>
                        <td className="px-4 py-3 text-muted-foreground">{u.loginCount}</td>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-muted-foreground">{timeSince(u.lastActive)}</td>
                        <td className="px-4 py-3">
                          {u.role !== 'superadmin' ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setRepoModal({ userId: u._id, username: u.username })}
                                className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-border bg-muted text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:border-[hsl(var(--accent)/0.4)] transition-colors"
                                title="Browse repositories"
                              >
                                <FolderDown size={11} /> Repos
                              </button>
                              <select
                                value={u.role}
                                onChange={e => updateRole(u._id, e.target.value)}
                                className="rounded-md border border-border bg-muted text-[10px] font-semibold text-foreground px-2 py-1 focus:outline-none focus:border-[hsl(var(--accent)/0.5)] cursor-pointer"
                              >
                                <option value="user">user</option>
                                <option value="admin">admin</option>
                                <option value="superadmin">superadmin</option>
                              </select>
                              <button
                                onClick={() => banUser(u._id, !u.isBanned)}
                                className={`p-1.5 rounded-md border transition-colors ${u.isBanned
                                  ? 'border-[hsl(142_45%_38%/0.4)] bg-[hsl(142_45%_38%/0.1)] text-[hsl(142_45%_55%)] hover:bg-[hsl(142_45%_38%/0.18)]'
                                  : 'border-[hsl(35_80%_45%/0.4)] bg-[hsl(35_80%_45%/0.1)] text-[hsl(35_80%_60%)] hover:bg-[hsl(35_80%_45%/0.18)]'}`}
                                title={u.isBanned ? 'Unban user' : 'Ban user'}
                              >
                                <Ban size={12} />
                              </button>
                              <button
                                onClick={() => deleteUser(u._id, u.username)}
                                className="p-1.5 rounded-md border border-[hsl(358_75%_55%/0.3)] bg-[hsl(358_75%_55%/0.08)] text-[hsl(358_75%_60%)] hover:bg-[hsl(358_75%_55%/0.15)] transition-colors"
                                title="Delete user"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">Protected</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && !loading && (
                      <tr><td colSpan={8} className="text-center py-12 text-muted-foreground text-xs">No users found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {userTotal > 20 && (
            <div className="flex justify-center gap-1.5 mt-4">
              {Array.from({ length: Math.min(Math.ceil(userTotal / 20), 10) }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => loadUsers(p, userSearch)}
                  className={`w-8 h-8 rounded-lg text-xs font-semibold border transition-colors
                    ${p === userPage
                      ? 'border-[hsl(var(--accent)/0.4)] bg-[hsl(var(--accent)/0.1)] text-[hsl(var(--accent))]'
                      : 'border-border bg-muted text-muted-foreground hover:text-foreground'}`}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SCANS ─────────────────────────────────────────────────────── */}
      {tab === 'scans' && (
        <div className="animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-foreground">All Scans</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{scanTotal} total scans across all users</p>
            </div>
            <button onClick={() => loadScans()}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 rounded-full border-2 border-border border-t-[hsl(var(--accent))] animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      {['Type', 'Target / Repo', 'Date', 'Details'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold tracking-widest uppercase text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scans.map((s, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3"><Pill label={s._type} color={scanTypeColor(s._type) as any} /></td>
                        <td className="px-4 py-3 text-foreground font-medium max-w-xs truncate">{s.url || s.repoFullName || s.targetUrl || '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(s.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {s.vulnerabilitiesFound !== undefined && `${s.vulnerabilitiesFound} vulns`}
                          {s.status && ` · ${s.status}`}
                        </td>
                      </tr>
                    ))}
                    {scans.length === 0 && !loading && (
                      <tr><td colSpan={4} className="text-center py-12 text-muted-foreground text-xs">No scans found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ACTIVITY ──────────────────────────────────────────────────── */}
      {tab === 'activity' && (
        <div className="animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-foreground">Activity Feed</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Last 7 days of platform activity</p>
            </div>
            <button onClick={loadActivity}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 rounded-full border-2 border-border border-t-[hsl(var(--accent))] animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {activity.map((a, i) => (
                <div key={i} className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-3.5 hover:border-[hsl(var(--accent)/0.2)] transition-colors">
                  <span className="text-xl shrink-0">{a.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground font-medium truncate">{a.message}</p>
                    {a.meta?.vulnerabilities !== undefined && (
                      <p className="text-[10px] text-[hsl(var(--accent))] mt-0.5">{a.meta.vulnerabilities} vulnerabilities found</p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeSince(a.time)}</span>
                </div>
              ))}
              {activity.length === 0 && (
                <div className="rounded-xl border border-border bg-card py-16 text-center text-muted-foreground text-xs">No recent activity</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── SYSTEM ────────────────────────────────────────────────────── */}
      {tab === 'system' && (
        <div className="animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-foreground">System Health</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Server, database, and environment status</p>
            </div>
            <button onClick={loadSystem}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
          {loading && !system ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 rounded-full border-2 border-border border-t-[hsl(var(--accent))] animate-spin" />
            </div>
          ) : system && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoCard icon={Server} title="Node.js Runtime" items={[
                ['Version', system.node?.version ?? '—'],
                ['Uptime', fmtUptime(system.node?.uptime ?? 0)],
                ['PID', system.node?.pid ?? '—'],
              ]} />
              <InfoCard icon={MemoryStick} title="Memory" items={[
                ['Heap Used', `${system.memory?.heapUsedMB ?? '—'} MB`],
                ['Heap Total', `${system.memory?.heapTotalMB ?? '—'} MB`],
                ['RSS', `${system.memory?.rssMB ?? '—'} MB`],
                ['External', `${system.memory?.externalMB ?? '—'} MB`],
              ]} />
              <InfoCard icon={Database} title="Database" items={[
                ['Status', system.database?.state ?? '—'],
                ['Host', system.database?.host ?? '—'],
                ['Name', system.database?.name ?? '—'],
                ['Collections', system.database?.collections ?? '—'],
                ['Data Size', system.database?.dataGB ? `${system.database.dataGB} GB` : '—'],
              ]} />
              <InfoCard icon={ShieldCheck} title="Environment" items={[
                ['Node Env', system.env?.nodeEnv ?? '—'],
                ['JWT Secret', system.env?.hasJwtSecret ? '✅ Set' : '❌ Missing'],
                ['GitHub OAuth', system.env?.hasGithubOAuth ? '✅ Set' : '❌ Missing'],
                ['Gemini API', system.env?.hasGeminiKey ? '✅ Set' : '❌ Missing'],
                ['Telegram Bot', system.env?.hasTelegramBot ? '✅ Set' : '⚠️ Not set'],
                ['Super Admin', system.env?.superAdminGithub ?? '—'],
              ]} />
            </div>
          )}
        </div>
      )}
    </PageLayout>
  );
}
