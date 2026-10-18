/* Catalog health check: calls every URL the catalog can build, from "GitHub Pages", and writes status.json.
   A widget is OK when its API answers 2xx with an Access-Control-Allow-Origin header, or 429 (busy, not broken).
   Anything that fails is tried once more, ten seconds later, before it counts.
   Run: node scripts/health.js   (GitHub Actions runs it every night) */
const fs = require("node:fs"), path = require("node:path");
const { load, ROOT } = require("../tests/load");
const $ = load("js/engine.js", "blueprints.js");
const buildCfg = $("buildCfg"), cfgUrls = $("cfgUrls"), fill = $("fillPlaceholders");
const ORIGIN = "https://rydenjesper.github.io";

/* Every URL per catalog entry: blueprints, and each module for every combination of its choices. */
const entries = new Map();   // id → Set(url)
const add = (id, c) => cfgUrls(c).forEach(u => (entries.get(id) || entries.set(id, new Set()).get(id)).add(fill(u)));
for (const m of $("window.MODULES")) {
  let combos = [{}];
  m.params.forEach(x => { if (x.type === "choice") combos = combos.flatMap(c => x.options.map(o => ({ ...c, [x.key]: o.value }))).slice(0, 24); });   // a sample is enough, and kinder to free APIs
  combos.forEach(p => { try { const c = buildCfg(m, p, {}); if (!c.needsKey && !c.local) add(m.id, c); } catch {} });
}
for (const b of $("window.BLUEPRINTS")) if (!b.mod) add(b.id, b);

async function check(url) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { Origin: ORIGIN, "User-Agent": "BeyondDashboard-health" }, signal: ctrl.signal });
    const cors = !!res.headers.get("access-control-allow-origin");
    await res.arrayBuffer().catch(() => {});
    return { status: res.status, cors, ok: res.status === 429 || (cors && res.ok) };   // 429 = busy right now, not broken
  } catch (e) { return { status: 0, cors: false, ok: false, error: e.name === "AbortError" ? "timeout" : e.message }; }
  finally { clearTimeout(t); }
}

(async () => {
  const urls = [...new Set([...entries.values()].flatMap(s => [...s]))], byUrl = {};
  for (let i = 0; i < urls.length; i += 6) {   // a few at a time, so no API sees a burst
    const batch = urls.slice(i, i + 6);
    (await Promise.all(batch.map(check))).forEach((r, j) => byUrl[batch[j]] = r);
  }
  /* A second chance, slowly: a network blip or a busy API shouldn't flag a widget for a whole day. */
  const failed = urls.filter(u => !byUrl[u].ok);
  if (failed.length) {
    await new Promise(r => setTimeout(r, 10000));
    for (const u of failed) byUrl[u] = await check(u);
  }
  const results = {};
  for (const [id, set] of entries) {
    const failed = [...set].filter(u => !byUrl[u].ok);
    results[id] = failed.length ? { ok: false, failed: failed.slice(0, 3).map(u => ({ url: u.replace(/([?&](?:api_?key|key|token)=)[^&]*/gi, "$1…"), ...byUrl[u] })), of: set.size } : { ok: true, of: set.size };
  }
  const bad = Object.entries(results).filter(([, r]) => !r.ok);
  fs.writeFileSync(path.join(ROOT, "status.json"), JSON.stringify({ checked: new Date().toISOString(), urls: urls.length, failing: bad.length, results }, null, 1) + "\n");
  console.log(`${urls.length} URLs, ${entries.size} widgets, ${bad.length} failing`);
  bad.forEach(([id, r]) => console.log(`  ✗ ${id}: ${r.failed.map(f => `${f.status || f.error}${f.cors ? "" : " no-CORS"} ${f.url.slice(0, 90)}`).join(" | ")}`));
})();
