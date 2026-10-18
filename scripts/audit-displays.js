/* Display audit: renders every module (each choice, each view) and every ready-made widget against live data
   and lists anything that looks wrong: empty values, JSON blobs, raw dates or timestamps, "undefined", text in a
   number view, dangling separators. Run it after adding APIs:  node scripts/audit-displays.js
   (RSS feeds are skipped: they are parsed by the browser's DOMParser.) */
const { load } = require("../tests/load.js");
const $ = load("js/engine.js", "js/displays.js", "blueprints.js");
const buildCfg = $("buildCfg"), cfgUrls = $("cfgUrls"), resolve = $("resolve"), combine = $("combine"), fill = $("fillPlaceholders"), fmt = $("fmt"), tmpl = $("tmpl"), D = $("DISPLAYS");
const MODS = $("window.MODULES"), BPS = $("window.BLUEPRINTS");
const cache = new Map();
let busy = 0;
const get = async (u, headers) => { u = fill(u); if (!cache.has(u)) cache.set(u, (async () => { const r = await fetch(u, { headers: headers || {} }); if (!r.ok) throw new Error("HTTP " + r.status); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } })()); return cache.get(u); };
const ISO = /\b\d{4}-\d\d-\d\dT\d\d:\d\d/;
function problems(c, v, html, text) {
  const p = [];
  if (v === undefined || v === null || v === "") p.push("EMPTY");
  if (/\bundefined\b|\bnull\b|NaN|\[object Object\]/.test(text)) p.push("UNDEF-IN-TEXT");
  if (["gauge", "history"].includes(c.display) && v != null && isNaN(Number(v)) || c.display === "stat" && v != null && isNaN(Number(v)) && fmt(v, c).length > 24) p.push("NON-NUMERIC-IN-NUMBER-VIEW");   // a short time or countdown as a big figure is fine
  if (["stat", "text", "beacon"].includes(c.display) && v && typeof v === "object") p.push("OBJECT-AS-TEXT");
  if (ISO.test(text)) p.push("RAW-ISO-DATE");
  if (/^\d{10,13}$/.test(String(v))) p.push("RAW-TIMESTAMP");
  if (/ · $| · · |^ · /.test(text) || / – $/.test(text)) p.push("DANGLING-SEPARATOR");
  if (html.includes('class="state"')) p.push("STATE:" + text.slice(0, 50));
  return p;
}
const strip = h => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
async function check(label, c) {
  if (c.local || c.needsKey || c.proxyHint) return;
  try {
    let v, level;
    if (c.sources) { const vals = {}; for (const [k, s] of Object.entries(c.sources)) vals[k] = resolve(s, await get(s.url, s.headers)); ({ value: v, level } = combine(c, vals)); }
    else v = resolve(c, await get(c.url, c.headers));
    const r = { history: [1, 2, 3], hist: [], level, data: v };
    const html = c.display === "history" ? D.stat(c, v, r, 3) : (D[c.display] || D.text)(c, v, r, 3);
    const full = strip(html), text = full.slice(0, 400);
    const p = problems(c, v, html, full);
    if (p.length) console.log(`${label.padEnd(44)} [${c.display}] ${p.join(",")}  ⇒ ${text.slice(0, 110)}`);
  } catch (e) {
    if (/HTTP (429|503)/.test(e.message)) busy++;   // rate limited: not the widget's fault
    else console.log(`${label.padEnd(44)} [${c.display}] FETCH/CALC ERROR ${e.message.slice(0, 80)}`);
  }
}
(async () => {
  const jobs = [];
  for (const m of MODS) {
    let combos = [{}];
    m.params.forEach(x => { if (x.type === "choice") combos = combos.flatMap(c => x.options.map(o => ({ ...c, [x.key]: o.value }))).slice(0, 30); });
    for (const p of combos) { let base; try { base = buildCfg(m, p, {}); } catch (e) { console.log(m.id, JSON.stringify(p), "BUILD ERROR", e.message); continue; }
      for (const d of base.displays) jobs.push([`${m.id} ${Object.entries(p).map(([k, v]) => `${k}=${String(v).slice(0, 14)}`).join(" ")}`, buildCfg(m, { ...p, display: d }, {})]); }
  }
  for (const b of BPS) if (!b.mod) jobs.push([b.id, b]);
  console.log(jobs.length, "widget/display combinations; only problems are listed");
  for (let i = 0; i < jobs.length; i += 4) await Promise.all(jobs.slice(i, i + 4).map(([l, c]) => check(l, c)));   // gently: free APIs
  if (busy) console.log(`${busy} checks skipped because an API said it was busy (429/503); run again later.`);
})();
