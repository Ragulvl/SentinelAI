const http = require("http");
const HTML = "<!DOCTYPE html><html><head><title>Clean</title></head><body><h1>Clean Target</h1><p>No APIs. No forms. Nothing to find.</p></body></html>";
const server = http.createServer((req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "default-src none");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
});
server.listen(3002, () => {
  console.log("[clean-target] http://localhost:3002 static only, proper headers, no APIs");
  console.log("[clean-target] Expected: exitReason=early_exit_no_new_findings, findings=[]");
});