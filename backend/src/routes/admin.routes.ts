import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { User } from '../db/models/User.model.js';
import { Scan } from '../db/models/Scan.model.js';
import { WebsiteScan } from '../db/models/WebsiteScan.model.js';
import { PenetrationTest } from '../db/models/PenetrationTest.model.js';
import { MonitoredSite } from '../db/models/MonitoredSite.model.js';
import { LoadTest } from '../db/models/LoadTest.model.js';
import { requireAdmin } from '../middleware/admin.middleware.js';

const router = Router();

// Apply admin auth to all routes
router.use(requireAdmin);

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

    // Fetch all repos (up to 100 per page × 5 pages = 500 repos max)
    const { default: axios } = await import('axios');
    const repos: any[] = [];
    for (let page = 1; page <= 5; page++) {
      const { data } = await axios.get('https://api.github.com/user/repos', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'SentinelAI-Admin/1.0',
        },
        params: { per_page: 100, page, sort: 'updated', affiliation: 'owner,collaborator,organization_member' },
        validateStatus: () => true,
      });
      if (!Array.isArray(data) || data.length === 0) break;
      repos.push(...data.map((r: any) => ({
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
      })));
      if (data.length < 100) break;
    }

    res.json({ repos, total: repos.length, username: (user as any).username });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users/:id/repos/:owner/:repo/download
//   Uses github.com/archive/ URL (same as "Download ZIP" in GitHub web UI).
//   This produces CDN path: zip/refs/heads/{branch} — always works.
//   The api.github.com/zipball endpoint produces: legacy.zip/{branch} — 404s.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users/:id/repos/:owner/:repo/download', async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id).select('+githubAccessToken username').lean();
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const token = (user as any).githubAccessToken;
    if (!token) { res.status(400).json({ error: 'No stored GitHub token for this user.' }); return; }

    const { owner, repo } = req.params;
    const { default: axios } = await import('axios');

    const apiHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'SentinelAI-Admin/1.0',
    };

    // ── Step 1: Get live default branch ───────────────────────────────────
    let branch = (req.query.ref as string) || '';
    const meta = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers: apiHeaders, timeout: 15_000, validateStatus: s => s < 500 }
    );
    if (meta.status === 404) {
      res.status(404).json({ error: `Repo ${owner}/${repo} not found or inaccessible.` }); return;
    }
    if (meta.data?.default_branch) branch = meta.data.default_branch;
    if (!branch) branch = 'main';

    // ── Step 2: Capture CDN URL using github.com/archive/ (web UI format) ─
    // This endpoint redirects to: codeload.github.com/{owner}/{repo}/zip/refs/heads/{branch}
    // which is the CORRECT CDN format (NOT legacy.zip which 404s)
    const archiveUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${encodeURIComponent(branch)}.zip`;
    const archiveReq = await axios.get(archiveUrl, {
      headers: {
        // github.com uses "token" auth format (not "Bearer")
        Authorization: `token ${token}`,
        'User-Agent': 'SentinelAI-Admin/1.0',
      },
      maxRedirects: 0,   // capture the CDN redirect URL
      validateStatus: s => s === 301 || s === 302 || (s >= 200 && s < 400),
      timeout: 15_000,
    });

    if (archiveReq.status === 404) {
      res.status(404).json({ error: `Branch "${branch}" not found in ${owner}/${repo}.` }); return;
    }
    if (archiveReq.status === 401 || archiveReq.status === 403) {
      res.status(archiveReq.status).json({ error: 'GitHub token does not have access to this repo.' }); return;
    }

    // ── Step 3: Download ZIP from CDN — no auth needed (pre-signed URL) ───
    const cdnUrl = archiveReq.headers['location'] || archiveUrl;
    const cdnRes = await axios.get(cdnUrl, {
      responseType: 'arraybuffer',
      maxRedirects: 5,
      timeout: 120_000,
      validateStatus: s => s < 500,
    });

    if (cdnRes.status === 404) {
      res.status(404).json({ error: `Archive not found at CDN. URL: ${cdnUrl}` }); return;
    }

    const filename = `${owner}-${repo}-${branch}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', cdnRes.data.byteLength.toString());
    res.send(Buffer.from(cdnRes.data));

  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

export default router;
