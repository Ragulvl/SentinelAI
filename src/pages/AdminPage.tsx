import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

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

const API = import.meta.env.VITE_API_URL || '';
// Uses relative /api path — Vercel rewrites /api/* → sentinel-api-sigma.vercel.app/api/*

const getToken = () => localStorage.getItem('token') || '';

const apiFetch = async (path: string, opts?: RequestInit) => {
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
      ...(opts?.headers || {}),
    },
  });
  if (!r.ok) throw new Error((await r.json()).error || r.statusText);
  return r.json();
};

// ── Mini Components ─────────────────────────────────────────────────────────
const KPICard = ({ label, value, sub, icon, color }: { label: string; value: string | number; sub?: string; icon: string; color: string }) => (
  <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 16, padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
    <div style={{ position: 'absolute', top: 16, right: 16, fontSize: 28, opacity: 0.4 }}>{icon}</div>
    <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
    <div style={{ fontSize: 32, fontWeight: 700, color: color, lineHeight: 1 }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
    {sub && <div style={{ color: '#64748b', fontSize: 12, marginTop: 6 }}>{sub}</div>}
  </div>
);

const Badge = ({ text, color }: { text: string; color: string }) => (
  <span style={{ background: `${color}22`, color, border: `1px solid ${color}44`, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{text}</span>
);

const Spinner = () => (
  <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
    <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite' }} />
  </div>
);

// ── Main Admin Page ─────────────────────────────────────────────────────────
export default function AdminPage() {
  const { user, loading: authLoading, isAdmin, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'dashboard' | 'users' | 'scans' | 'activity' | 'system'>('dashboard');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [userSearch, setUserSearch] = useState('');
  const [activity, setActivity] = useState<Activity[]>([]);
  const [system, setSystem] = useState<any>(null);
  const [scans, setScans] = useState<any[]>([]);
  const [scanTotal, setScanTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ msg: string; onConfirm: () => void } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // Note: AdminRoute in App.tsx handles all role-based access control.
  // This guard only handles unauthenticated users (token expired etc.)
  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [authLoading, user, navigate]);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try { setStats(await apiFetch('/api/admin/stats')); }
    catch (e: any) { showToast(e.message, false); }
    finally { setLoading(false); }
  }, []);

  const loadUsers = useCallback(async (page = 1, search = '') => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/admin/users?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
      setUsers(data.users); setUserTotal(data.total); setUserPage(page);
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
    else if (tab === 'users') loadUsers();
    else if (tab === 'activity') loadActivity();
    else if (tab === 'system') loadSystem();
    else if (tab === 'scans') loadScans();
  }, [tab]);

  const updateRole = async (userId: string, role: string) => {
    try {
      await apiFetch(`/api/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
      showToast(`Role updated to ${role}`);
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
    setConfirmModal({
      msg: `Permanently delete user @${username} and ALL their data? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
          showToast(`User @${username} deleted`);
          loadUsers(userPage, userSearch);
        } catch (e: any) { showToast(e.message, false); }
      }
    });
  };

  const roleColor = (r: string) => r === 'superadmin' ? '#f59e0b' : r === 'admin' ? '#6366f1' : '#64748b';
  const fmtTime = (t: number) => { const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); return `${h}h ${m}m`; };

  const TABS = [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'users', label: '👥 Users' },
    { id: 'scans', label: '🔍 Scans' },
    { id: 'activity', label: '📋 Activity' },
    { id: 'system', label: '⚙️ System' },
  ] as const;

  return (
    <div style={{ minHeight: '100vh', background: 'hsl(224 71% 4%)', color: '#e2e8f0', fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
        button { cursor: pointer; border: none; outline: none; font-family: inherit; }
        input { font-family: inherit; outline: none; }
        table { border-collapse: collapse; width: 100%; }
        th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); }
        th { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; }
        td { font-size: 13px; color: #94a3b8; }
        tr:hover td { background: rgba(255,255,255,0.02); }
        .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 24px; }
      `}</style>

      {/* Confirm Modal */}
      {confirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.2s' }}>
          <div style={{ background: 'hsl(224 50% 8%)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 20, padding: 32, maxWidth: 420, width: '90%', animation: 'slideIn 0.2s' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <p style={{ color: '#e2e8f0', marginBottom: 24, lineHeight: 1.6 }}>{confirmModal.msg}</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setConfirmModal(null)} style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.06)', color: '#94a3b8', borderRadius: 10, fontWeight: 600 }}>Cancel</button>
              <button onClick={confirmModal.onConfirm} style={{ flex: 1, padding: '10px', background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 10, fontWeight: 600 }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 200, background: toast.ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${toast.ok ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`, borderRadius: 12, padding: '12px 20px', color: toast.ok ? '#34d399' : '#f87171', fontSize: 14, fontWeight: 600, animation: 'slideIn 0.3s', backdropFilter: 'blur(12px)' }}>
          {toast.ok ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ background: 'rgba(99,102,241,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 32px' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🛡️</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>SentinelAI</div>
              <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 600, letterSpacing: '0.1em' }}>SUPER ADMIN</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Badge text={`@${user?.username || '...'}`} color="#6366f1" />
            <button onClick={() => navigate('/')} style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid rgba(255,255,255,0.08)' }}>← Back to App</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 32px', background: 'rgba(0,0,0,0.2)' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', gap: 4 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '14px 18px', fontSize: 13, fontWeight: 600, color: tab === t.id ? '#6366f1' : '#64748b', background: 'transparent', borderBottom: `2px solid ${tab === t.id ? '#6366f1' : 'transparent'}`, transition: 'all 0.15s', marginBottom: -1 }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px' }}>

        {/* ── DASHBOARD ─────────────────────────────────────────────────────── */}
        {tab === 'dashboard' && (
          <div style={{ animation: 'fadeIn 0.3s' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
              <div>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: '#f1f5f9' }}>Dashboard Overview</h1>
                <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>Platform statistics and real-time health</p>
              </div>
              <button onClick={loadStats} style={{ background: 'rgba(99,102,241,0.15)', color: '#6366f1', padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: '1px solid rgba(99,102,241,0.3)' }}>↻ Refresh</button>
            </div>

            {loading ? <Spinner /> : stats ? (
              <>
                {/* User KPIs */}
                <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 700, color: '#6366f1', letterSpacing: '0.1em', textTransform: 'uppercase' }}>👥 Users</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
                  <KPICard label="Total Users" value={stats.users.total} sub={`+${stats.users.today} today`} icon="👥" color="#6366f1" />
                  <KPICard label="Active This Month" value={stats.users.activeMonth} sub={`+${stats.users.week} this week`} icon="🔥" color="#f59e0b" />
                  <KPICard label="Admins" value={stats.users.admins} icon="🛡️" color="#8b5cf6" />
                  <KPICard label="Banned" value={stats.users.banned} icon="🚫" color="#ef4444" />
                </div>

                {/* Scan KPIs */}
                <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 700, color: '#10b981', letterSpacing: '0.1em', textTransform: 'uppercase' }}>🔍 Scans</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
                  <KPICard label="Code Scans" value={stats.scans.code.total} sub={`+${stats.scans.code.today} today`} icon="💻" color="#10b981" />
                  <KPICard label="Pen Tests" value={stats.scans.pentest.total} sub={`+${stats.scans.pentest.today} today`} icon="🔓" color="#f59e0b" />
                  <KPICard label="Website Scans" value={stats.scans.website.total} sub={`+${stats.scans.website.today} today`} icon="🌐" color="#6366f1" />
                  <KPICard label="Load Tests" value={stats.scans.loadtest.total} icon="⚡" color="#ec4899" />
                </div>

                {/* System / DB */}
                <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>⚙️ System</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
                  <KPICard label="DB Status" value={stats.system.dbStatus.toUpperCase()} icon="🗄️" color={stats.system.dbStatus === 'connected' ? '#10b981' : '#ef4444'} />
                  <KPICard label="Memory" value={`${stats.system.memoryMB} MB`} icon="🧠" color="#8b5cf6" />
                  <KPICard label="Uptime" value={fmtTime(stats.system.uptime)} icon="⏱️" color="#f59e0b" />
                  <KPICard label="Active Monitors" value={stats.monitoring.activeSites} icon="📡" color="#10b981" />
                </div>

                {/* Charts */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  <MiniChart title="User Growth (7 days)" data={stats.charts.userGrowth} color="#6366f1" />
                  <MiniChart title="Scan Activity (7 days)" data={stats.charts.scanActivity} color="#10b981" />
                </div>
              </>
            ) : (
              <div className="card" style={{ textAlign: 'center', color: '#64748b' }}>Failed to load stats. <button onClick={loadStats} style={{ color: '#6366f1', background: 'none', fontWeight: 600 }}>Retry</button></div>
            )}
          </div>
        )}

        {/* ── USERS ─────────────────────────────────────────────────────────── */}
        {tab === 'users' && (
          <div style={{ animation: 'fadeIn 0.3s' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9' }}>User Management</h1>
                <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>{userTotal.toLocaleString()} total users</p>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <input value={userSearch} onChange={e => { setUserSearch(e.target.value); loadUsers(1, e.target.value); }} placeholder="Search users..." style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 16px', color: '#e2e8f0', fontSize: 13, width: 220 }} />
              </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {loading ? <Spinner /> : (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>User</th><th>Role</th><th>Status</th><th>Scans</th><th>Logins</th><th>Joined</th><th>Last Active</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u._id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <img src={u.avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)' }} />
                              <div>
                                <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13 }}>{u.name}</div>
                                <div style={{ color: '#64748b', fontSize: 12 }}>@{u.username}</div>
                              </div>
                            </div>
                          </td>
                          <td><Badge text={u.role} color={roleColor(u.role)} /></td>
                          <td><Badge text={u.isBanned ? 'Banned' : 'Active'} color={u.isBanned ? '#ef4444' : '#10b981'} /></td>
                          <td style={{ color: '#e2e8f0', fontWeight: 600 }}>{u.scanCount}</td>
                          <td>{u.loginCount}</td>
                          <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                          <td style={{ color: '#475569' }}>{timeSince(u.lastActive)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {u.role !== 'superadmin' && (
                                <>
                                  <select value={u.role} onChange={e => updateRole(u._id, e.target.value)} style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, color: '#818cf8', padding: '4px 8px', fontSize: 12 }}>
                                    <option value="user">user</option>
                                    <option value="admin">admin</option>
                                    <option value="superadmin">superadmin</option>
                                  </select>
                                  <button onClick={() => banUser(u._id, !u.isBanned)} style={{ background: u.isBanned ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: u.isBanned ? '#34d399' : '#f59e0b', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600 }}>
                                    {u.isBanned ? 'Unban' : 'Ban'}
                                  </button>
                                  <button onClick={() => deleteUser(u._id, u.username)} style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600 }}>Del</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
              {Array.from({ length: Math.ceil(userTotal / 20) }, (_, i) => i + 1).slice(0, 10).map(p => (
                <button key={p} onClick={() => loadUsers(p, userSearch)} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: p === userPage ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)', color: p === userPage ? '#6366f1' : '#64748b', border: `1px solid ${p === userPage ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'}` }}>{p}</button>
              ))}
            </div>
          </div>
        )}

        {/* ── SCANS ─────────────────────────────────────────────────────────── */}
        {tab === 'scans' && (
          <div style={{ animation: 'fadeIn 0.3s' }}>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9' }}>All Scans</h1>
              <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>{scanTotal} total scans across all users</p>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {loading ? <Spinner /> : (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead><tr><th>Type</th><th>Target / Repo</th><th>Date</th><th>Details</th></tr></thead>
                    <tbody>
                      {scans.map((s, i) => (
                        <tr key={i}>
                          <td><Badge text={s._type} color={s._type === 'pentest' ? '#f59e0b' : s._type === 'website' ? '#6366f1' : s._type === 'loadtest' ? '#ec4899' : '#10b981'} /></td>
                          <td style={{ color: '#e2e8f0', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url || s.repoFullName || s.targetUrl || '—'}</td>
                          <td>{new Date(s.createdAt).toLocaleString()}</td>
                          <td style={{ color: '#475569', fontSize: 12 }}>
                            {s.vulnerabilitiesFound !== undefined && `${s.vulnerabilitiesFound} vulns`}
                            {s.status && ` · ${s.status}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ACTIVITY ──────────────────────────────────────────────────────── */}
        {tab === 'activity' && (
          <div style={{ animation: 'fadeIn 0.3s' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9' }}>Activity Feed</h1>
                <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>Last 7 days of platform activity</p>
              </div>
              <button onClick={loadActivity} style={{ background: 'rgba(99,102,241,0.15)', color: '#6366f1', padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: '1px solid rgba(99,102,241,0.3)' }}>↻ Refresh</button>
            </div>
            {loading ? <Spinner /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activity.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, animation: `slideIn 0.2s ${i * 0.03}s both` }}>
                    <span style={{ fontSize: 22, flexShrink: 0 }}>{a.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>{a.message}</div>
                      {a.meta?.vulnerabilities !== undefined && <div style={{ color: '#f59e0b', fontSize: 12, marginTop: 2 }}>{a.meta.vulnerabilities} vulnerabilities found</div>}
                    </div>
                    <div style={{ color: '#475569', fontSize: 12, flexShrink: 0 }}>{timeSince(a.time)}</div>
                  </div>
                ))}
                {activity.length === 0 && <div style={{ textAlign: 'center', color: '#64748b', padding: 60 }}>No recent activity</div>}
              </div>
            )}
          </div>
        )}

        {/* ── SYSTEM ────────────────────────────────────────────────────────── */}
        {tab === 'system' && (
          <div style={{ animation: 'fadeIn 0.3s' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9' }}>System Health</h1>
                <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>Server, database, and environment status</p>
              </div>
              <button onClick={loadSystem} style={{ background: 'rgba(99,102,241,0.15)', color: '#6366f1', padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: '1px solid rgba(99,102,241,0.3)' }}>↻ Refresh</button>
            </div>
            {loading ? <Spinner /> : system && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
                <InfoCard title="🟢 Node.js" items={[['Version', system.node.version], ['Uptime', fmtTime(system.node.uptime)], ['PID', system.node.pid]]} />
                <InfoCard title="🧠 Memory" items={[['Heap Used', `${system.memory.heapUsedMB} MB`], ['Heap Total', `${system.memory.heapTotalMB} MB`], ['RSS', `${system.memory.rssMB} MB`], ['External', `${system.memory.externalMB} MB`]]} />
                <InfoCard title="🗄️ Database" items={[['Status', system.database.state], ['Host', system.database.host || '—'], ['Name', system.database.name || '—'], ['Collections', system.database.collections ?? '—'], ['Data Size', system.database.dataGB ? `${system.database.dataGB} GB` : '—']]} />
                <InfoCard title="⚙️ Environment" items={[['Node Env', system.env.nodeEnv || '—'], ['JWT Secret', system.env.hasJwtSecret ? '✅ Set' : '❌ Missing'], ['GitHub OAuth', system.env.hasGithubOAuth ? '✅ Set' : '❌ Missing'], ['Gemini API', system.env.hasGeminiKey ? '✅ Set' : '❌ Missing'], ['Telegram Bot', system.env.hasTelegramBot ? '✅ Set' : '⚠️ Not set'], ['Super Admin', system.env.superAdminGithub]]} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper Components ────────────────────────────────────────────────────────
function InfoCard({ title, items }: { title: string; items: [string, string | number][] }) {
  return (
    <div className="card">
      <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>{title}</div>
      {items.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ color: '#64748b', fontSize: 13 }}>{k}</span>
          <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500, maxWidth: '55%', textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function MiniChart({ title, data, color }: { title: string; data: { _id: string; count: number }[]; color: string }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="card">
      <div style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', marginBottom: 20 }}>{title}</div>
      {data.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#475569', padding: '20px 0' }}>No data this week</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80 }}>
          {data.map(d => (
            <div key={d._id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ fontSize: 10, color: '#64748b' }}>{d.count}</div>
              <div style={{ width: '100%', background: `${color}22`, borderRadius: 4, position: 'relative', height: Math.max(4, (d.count / max) * 60), background: `linear-gradient(to top, ${color}44, ${color}22)`, border: `1px solid ${color}44` }} />
              <div style={{ fontSize: 9, color: '#475569', whiteSpace: 'nowrap' }}>{d._id.slice(5)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function timeSince(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
