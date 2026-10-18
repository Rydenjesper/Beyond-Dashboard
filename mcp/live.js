/* Live link between Claude and an open Beyond Dashboard tab.
   Nothing listens until Claude calls connect_dashboard. Then a small HTTP server starts on 127.0.0.1 only,
   with a one-time pairing code the user types into the dashboard. After pairing:
     GET  /events?token=…  Server-Sent Events: commands to the dashboard ({ id, op, args })
     POST /reply?token=…   the dashboard's answer ({ id, ok, result | error })
   Only the dashboard's own origins are answered; everything needs the token; no dependencies. */
const http = require("node:http"), crypto = require("node:crypto");

const PORT = +process.env.BEYOND_LIVE_PORT || 47331;
const ORIGINS = [/^https:\/\/rydenjesper\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const CODE_TTL = 10 * 60e3, MAX_TRIES = 5, TIMEOUT = 15e3;

let server = null, code = null, codeUntil = 0, tries = 0, token = null, stream = null, keepalive = null, seq = 0;
const pending = new Map();
const allowed = o => !!o && ORIGINS.some(r => r.test(o));

function cors(req, res) {
  const o = req.headers.origin;
  if (allowed(o)) { res.setHeader("Access-Control-Allow-Origin", o); res.setHeader("Vary", "Origin"); }
  if (req.headers["access-control-request-private-network"]) res.setHeader("Access-Control-Allow-Private-Network", "true");   // Chrome: a public page talking to this computer
}
const json = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
const readBody = req => new Promise((ok, no) => {
  let size = 0, data = "";
  req.on("data", c => { size += c.length; if (size > 1e6) { no(new Error("too large")); req.destroy(); } else data += c; });
  req.on("end", () => { try { ok(data ? JSON.parse(data) : {}); } catch (e) { no(e); } });
});
const tokenOk = url => !!token && url.searchParams.get("token") === token;

async function handle(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600" }); return res.end(); }
  if (!allowed(req.headers.origin)) return json(res, 403, { error: "Only the Beyond Dashboard may connect." });
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method === "POST" && url.pathname === "/pair") {
    const body = await readBody(req).catch(() => ({}));
    if (!code || Date.now() > codeUntil) return json(res, 410, { error: "No pairing code is active. Ask Claude to connect again." });
    if (String(body.code || "").replace(/\D/g, "") !== code) {
      if (++tries >= MAX_TRIES) code = null;   // five wrong guesses and the code is gone
      return json(res, 401, { error: tries >= MAX_TRIES ? "Too many wrong codes. Ask Claude for a new one." : "Wrong code." });
    }
    code = null; token = crypto.randomBytes(24).toString("hex");
    return json(res, 200, { token });
  }
  if (req.method === "GET" && url.pathname === "/events") {
    if (!tokenOk(url)) return json(res, 401, { error: "Not paired." });
    if (stream) stream.end();   // one dashboard tab at a time: the newest wins
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(": connected\n\n");
    stream = res;
    clearInterval(keepalive); keepalive = setInterval(() => stream?.write(": ping\n\n"), 15e3);
    req.on("close", () => { if (stream === res) { stream = null; clearInterval(keepalive); } });
    return;
  }
  if (req.method === "POST" && url.pathname === "/reply") {
    if (!tokenOk(url)) return json(res, 401, { error: "Not paired." });
    const body = await readBody(req).catch(() => null);
    const p = body && pending.get(body.id);
    if (p) { pending.delete(body.id); clearTimeout(p.timer); body.ok ? p.ok(body.result) : p.no(new Error(body.error || "The dashboard refused that.")); }
    return json(res, 200, { ok: true });
  }
  json(res, 404, { error: "Not found" });
}

function start() {
  if (server) return Promise.resolve();
  return new Promise((ok, no) => {
    const s = http.createServer((req, res) => handle(req, res).catch(() => { try { json(res, 500, { error: "Server error" }); } catch {} }));
    s.once("error", e => no(e.code === "EADDRINUSE" ? new Error(`Port ${PORT} is busy: probably another Claude session already holds the dashboard connection. Close that session (or set BEYOND_LIVE_PORT) and try again.`) : e));
    s.listen(PORT, "127.0.0.1", () => { server = s; ok(); });
  });
}

/* Claude asks for a code; the user types it in the dashboard's Claude dialog. */
async function connect() {
  await start();
  code = String(crypto.randomInt(0, 1e6)).padStart(6, "0"); codeUntil = Date.now() + CODE_TTL; tries = 0;
  return { code: `${code.slice(0, 3)} ${code.slice(3)}`, port: PORT, connected: !!stream };
}

/* Send one command to the dashboard and wait for its answer. */
function send(op, args = {}) {
  if (!stream) return Promise.reject(new Error("The dashboard isn't connected. Call connect_dashboard and ask the user to enter the code in the dashboard (the Claude button at the top)."));
  const id = ++seq;
  return new Promise((ok, no) => {
    const timer = setTimeout(() => { pending.delete(id); no(new Error("The dashboard didn't answer. Is the tab still open?")); }, TIMEOUT);
    pending.set(id, { ok, no, timer });
    stream.write(`data: ${JSON.stringify({ id, op, args })}\n\n`);
  });
}

const status = () => ({ listening: !!server, connected: !!stream, port: PORT });
function stop() {
  clearInterval(keepalive); stream?.end(); stream = null; token = null; code = null;
  pending.forEach(p => { clearTimeout(p.timer); p.no(new Error("Disconnected.")); }); pending.clear();
  return new Promise(ok => server ? server.close(() => { server = null; ok(); }) : ok());
}

module.exports = { connect, send, status, stop, PORT };
