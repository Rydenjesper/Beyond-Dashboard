const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "proxy", "worker.js"), "utf8");
const worker = () => import("data:text/javascript," + encodeURIComponent(src)).then(m => m.default);
const req = (url, init = {}) => new Request(`https://proxy.test/?url=${encodeURIComponent(url)}`, init);

test("proxy passes feeds through with CORS headers", async () => {
  const w = await worker(), real = globalThis.fetch;
  globalThis.fetch = async () => new Response("<rss></rss>", { headers: { "Content-Type": "application/rss+xml" } });
  try {
    const res = await w.fetch(req("https://example.com/feed.xml"), {});
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(await res.text(), "<rss></rss>");
  } finally { globalThis.fetch = real; }
});

test("proxy refuses anything that isn't a feed", async () => {
  const w = await worker(), real = globalThis.fetch;
  globalThis.fetch = async () => new Response("<html>", { headers: { "Content-Type": "text/html" } });
  try {
    assert.equal((await w.fetch(req("https://example.com/"), {})).status, 415, "html is refused");
    assert.equal((await w.fetch(req("http://example.com/feed.xml"), {})).status, 400, "plain http is refused");
    assert.equal((await w.fetch(new Request("https://proxy.test/"), {})).status, 400, "no url");
    assert.equal((await w.fetch(req("https://example.com/feed.xml", { method: "POST", body: "x" }), {})).status, 405, "only GET");
  } finally { globalThis.fetch = real; }
});

test("ALLOWED_ORIGIN locks the proxy to one site", async () => {
  const w = await worker(), real = globalThis.fetch, env = { ALLOWED_ORIGIN: "https://me.github.io" };
  globalThis.fetch = async () => new Response("<rss/>", { headers: { "Content-Type": "text/xml" } });
  try {
    assert.equal((await w.fetch(req("https://example.com/feed.xml", { headers: { Origin: "https://evil.test" } }), env)).status, 403);
    const ok = await w.fetch(req("https://example.com/feed.xml", { headers: { Origin: "https://me.github.io" } }), env);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("Access-Control-Allow-Origin"), "https://me.github.io");
  } finally { globalThis.fetch = real; }
});
