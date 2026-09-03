import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { User } from '../db/models/User.model.js';
import { Scan } from '../db/models/Scan.model.js';
import { WebsiteScan } from '../db/models/WebsiteScan.model.js';
import { PenetrationTest } from '../db/models/PenetrationTest.model.js';
import { MonitoredSite } from '../db/models/MonitoredSite.model.js';
import { LoadTest } from '../db/models/LoadTest.model.js';
import { requireAdmin } from '../middleware/admin.middleware.js';
import { AuditLog, AuditAction } from '../db/models/AuditLog.model.js';
import { generateScanReportPdf, generatePentestReportPdf } from '../services/pdfReport.service.js';

const router = Router();

// Apply admin auth to all routes
router.use(requireAdmin);

// ── Audit log helper ──────────────────────────────────────────────────────────
async function logAction(req: Request, action: AuditAction, targetId?: string, targetType?: 'user' | 'scan' | 'pentest' | 'repo', metadata?: Record<string, any>) {
  try {
    const admin = (req as any).user;
    await AuditLog.create({
      adminId:       admin?.id ?? admin?._id ?? 'unknown',
      adminUsername: admin?.username ?? 'admin',
      action,
      targetId,
      targetType,
      metadata,
      ip: req.ip,
    });
  } catch { /* audit logging is non-fatal */ }
}


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/stats  — dashboard KPIs
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers, newUsersToday, newUsersWeek, activeUsersMonth,
      totalScans, scansToday,
      totalPentests, pentestsToday,
      totalWebScans, webScansToday,
      totalLoadTests,
      totalMonitored,
      bannedUsers, adminUsers,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: today } }),
      User.countDocuments({ createdAt: { $gte: weekAgo } }),
      User.countDocuments({ lastActive: { $gte: monthAgo } }),
      Scan.countDocuments(),
      Scan.countDocuments({ createdAt: { $gte: today } }),
      PenetrationTest.countDocuments(),
      PenetrationTest.countDocuments({ createdAt: { $gte: today } }),
      WebsiteScan.countDocuments(),
      WebsiteScan.countDocuments({ createdAt: { $gte: today } }),
      LoadTest.countDocuments(),
      MonitoredSite.countDocuments({ active: true }),
      User.countDocuments({ isBanned: true }),
      User.countDocuments({ role: { $in: ['admin', 'superadmin'] } }),
    ]);

    // User growth: last 7 days
    const userGrowth = await User.aggregate([
      { $match: { createdAt: { $gte: weekAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // Scan activity: last 7 days
    const scanActivity = await Scan.aggregate([
      { $match: { createdAt: { $gte: weekAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);


    const dbState = mongoose.connection.readyState;
    const dbStatus = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown';

    res.json({
      users: { total: totalUsers, today: newUsersToday, week: newUsersWeek, activeMonth: activeUsersMonth, banned: bannedUsers, admins: adminUsers },
      scans: {
        code: { total: totalScans, today: scansToday },
        pentest: { total: totalPentests, today: pentestsToday },
        website: { total: totalWebScans, today: webScansToday },
        loadtest: { total: totalLoadTests },
        totalToday: scansToday + pentestsToday + webScansToday,
      },
      monitoring: { activeSites: totalMonitored },
      charts: { userGrowth, scanActivity },
      system: {
        dbStatus,
        uptime: process.uptime(),
        memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users  — paginated user list
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const search = req.query.search as string;
    const role = req.query.role as string;
    const banned = req.query.banned as string;
    const sort = (req.query.sort as string) || 'createdAt';
    const order = req.query.order === 'asc' ? 1 : -1;

    const filter: any = {};
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }
    if (role) filter.role = role;
    if (banned === 'true') filter.isBanned = true;
    if (banned === 'false') filter.isBanned = false;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-githubAccessToken')
        .sort({ [sort]: order })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    // Enrich with scan counts using githubId (models use number userId = githubId)
    const githubIds = users.map(u => (u as any).githubId as number);
    const [scanCounts, pentestCounts] = await Promise.all([
      Scan.aggregate([{ $match: { userId: { $in: githubIds } } }, { $group: { _id: '$userId', count: { $sum: 1 } } }]),
      PenetrationTest.aggregate([{ $match: { userId: { $in: githubIds } } }, { $group: { _id: '$userId', count: { $sum: 1 } } }]),
    ]);
    const scanMap = Object.fromEntries(scanCounts.map(s => [s._id, s.count]));
    const pentestMap = Object.fromEntries(pentestCounts.map(p => [p._id, p.count]));

    const enriched = users.map(u => ({
      ...u,
      scanCount: (scanMap[(u as any).githubId] || 0) + (pentestMap[(u as any).githubId] || 0),
    }));

    res.json({ users: enriched, total, page, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users/:id  — single user details
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id).select('-githubAccessToken').lean();
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const gid = (user as any).githubId as number;
    const [scans, pentests, webScans, monitors] = await Promise.all([
      Scan.countDocuments({ userId: gid }),
      PenetrationTest.countDocuments({ userId: gid }),
      WebsiteScan.countDocuments({ userId: gid }),
      MonitoredSite.countDocuments({ userId: gid }),
    ]);

    res.json({ ...user, stats: { scans, pentests, webScans, monitors } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/users/:id/role  — update user role
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/users/:id/role', async (req: Request, res: Response) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin', 'superadmin'].includes(role)) {
      res.status(400).json({ error: 'Invalid role. Must be user|admin|superadmin' });
      return;
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('username role');
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    await logAction(req, 'user.role_change', req.params.id, 'user', { newRole: role, username: user.username });
    res.json({ message: `Role updated to ${role}`, user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/users/:id/ban  — ban / unban user
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/users/:id/ban', async (req: Request, res: Response) => {
  try {
    const { banned, reason } = req.body;
    const update = banned
      ? { isBanned: true, bannedAt: new Date(), bannedReason: reason || 'Policy violation' }
      : { isBanned: false, bannedAt: null, bannedReason: null };
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('username isBanned bannedReason');
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    await logAction(req, banned ? 'user.ban' : 'user.unban', req.params.id, 'user', { reason, username: user.username });
    res.json({ message: banned ? 'User banned' : 'User unbanned', user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/users/:id  — delete user + all their data
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    if (user.role === 'superadmin') {
      res.status(403).json({ error: 'Cannot delete superadmin' });
      return;
    }
    const gid = (user as any).githubId as number;
    await Promise.all([
      Scan.deleteMany({ userId: gid }),
      PenetrationTest.deleteMany({ userId: gid }),
      WebsiteScan.deleteMany({ userId: gid }),
      MonitoredSite.deleteMany({ userId: gid }),
      LoadTest.deleteMany({ userId: gid }),
      User.findByIdAndDelete(req.params.id),
    ]);
    res.json({ message: `User ${user.username} and all their data deleted` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/scans  — all scans across all users
// ─────────────────────────────────────────────────────────────────────────────
router.get('/scans', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
    const type = req.query.type as string; // code|pentest|website|loadtest
    const search = req.query.search as string;

    const results: any[] = [];

    if (!type || type === 'pentest') {
      const filter: any = {};
      if (search) filter.url = { $regex: search, $options: 'i' };
      const items = await PenetrationTest.find(filter)
        .sort({ createdAt: -1 }).limit(50).lean()
        .then(arr => arr.map(i => ({ ...i, _type: 'pentest' })));
      results.push(...items);
    }
    if (!type || type === 'website') {
      const filter: any = {};
      if (search) filter.url = { $regex: search, $options: 'i' };
      const items = await WebsiteScan.find(filter)
        .sort({ createdAt: -1 }).limit(50).lean()
        .then(arr => arr.map(i => ({ ...i, _type: 'website' })));
      results.push(...items);
    }
    if (!type || type === 'code') {
      const filter: any = {};
      if (search) filter.repoFullName = { $regex: search, $options: 'i' };
      const items = await Scan.find(filter)
        .sort({ createdAt: -1 }).limit(50).lean()
        .then(arr => arr.map(i => ({ ...i, _type: 'code' })));
      results.push(...items);
    }
    if (!type || type === 'loadtest') {
      const items = await LoadTest.find({})
        .sort({ createdAt: -1 }).limit(50).lean()
        .then(arr => arr.map(i => ({ ...i, _type: 'loadtest' })));
      results.push(...items);
    }

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const total = results.length;
    const paginated = results.slice((page - 1) * limit, page * limit);

    res.json({ scans: paginated, total, page, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/activity  — recent activity feed
// ─────────────────────────────────────────────────────────────────────────────
router.get('/activity', async (_req: Request, res: Response) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [recentUsers, recentPentests, recentScans, recentWebScans] = await Promise.all([
      User.find({ createdAt: { $gte: weekAgo } }).sort({ createdAt: -1 }).limit(10).select('username name avatarUrl createdAt role').lean(),
      PenetrationTest.find({ createdAt: { $gte: weekAgo } }).sort({ createdAt: -1 }).limit(10).lean(),
      Scan.find({ createdAt: { $gte: weekAgo } }).sort({ createdAt: -1 }).limit(10).lean(),
      WebsiteScan.find({ createdAt: { $gte: weekAgo } }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    const feed = [
      ...recentUsers.map(u => ({ type: 'user_joined', icon: '👤', message: `${u.name || u.username} joined`, time: u.createdAt, meta: u })),
      ...recentPentests.map(p => ({ type: 'pentest', icon: '🔍', message: `Pentest: ${(p as any).url}`, time: p.createdAt, meta: { vulnerabilities: (p as any).vulnerabilitiesFound } })),
      ...recentScans.map(s => ({ type: 'code_scan', icon: '💻', message: `Code scan: ${(s as any).repoFullName || 'unknown'}`, time: s.createdAt, meta: {} })),
      ...recentWebScans.map(w => ({ type: 'website_scan', icon: '🌐', message: `Website scan: ${(w as any).url}`, time: w.createdAt, meta: {} })),
    ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 40);

    res.json({ feed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/system  — server & DB health
// ─────────────────────────────────────────────────────────────────────────────
router.get('/system', async (_req: Request, res: Response) => {
  try {
    const mem = process.memoryUsage();
    const dbState = mongoose.connection.readyState;

    let dbStats: any = null;
    try {
      dbStats = await mongoose.connection.db?.stats();
    } catch { /* skip */ }

    res.json({
      node: { version: process.version, uptime: process.uptime(), pid: process.pid },
      memory: {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
        externalMB: Math.round(mem.external / 1024 / 1024),
      },
      database: {
        state: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown',
        host: mongoose.connection.host,
        name: mongoose.connection.name,
        collections: dbStats?.collections ?? null,
        dataGB: dbStats ? (dbStats.dataSize / 1024 / 1024 / 1024).toFixed(3) : null,
        indexSizeGB: dbStats ? (dbStats.indexSize / 1024 / 1024 / 1024).toFixed(3) : null,
      },
      env: {
        nodeEnv: process.env.NODE_ENV,
        hasJwtSecret: !!process.env.JWT_SECRET,
        hasGithubOAuth: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
        hasGeminiKey: !!process.env.GEMINI_API_KEY,
        hasTelegramBot: !!process.env.TELEGRAM_BOT_TOKEN,
        superAdminGithub: process.env.SUPER_ADMIN_GITHUB || '(not set)',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users/:id/repos  — list repos using the user's GitHub token
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users/:id/repos', async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id).select('+githubAccessToken username').lean();
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const token = (user as any).githubAccessToken;
    if (!token) { res.status(400).json({ error: 'User has no stored GitHub token. They may need to re-login.' }); return; }

    const { default: axios } = await import('axios');
    const ghHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'SentinelAI-Admin/1.0',
    };
    const repoMap = new Map<number, any>();

    const mapRepo = (r: any) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      private: r.private,
      language: r.language,
      stargazers: r.stargazers_count,
      forks: r.forks_count,
      size: r.size,          // KB
      defaultBranch: r.default_branch,
      updatedAt: r.updated_at,
      htmlUrl: r.html_url,
      owner: r.owner?.login,
    });

    // ── 1. Personal + collaborator repos (/user/repos) ────────────────────
    for (let page = 1; page <= 5; page++) {
      const { data } = await axios.get('https://api.github.com/user/repos', {
        headers: ghHeaders,
        params: { per_page: 100, page, sort: 'updated', affiliation: 'owner,collaborator,organization_member' },
        validateStatus: () => true,
      });
      if (!Array.isArray(data) || data.length === 0) break;
      data.forEach((r: any) => repoMap.set(r.id, mapRepo(r)));
      if (data.length < 100) break;
    }

    // ── 2. Organisation repos ─────────────────────────────────────────────
    // /user/repos with affiliation=organization_member needs read:org scope.
    // Explicit /user/orgs → /orgs/{org}/repos works without that scope.
    try {
      const orgsRes = await axios.get('https://api.github.com/user/orgs', {
        headers: ghHeaders,
        params: { per_page: 100 },
        validateStatus: () => true,
      });
      if (Array.isArray(orgsRes.data)) {
        await Promise.all(orgsRes.data.map(async (org: any) => {
          for (let page = 1; page <= 3; page++) {
            const { data } = await axios.get(`https://api.github.com/orgs/${org.login}/repos`, {
              headers: ghHeaders,
              params: { per_page: 100, page, sort: 'updated', type: 'all' },
              validateStatus: () => true,
            });
            if (!Array.isArray(data) || data.length === 0) break;
            data.forEach((r: any) => repoMap.set(r.id, mapRepo(r)));
            if (data.length < 100) break;
          }
        }));
      }
    } catch { /* org fetch is best-effort */ }

    const repos = Array.from(repoMap.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    res.json({ repos, total: repos.length, username: (user as any).username });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users/:id/repos/:owner/:repo/download
//   Uses @octokit/rest — the official GitHub API client.
//   Octokit handles the 302 redirect to CDN automatically and correctly.
//   Falls back to git trees + JSZip if the repo has no CDN archive (empty).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users/:id/repos/:owner/:repo/download', async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id).select('+githubAccessToken username').lean();
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const token = (user as any).githubAccessToken;
    if (!token) { res.status(400).json({ error: 'No stored GitHub token for this user.' }); return; }

    const { owner, repo } = req.params;
    const { default: axios } = await import('axios');

    const ghHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'SentinelAI-Admin/1.0',
    };

    // ── Step 1: Get repo metadata (default branch) ────────────────────────
    let ref = (req.query.ref as string) || '';
    const metaRes = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers: ghHeaders, timeout: 15_000, validateStatus: s => s < 500 }
    );
    if (metaRes.status === 404) {
      res.status(404).json({ error: `Repo ${owner}/${repo} not found or token lacks access.` }); return;
    }
    if (metaRes.status === 401 || metaRes.status === 403) {
      res.status(metaRes.status).json({ error: `Token rejected by GitHub (${metaRes.status}). User may need to re-login.` }); return;
    }
    if (metaRes.data?.default_branch) ref = metaRes.data.default_branch;
    if (!ref) ref = 'main';

    const isPrivate: boolean = metaRes.data?.private ?? false;

    // ── Step 2: Resolve branch → commit SHA → tree SHA ────────────────────
    // Using commits API is more reliable than passing branch name to git/trees
    const commitRes = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
      { headers: ghHeaders, timeout: 15_000, validateStatus: s => s < 500 }
    );

    if (commitRes.status === 404) {
      res.status(404).json({ error: `Branch "${ref}" not found in ${owner}/${repo}.` }); return;
    }
    if (commitRes.status === 409) {
      res.status(400).json({ error: `Repository ${owner}/${repo} is empty — no commits pushed yet.` }); return;
    }
    if (commitRes.status !== 200) {
      res.status(commitRes.status).json({
        error: `Could not resolve branch "${ref}" (HTTP ${commitRes.status})`,
        detail: commitRes.data
      }); return;
    }

    const treeSha: string = commitRes.data?.commit?.tree?.sha;
    if (!treeSha) {
      res.status(500).json({ error: 'GitHub commit response missing tree SHA.' }); return;
    }

    // ── Step 3: Try CDN zipball first (fast path) ─────────────────────────
    let zipBuffer: Buffer | null = null;
    let octokitErr = '';
    try {
      const { Octokit } = await import('@octokit/rest');
      const octokit = new Octokit({ auth: token });
      const archiveRes = await octokit.repos.downloadZipballArchive({
        owner, repo, ref,
        request: { parseSuccessResponseBody: false },
      }) as any;

      let buf: Buffer | null = null;
      if (archiveRes?.data instanceof ArrayBuffer) {
        buf = Buffer.from(archiveRes.data);
      } else if (Buffer.isBuffer(archiveRes?.data)) {
        buf = archiveRes.data;
      } else if (typeof archiveRes?.data?.arrayBuffer === 'function') {
        buf = Buffer.from(await archiveRes.data.arrayBuffer());
      } else if (archiveRes?.url) {
        const cdnR = await axios.get(archiveRes.url, {
          responseType: 'arraybuffer', timeout: 120_000, maxRedirects: 5
        });
        buf = Buffer.from(cdnR.data);
      }

      if (buf && buf[0] === 0x50 && buf[1] === 0x4B) {
        zipBuffer = buf;
      } else {
        octokitErr = `Octokit data type=${typeof archiveRes?.data}, url=${archiveRes?.url ?? 'none'}, bytes=${buf?.length ?? 0}`;
      }
    } catch (e: any) {
      octokitErr = e.message ?? String(e);
    }

    // ── Step 4: Build ZIP via git trees + blobs (reliable fallback) ───────
    if (!zipBuffer) {
      const treeRes = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
        { headers: ghHeaders, timeout: 30_000, validateStatus: s => s < 500 }
      );

      if (treeRes.status !== 200) {
        res.status(treeRes.status).json({
          error: `Could not read file tree (HTTP ${treeRes.status})`,
          treeSha,
          octokitErr,
          treeBody: treeRes.data,
        }); return;
      }

      const blobs = (treeRes.data.tree || []).filter((item: any) => item.type === 'blob');
      if (blobs.length === 0) {
        res.status(400).json({
          error: `Repository ${owner}/${repo} has no files on branch "${ref}".`,
          treeSha,
          octokitErr,
        }); return;
      }

      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const folder = zip.folder(`${owner}-${repo}-${ref}`)!;

      const BATCH = 20;
      for (let i = 0; i < blobs.length; i += BATCH) {
        await Promise.all(blobs.slice(i, i + BATCH).map(async (item: any) => {
          try {
            const blobRes = await axios.get(
              `https://api.github.com/repos/${owner}/${repo}/git/blobs/${item.sha}`,
              { headers: ghHeaders, timeout: 20_000, validateStatus: s => s < 500 }
            );
            if (blobRes.status === 200 && blobRes.data?.content) {
              folder.file(item.path, Buffer.from(blobRes.data.content, 'base64'));
            }
          } catch { /* skip unreadable files */ }
        }));
      }

      zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    }

    const filename = `${owner}-${repo}-${ref}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', zipBuffer!.byteLength.toString());
    await logAction(req, 'repo.download', undefined, 'repo', { owner, repo, ref });
    res.send(zipBuffer);

  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/audit-logs  — paginated audit log
// ─────────────────────────────────────────────────────────────────────────────
router.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const action = req.query.action as string | undefined;

    const filter: any = {};
    if (action) filter.action = action;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    await logAction(req, 'audit.view');
    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/analytics  — platform metrics for admin dashboard
// ─────────────────────────────────────────────────────────────────────────────
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Daily scan counts
    const [scansByDay, pentestsByDay, usersByDay, topVulnTypes] = await Promise.all([
      Scan.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      PenetrationTest.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      User.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Scan.aggregate([
        { $unwind: '$vulnerabilities' },
        { $group: { _id: '$vulnerabilities.title', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    await logAction(req, 'analytics.view');
    res.json({ scansByDay, pentestsByDay, usersByDay, topVulnTypes, days });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/pentest/:id/report.pdf  — download pentest PDF report
// ─────────────────────────────────────────────────────────────────────────────
router.get('/pentest/:id/report.pdf', async (req: Request, res: Response) => {
  try {
    const pentest = await PenetrationTest.findById(req.params.id).lean();
    if (!pentest) { res.status(404).json({ error: 'Pentest not found' }); return; }
    const pdfBuffer = await generatePentestReportPdf(pentest);
    const filename = `sentinelai-pentest-${(pentest as any).url?.replace(/https?:\/\//,'').replace(/[^a-z0-9]/gi,'-') ?? 'report'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await logAction(req, 'pentest.view', req.params.id, 'pentest', { action: 'pdf_download' });
    res.send(pdfBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

