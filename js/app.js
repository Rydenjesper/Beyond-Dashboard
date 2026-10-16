"use strict";
/* DOM helpers, catalog, state, board, fetching, painting and widget actions. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let toastT;
function toast(msg, undo) {
  const t = $("#toast");
  t.innerHTML = esc(msg) + (undo ? ` <button style="margin-left:10px;border:0;background:none;color:var(--accent);font-weight:600">Undo</button>` : "");
  t.style.pointerEvents = undo ? "auto" : "none";
  if (undo) t.querySelector("button").onclick = () => { undo(); t.classList.remove("show"); };
  t.classList.add("show"); clearTimeout(toastT);
  toastT = setTimeout(() => { t.classList.remove("show"); t.style.pointerEvents = "none"; }, undo ? 4500 : 2200);
}

const MODULES = window.MODULES || [], MOD = Object.fromEntries(MODULES.map(m => [m.id, m]));
const BANK = window.BLUEPRINTS || [], BANK_BY_ID = Object.fromEntries(BANK.map(b => [b.id, b]));
const PLACES = window.PLACES || [];
const CATS = { space: "#7C8CFF", weather: "#3FB6D9", earth: "#4CB872", money: "#E0A42E", dev: "#A877E8", fun: "#F06E9C", knowledge: "#D98B4A", images: "#5FC4B0", sport: "#E8735A", sweden: "#4A90E2", personal: "#B5C24A", custom: "#98A1AE" };
const DISPLAY_NAMES = { stat: "Big number", gauge: "Gauge", text: "Text", list: "List", ticker: "Ticker", image: "Image", beacon: "Status light", json: "Raw JSON", local: "Personal", chart: "Chart", history: "History" };
const DEFAULT_SIZE = { stat: [2, 1], gauge: [2, 2], text: [3, 1], list: [2, 2], ticker: [6, 1], image: [2, 2], beacon: [2, 1], json: [2, 2], chart: [3, 2], history: [3, 2] };

/* A widget in state is small: position + either {mod, params}, {bp}, or a full custom config. */
function cfgOf(w) {
  if (w.mod) {
    const m = MOD[w.mod]; if (!m) return { name: w.title || `Missing module: ${w.mod}`, url: "", display: "text", missing: true };
    try { const c = buildCfg(m, w.params || {}); return { ...c, name: w.title || c.name }; }
    catch { return { name: w.title || m.name, url: "", display: "text", missing: true }; }
  }
  if (w.bp && BANK_BY_ID[w.bp]) { const { desc, id, ...b } = BANK_BY_ID[w.bp]; return { ...b, name: w.title || b.name }; }
  return w;
}

/* ═══ State ════════════════════════════════════════════════ */
const KEY = "beyond.dashboard.v2", BOARDS = "beyond.boards.v1";
const STARTER = [
  ["bp_iss_velocity", 2, 1], ["bp_people_in_space", 2, 1], ["bp_github_status", 2, 1],
  ["bp_sahara_uv", 2, 2], ["bp_southpole_temp", 2, 1], ["bp_hn_front", 2, 2],
  ["bp_next_spacex", 2, 1], ["bp_cat_fact", 4, 1], ["bp_dog", 2, 3],
  ["bp_elpris_se3", 2, 2], ["bp_quakes_big", 2, 2], ["bp_hn_ticker", 6, 1],
];
function fromBlueprint(bp, w, h) {
  const base = bp.mod ? { mod: bp.mod, params: clone(bp.params), title: bp.name } : { bp: bp.id };
  const display = bp.mod ? buildCfg(MOD[bp.mod], bp.params).display : bp.display;
  const [dw, dh] = (bp.mod && buildCfg(MOD[bp.mod], bp.params).size) || DEFAULT_SIZE[display] || [2, 1];
  return { id: uid(), ...base, w: w || dw, h: h || dh };
}
const starter = () => ({ title: "Control Room", allowed: [], widgets: STARTER.filter(([id]) => BANK_BY_ID[id]).map(([id, w, h]) => fromBlueprint(BANK_BY_ID[id], w, h)) });

let boards = migrateBoards(store.get(BOARDS, null), store.get(KEY, null));
const savedState = boards && boards.boards.find(b => b.id === boards.active);   // null on a first visit
if (!boards) { const b = { id: uid(), ...starter() }; boards = { active: b.id, boards: [b] }; }
let state = boards.boards.find(b => b.id === boards.active);   // the active board; everything else edits this

/* Domains outside the catalog only load once approved for this board: opening a shared link
   must not let its author see the viewer's IP address. */
const CATALOG_HOSTS = catalogHosts(MODULES, BANK);
const widgetHosts = ws => [...new Set(ws.flatMap(w => cfgUrls(cfgOf(w)).map(host)).filter(h => h && !CATALOG_HOSTS.has(h)))];
boards.boards.forEach(b => { if (!Array.isArray(b.allowed)) b.allowed = widgetHosts(b.widgets); });   // boards from before v1.1 are the user's own
const blockedHost = c => cfgUrls(c).map(host).find(h => h && !CATALOG_HOSTS.has(h) && !(state.allowed || []).includes(h)) || null;
function allowHost(h) { if (h && !CATALOG_HOSTS.has(h) && !state.allowed.includes(h)) state.allowed.push(h); }
let previewing = false;
const rt = new Map();   // per widget: { cfg, data, value, error, updated, history, timer, loading }
function save() {
  if (previewing) return;   // a shared board being looked at is never written
  state.id ||= boards.active;   // a board object that replaced the active one (rebuild, undo) takes its place
  const i = boards.boards.findIndex(b => b.id === state.id);
  if (i < 0) boards.boards.push(state); else boards.boards[i] = state;
  boards.active = state.id;
  store.set(BOARDS, boards);
}
const homeOf = () => state.home || store.get("beyond.home", null);
const find = id => state.widgets.find(w => w.id === id);

/* ═══ Board ════════════════════════════════════════════════ */
const COLS = 6;
const grid = GridStack.init({
  column: COLS, cellHeight: 128, margin: 6, float: false, animate: true, minRow: 1,
  columnOpts: { columnMax: COLS, breakpoints: [{ w: 720, c: 2 }, { w: 1080, c: 4 }, { w: 100000, c: COLS }], layout: "list" },
  draggable: { handle: ".w-h", cancel: "button", scroll: true },
  resizable: { handles: "se" },
}, "#grid");

const ICON = {
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  locate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
};

function cardHTML(c, interactive = true) {
  return `<article class="w">
    <header class="w-h"${interactive ? ' title="Drag to move"' : ""}>
      <span class="cat" style="background:${CATS[c.category] || CATS.custom}"></span>
      <h3 class="w-name">${esc(c.name)}</h3>
      ${interactive ? `<div class="w-act">
        ${c.local ? "" : `<button data-a="refresh" aria-label="Refresh ${esc(c.name)}" title="Refresh">${ICON.refresh}</button>`}
        <button data-a="edit" aria-label="Edit ${esc(c.name)}" title="Edit">${ICON.edit}</button>
        <button data-a="remove" aria-label="Remove ${esc(c.name)}" title="Remove">${ICON.trash}</button>
      </div>` : ""}
    </header>
    <div class="w-b"></div>
    <footer class="w-f"><span class="src">${esc(c.local ? "this device only" : (u => u.length > 1 ? `${host(u[0])} +${u.length - 1}` : host(u[0] || ""))(cfgUrls(c)))}</span><span class="age">waiting</span></footer>
  </article>`;
}
const itemEl = id => grid.el.querySelector(`.grid-stack-item[gs-id="${id}"]`);

function mount(w) {
  const el = grid.addWidget({ id: w.id, x: w.x, y: w.y, w: clamp(w.w || 2, 1, COLS), h: clamp(w.h || 1, 1, 4), maxH: 4, autoPosition: w.x == null || w.y == null });
  const c = cfgOf(w);
  el.querySelector(".grid-stack-item-content").innerHTML = cardHTML(c);
  const prev = rt.get(w.id), hist = prev?.hist || clone(histStore[w.id] || []);
  rt.set(w.id, { ...(prev || {}), hist, history: hist.slice(-40).map(([, v]) => v), cfg: c, timer: null });
  if (!prev?.updated && !c.local) lastDB.get(w.id).then(v => { const r = rt.get(w.id); if (v && r && !r.updated) { Object.assign(r, v, { stale: true }); paint(w.id); } });
  syncNode(w, el);
  paint(w.id);
  return el;
}
function syncNode(w, el) { const n = el.gridstackNode; if (n && grid.getColumn() === COLS) Object.assign(w, { x: n.x, y: n.y, w: n.w, h: n.h }); }

function renderAll() {
  rt.forEach(r => clearInterval(r.timer));
  const keep = new Map(rt); rt.clear();
  grid.removeAll(true);
  $("#title").textContent = state.title || "Control Room";
  renderTabs();
  $("#empty").hidden = state.widgets.length > 0;
  grid.batchUpdate();
  state.widgets.forEach(w => { if (keep.has(w.id)) rt.set(w.id, keep.get(w.id)); mount(w); });
  grid.batchUpdate(false);
  state.widgets.forEach((w, i) => {
    const el = itemEl(w.id); if (el) syncNode(w, el);
    schedule(w.id);
    const r = rt.get(w.id);
    if (!r.updated) setTimeout(() => load(w.id), i * 120);   // stagger first loads so free APIs aren't hit at once
    else paint(w.id);
  });
  save();
}
function addWidget(w) {
  state.widgets.push(w);
  $("#empty").hidden = true;
  const el = mount(w); schedule(w.id); load(w.id); save();
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
grid.on("change", (e, nodes) => {
  if (grid.getColumn() !== COLS) return;   // positions are stored in 6-column space
  nodes.forEach(n => { const w = find(n.id); if (w) Object.assign(w, { x: n.x, y: n.y, w: n.w, h: n.h }); });
  save();
});
grid.on("resizestop", (e, el) => { const id = el.getAttribute("gs-id"); const w = find(id); if (w) { syncNode(w, el); paint(id); save(); } });

/* ═══ Fetching ════════════════════════════════════════════ */
async function fetchData(c, signal) {
  const url = fillPlaceholders(c.url);
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {   // free APIs hiccup (503/502/429): back off and retry
    res = await fetch(url, { headers: c.headers || {}, signal, cache: "no-store" });
    if (![429, 502, 503, 504].includes(res.status)) break;
    await new Promise(ok => setTimeout(ok, 1200 * (attempt + 1) + Math.random() * 600));
  }
  if (!res.ok) throw new Error(`The API answered ${res.status}${res.status === 404 ? " (not found, check the name)" : res.status === 429 ? " (rate limited, try a longer refresh)" : ""}`);
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return /^\s*</.test(txt) ? parseFeed(txt) ?? txt.trim() : txt.trim(); }
}
/* RSS and Atom become { title, items: [{ title, link, date, summary }] }. Anything else XML stays text. */
function parseFeed(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return null;
  const nodes = [...doc.querySelectorAll("item, entry")];
  if (!nodes.length && !doc.querySelector("rss, feed, channel")) return null;
  const txt = (el, sel) => el.querySelector(sel)?.textContent.trim() || "";
  const plain = s => unescapeHTML(s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 400);
  return { title: txt(doc, "channel > title, feed > title"),
    items: nodes.slice(0, 50).map(n => ({ title: plain(txt(n, "title")), link: txt(n, "link") || n.querySelector("link")?.getAttribute("href") || "",
      date: txt(n, "pubDate") || txt(n, "updated") || txt(n, "published"), summary: plain(txt(n, "description, summary, content")) })) };
}
const errText = (e, c) => c?.proxyHint && e instanceof TypeError && e.name !== "AbortError" ? "This feed doesn't let browsers read it (CORS). Add your own proxy in the widget's settings, see the README." :  e.name === "AbortError" ? "Timed out after 20 seconds." : e instanceof TypeError ? "Couldn't reach the API. It may be down or block browser requests (CORS)." : e.message;

function schedule(id) {
  const r = rt.get(id); if (!r) return;
  clearInterval(r.timer);
  r.timer = setInterval(() => { if (!document.hidden) load(id); }, Math.max(10, +r.cfg.refresh || 300) * 1000);
}
/* The last good answer per widget lives in IndexedDB, so a board opened offline still shows something. */
const lastDB = (() => {
  let db;
  const open = () => db ||= new Promise((ok, no) => { const r = indexedDB.open("beyond", 1); r.onupgradeneeded = () => r.result.createObjectStore("last"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const tx = (mode, fn) => open().then(d => new Promise((ok, no) => { const t = d.transaction("last", mode), q = fn(t.objectStore("last")); t.oncomplete = () => ok(q?.result); t.onerror = () => no(t.error); }));
  const safe = p => p.catch(() => undefined);
  return { get: id => typeof indexedDB === "undefined" ? Promise.resolve() : safe(tx("readonly", s => s.get(id))),
    put: (id, v) => typeof indexedDB === "undefined" || previewing ? Promise.resolve() : safe(tx("readwrite", s => s.put(v, id))) };
})();
function keepLast(id, r) {
  let data = r.data; try { if (JSON.stringify(data).length > 200e3) data = undefined; } catch { data = undefined; }   // big responses: keep the value only
  lastDB.put(id, { value: r.value, level: r.level, data, updated: r.updated });
}
const ageText = r => r.error && !r.updated ? "error"
  : (r.stale || r.error) && !navigator.onLine && r.updated ? `Offline · from ${new Date(r.updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : timeAgo(r.updated);

/* Every number a widget shows is remembered (200 points, beyond.history.v1), so sparklines
   and the History view survive a reload. */
const HIST_KEY = "beyond.history.v1", HIST_MAX = 200;
const histStore = store.get(HIST_KEY, {});
const saveHist = debounce(() => { if (!previewing) store.set(HIST_KEY, histStore); }, 2000);
function record(id, r, n) {
  r.hist.push([Date.now(), n]); if (r.hist.length > HIST_MAX) r.hist.splice(0, r.hist.length - HIST_MAX);
  r.history = r.hist.slice(-40).map(([, v]) => v);
  if (!previewing) { histStore[id] = r.hist; saveHist(); }
}
function pruneHistory(allBoards) {
  const ids = new Set(allBoards.flatMap(b => b.widgets.map(w => w.id)));
  let n = 0; Object.keys(histStore).forEach(id => { if (!ids.has(id)) { delete histStore[id]; n++; } });
  if (n) store.set(HIST_KEY, histStore);
}

/* Widgets on the same URL share one request per refresh interval: in-flight requests are joined,
   recent answers reused. A manual refresh (force) always goes to the network. */
const fetchCache = new Map();   // key → { promise, at }
function fetchShared(c, maxAge, force) {
  const key = fillPlaceholders(c.url) + "\n" + JSON.stringify(c.headers || {});
  const hit = fetchCache.get(key), now = Date.now();
  if (hit && !force && (!hit.at || now - hit.at < maxAge)) return hit.promise;
  const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), 20000);
  const entry = { at: 0 };
  entry.promise = fetchData({ ...c, url: key.split("\n")[0] }, ctrl.signal)
    .then(d => { entry.at = Date.now(); return d; })
    .catch(e => { if (fetchCache.get(key) === entry) fetchCache.delete(key); throw e; })
    .finally(() => clearTimeout(to));
  fetchCache.set(key, entry);
  fetchCache.forEach((v, k) => { if (v.at && now - v.at > 3600e3) fetchCache.delete(k); });
  return entry.promise;
}
/* Combined widgets: every source in parallel through the shared cache, then the calculation.
   A failing source is named, so the widget says which one is down. */
async function loadSources(c, maxAge, force) {
  const entries = Object.entries(c.sources);
  const got = await Promise.all(entries.map(async ([name, s]) => {
    try { return [name, resolve(s, await fetchShared(s, maxAge, force))]; }
    catch (e) { throw new Error(`The “${name}” source isn't answering. ${errText(e)}`); }
  }));
  try { return combine(c, Object.fromEntries(got)); }
  catch (e) { throw new Error(`Calculation: ${e.message}`); }
}
async function load(id, force) {
  const r = rt.get(id); if (!r || r.loading || r.cfg.missing || r.cfg.needsKey || !cfgUrls(r.cfg).length || blockedHost(r.cfg)) return;
  r.loading = true;
  try {
    const maxAge = Math.max(10, +r.cfg.refresh || 300) * 1000 - 5000;
    if (r.cfg.sources) {
      const out = await loadSources(r.cfg, maxAge, force);
      Object.assign(r, { data: out.env, value: out.value, level: out.level });
    } else { r.data = await fetchShared(r.cfg, maxAge, force); r.value = resolve(r.cfg, r.data); }
    r.error = null; r.updated = Date.now(); r.stale = false; keepLast(id, r);
    const n = Number(r.value);
    if (r.value !== "" && r.value != null && !isNaN(n) && typeof r.value !== "boolean") record(id, r, n);
  } catch (e) { r.error = errText(e, r.cfg); }
  finally { r.loading = false; paint(id); }
}

/* ═══ Chart hover ═════════════════════════════════════════ */
function chartHover(e) {
  const ch = e.target.closest?.(".chart"); if (!ch) return;
  const plot = e.target.closest(".ch-plot") || ch.querySelector(".ch-plot");
  let tip; try { tip = ch._tip ||= JSON.parse(ch.dataset.tip); } catch { return; }
  const rect = plot.getBoundingClientRect(), f = (e.clientX - rect.left) / rect.width * 100;
  if (f < -2 || f > 102) return chartLeave(ch);
  let i = 0; tip.fx.forEach((x, j) => { if (Math.abs(x - f) < Math.abs(tip.fx[i] - f)) i = j; });
  $$(".ch-guide", ch).forEach(g => { g.hidden = false; g.style.left = tip.fx[i] + "%"; });
  const box = $(".ch-tip", ch); box.hidden = false; box.replaceChildren();
  const head = document.createElement("b"); head.textContent = tip.x[i]; box.append(head);
  tip.s.forEach(s => { const row = document.createElement("span"), key = document.createElement("i"), val = document.createElement("strong");
    key.className = `${s.c} ${s.k}`; val.textContent = `${s.v[i]}${s.u ? " " + s.u : ""}`; row.append(key, val, document.createTextNode(tip.s.length > 1 ? " " + s.n : "")); box.append(row); });
  const cr = ch.getBoundingClientRect(), px = rect.left - cr.left + tip.fx[i] / 100 * rect.width;
  box.style.left = Math.min(Math.max(px - box.offsetWidth / 2, 0), cr.width - box.offsetWidth) + "px";
}
function chartLeave(ch) { if (!ch) return; $$(".ch-guide", ch).forEach(g => g.hidden = true); const t = $(".ch-tip", ch); if (t) t.hidden = true; }
document.addEventListener("pointermove", chartHover);
document.addEventListener("pointerout", e => { const ch = e.target.closest?.(".chart"); if (ch && !ch.contains(e.relatedTarget)) chartLeave(ch); });

/* ═══ Painting ════════════════════════════════════════════ */
function render(c, r, cols) {
  if (c.missing) return `<div class="state"><strong>Module not found</strong><span>This widget uses a module that isn't in blueprints.js. Remove it, or update blueprints.js.</span></div>`;
  const blocked = !r.preview && blockedHost(c);
  if (blocked) return `<div class="state"><strong>Not loaded: ${esc(blocked)}</strong><span>This source isn't in Beyond's catalog. Loading it lets that site see your IP address.</span><button data-a="allow">Load ${esc(blocked)}</button></div>`;
  if (c.needsKey) return `<div class="state" title="This widget needs ${esc(c.needsKey.label)}. Keys stay in your browser and are never shared."><strong>Add your own key</strong><span>This widget needs ${esc(c.needsKey.label)}. Keys stay in your browser and are never shared.</span>${r.preview ? "" : '<button data-a="edit">Add key</button>'}</div>`;
  if (r.error && r.value === undefined) return `<div class="state"><strong>No signal</strong><span>${esc(r.error)}</span><button data-a="refresh">Try again</button></div>`;
  if (r.value === undefined && r.data === undefined) return `<div class="skel"><i></i><i></i></div>`;
  return (DISPLAYS[c.display] || DISPLAYS.text)(c, r.value, r, cols);
}
function paint(id) {
  const el = itemEl(id), r = rt.get(id); if (!el || !r) return;
  if (r.cfg.local) { $(".age", el).textContent = ""; return mountLocal($(".w-b", el), r.cfg, id); }
  const cols = el.gridstackNode?.w || 2;
  $(".age", el).textContent = ageText(r);
  $(".w-b", el).innerHTML = render(r.cfg, r, cols);
}
let tickN = 0;
setInterval(() => {
  tickN++;
  rt.forEach((r, id) => {
    const el = itemEl(id); if (!el || !r.updated) return;
    $(".age", el).textContent = ageText(r);
    if (tickN % 6 === 0 && ticks(r.cfg)) { if (/\[now\]/.test(r.cfg.path)) r.value = resolve(r.cfg, r.data); paint(id); }   // countdowns and [now] values move every 30 s
  });
}, 5000);

/* ═══ Widget actions ══════════════════════════════════════ */
grid.el.addEventListener("click", e => {
  const b = e.target.closest("[data-a]"); if (!b) return;
  const id = b.closest(".grid-stack-item").getAttribute("gs-id"), w = find(id);
  if (b.dataset.a === "refresh") load(id, true);
  if (b.dataset.a === "allow") { allowHost(blockedHost(rt.get(id).cfg)); save(); state.widgets.forEach(x => { paint(x.id); load(x.id); }); }
  if (b.dataset.a === "edit") w.mod ? openConfig(MOD[w.mod], w) : openEditor(w);
  if (b.dataset.a === "remove") {
    const idx = state.widgets.indexOf(w), copy = clone(w);
    state.widgets.splice(idx, 1); clearInterval(rt.get(id)?.timer); rt.delete(id);
    grid.removeWidget(itemEl(id)); save();
    $("#empty").hidden = state.widgets.length > 0;
    toast(`Removed ${cfgOf(copy).name}`, () => { state.widgets.splice(idx, 0, copy); $("#empty").hidden = true; mount(copy); schedule(copy.id); load(copy.id); save(); });
  }
});
