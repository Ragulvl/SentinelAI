// Pure JavaScript Lambda — no TypeScript compilation needed.
// Tests if @vercel/node can run a plain JS handler at all.
// If THIS still fails, the issue is the Vercel project config, not our code.
module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify({
    pong: true,
    path: req.url,
    node: process.version,
    vercel: process.env.VERCEL,
    ts: new Date().toISOString(),
  }));
};
