/**
 * vuln-target.js -- Deliberately vulnerable Express server for SentinelAI Phase 7 testing.
 *
 * INTENTIONAL vulnerabilities (all in-memory, no real damage possible):
 *  V1  SQLi-style: GET /api/search?q=  -- reflects raw query into SQL string in response
 *  V2  XSS:        GET /reflect?input= -- reflects unsanitized input into HTML
 *  V3  IDOR:       GET /api/users/:id  -- any authed user reads any record
 *  V4  BFLA:       DELETE /api/admin/users/:id -- no privilege check
 *  V5  Mass assign: POST /api/profile  -- accepts arbitrary fields incl. role
 *  V6  No rate limit: POST /api/login  -- no lockout on failed attempts
 *  V7  CORS wildcard: all routes
 *  V8  Missing headers: no X-Frame-Options, no CSP, no X-Content-Type-Options
 *  V9  Stack trace: GET /api/crash     -- leaks full error stack
 *  V10 Secret exposure: GET /api/debug -- leaks API key in JSON
 *
 * Run: node vuln-target.js   (port 3001)
 * Login: POST /api/login { username:"alice", password:"password123" } -> token
 * Header: Authorization: Bearer alice-session-token
 */

const express = require('express');
const cors = require('cors');
const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));  // V7

const USERS = {
  1: { id:1, username:'alice', email:'alice@example.com', role:'user',  password:'password123' },
  2: { id:2, username:'bob',   email:'bob@example.com',   role:'user',  password:'hunter2'     },
  3: { id:3, username:'admin', email:'admin@example.com', role:'admin', password:'admin123'    },
};
const SESSIONS = {
  'alice-session-token': 1,
  'bob-session-token':   2,
  'admin-session-token': 3,
};
const PROFILES = {
  1: { bio:'Alice here', role:'user' },
  2: { bio:'Bob here',   role:'user' },
};

function requireAuth(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  const userId = SESSIONS[token];
  if (!userId) return res.status(401).json({ error:'Unauthorized' });
  req.userId = userId;
  req.user   = USERS[userId];
  next();
}

app.get('/', (req, res) => {
  res.send('<html><body><h1>Vuln Target</h1>' +
    '<a href="/api/search?q=test">Search</a> | ' +
    '<a href="/reflect?input=hello">Reflect</a> | ' +
    '<a href="/api/debug">Debug</a>' +
    '<form method="POST" action="/api/login">' +
    '<input name="username"><input name="password" type="password"><button>Login</button></form>' +
    '</body></html>');
});

// V6 -- no rate limiting
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = Object.values(USERS).find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error:'Invalid credentials' });
  res.json({ token: username + '-session-token', userId: user.id, role: user.role });
});

// V1 -- SQLi-style reflection
app.get('/api/search', (req, res) => {
  const q = req.query.q || '';
  const simulatedQuery = "SELECT * FROM products WHERE name LIKE '%" + q + "%'";
  res.json({ query: simulatedQuery, results: q ? [{ id:1, name:'Result for: '+q }] : [] });
});

// V2 -- XSS reflection
app.get('/reflect', (req, res) => {
  const input = req.query.input || '';
  res.setHeader('Content-Type', 'text/html');
  res.send('<html><body><p>You searched for: ' + input + '</p></body></html>');
});

// V3 -- IDOR (no ownership check)
app.get('/api/users/:id', requireAuth, (req, res) => {
  const user = USERS[parseInt(req.params.id)];
  if (!user) return res.status(404).json({ error:'Not found' });
  const { password, ...safe } = user;
  res.json(safe);
});

app.get('/api/users', requireAuth, (req, res) => {
  res.json(Object.values(USERS).map(({ password, ...u }) => u));
});

// V4 -- BFLA (no admin check)
app.delete('/api/admin/users/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  if (!USERS[id]) return res.status(404).json({ error:'Not found' });
  delete USERS[id];
  res.json({ deleted: id, by: req.userId });
});

// V5 -- mass assignment
app.post('/api/profile', requireAuth, (req, res) => {
  PROFILES[req.userId] = { ...(PROFILES[req.userId] || {}), ...req.body };
  res.json({ profile: PROFILES[req.userId] });
});
app.get('/api/profile', requireAuth, (req, res) => {
  res.json({ profile: PROFILES[req.userId] || {} });
});

// V9 -- stack trace leak
app.get('/api/crash', (req, res) => {
  try { null.explode(); } catch(e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// V10 -- secret exposure
app.get('/api/debug', (req, res) => {
  res.json({ env:'development', api_key:'sk-prod-12345-SUPERSECRET', db_password:'hunter2' });
});

app.get('/api/items', (req, res) => {
  res.json({ page: parseInt(req.query.page)||1, items:[{id:1},{id:2}], total:2 });
});

app.listen(3001, () => {
  console.log('\n[vuln-target] http://localhost:3001');
  console.log('Vulns: V1=SQLi-reflect V2=XSS V3=IDOR V4=BFLA V5=MassAssign V6=NoRateLimit V7=CORS* V8=NoHeaders V9=StackTrace V10=SecretLeak');
  console.log('Creds: alice:password123 (token: alice-session-token)  admin:admin123 (admin-session-token)\n');
});
