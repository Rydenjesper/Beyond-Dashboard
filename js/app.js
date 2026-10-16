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
const DISPLAY_NAMES = { stat: "Big number", gauge: "Gauge", text: "Text", list: "List", ticker: "Ticker", image: "Image", beacon: "Status light", json: "Raw JSON", local: "Personal" };
const DEFAULT_SIZE = { stat: [2, 1], gauge: [2, 2], text: [3, 1], list: [2, 2], ticker: [6, 1], image: [2, 2], beacon: [2, 1], json: [2, 2] };

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
const widgetHosts = ws => [...new Set(ws.map(w => host(cfgOf(w).url)).filter(h => h && !CATALOG_HOSTS.has(h)))];
boards.boards.forEach(b => { if (!Array.isArray(b.allowed)) b.allowed = widgetHosts(b.widgets); });   // boards from before v1.1 are the user's own
const blockedHost = c => { const h = c.url && host(c.url); return h && !CATALOG_HOSTS.has(h) && !(state.allowed || []).includes(h) ? h : null; };
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
    <footer class="w-f"><span class="src">${esc(c.local ? "this device only" : host(c.url))}</span><span class="age">waiting</span></footer>
  </article>`;
}
const itemEl = id => grid.el.querySelector(`.grid-stack-item[gs-id="${id}"]`);

function mount(w) {
  const el = grid.addWidget({ id: w.id, x: w.x, y: w.y, w: clamp(w.w || 2, 1, COLS), h: clamp(w.h || 1, 1, 4), maxH: 4, autoPosition: w.x == null || w.y == null });
  const c = cfgOf(w);
  el.querySelector(".grid-stack-item-content").innerHTML = cardHTML(c);
  const prev = rt.get(w.id);
  rt.set(w.id, { history: [], ...(prev || {}), cfg: c, timer: null });
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
  try { return JSON.parse(txt); } catch { return txt.trim(); }
}
const errText = e => e.name === "AbortError" ? "Timed out after 20 seconds." : e instanceof TypeError ? "Couldn't reach the API. It may be down or block browser requests (CORS)." : e.message;

function schedule(id) {
  const r = rt.get(id); if (!r) return;
  clearInterval(r.timer);
  r.timer = setInterval(() => { if (!document.hidden) load(id); }, Math.max(10, +r.cfg.refresh || 300) * 1000);
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
async function load(id, force) {
  const r = rt.get(id); if (!r || r.loading || r.cfg.missing || r.cfg.needsKey || !r.cfg.url || blockedHost(r.cfg)) return;
  r.loading = true;
  try {
    const data = await fetchShared(r.cfg, Math.max(10, +r.cfg.refresh || 300) * 1000 - 5000, force);
    r.data = data; r.value = resolve(r.cfg, data); r.error = null; r.updated = Date.now();
    const n = Number(r.value);
    if (r.value !== "" && r.value != null && !isNaN(n) && typeof r.value !== "boolean") { r.history.push(n); if (r.history.length > 40) r.history.shift(); }
  } catch (e) { r.error = errText(e); }
  finally { r.loading = false; paint(id); }
}

/* ═══ Painting ════════════════════════════════════════════ */
function render(c, r, cols) {
  if (c.missing) return `<div class="state"><strong>Module not found</strong><span>This widget uses a module that isn't in blueprints.js. Remove it, or update blueprints.js.</span></div>`;
  const blocked = !r.preview && blockedHost(c);
  if (blocked) return `<div class="state"><strong>Not loaded: ${esc(blocked)}</strong><span>This source isn't in Beyond's catalog. Loading it lets that site see your IP address.</span><button data-a="allow">Load ${esc(blocked)}</button></div>`;
  if (c.needsKey) return `<div class="state"><strong>Add your own key</strong><span>This widget needs ${esc(c.needsKey.label)}. Keys stay in your browser and are never shared.</span>${r.preview ? "" : '<button data-a="edit">Add key</button>'}</div>`;
  if (r.error && r.value === undefined) return `<div class="state"><strong>No signal</strong><span>${esc(r.error)}</span><button data-a="refresh">Try again</button></div>`;
  if (r.value === undefined && r.data === undefined) return `<div class="skel"><i></i><i></i></div>`;
  return (DISPLAYS[c.display] || DISPLAYS.text)(c, r.value, r, cols);
}
function paint(id) {
  const el = itemEl(id), r = rt.get(id); if (!el || !r) return;
  if (r.cfg.local) { $(".age", el).textContent = ""; return mountLocal($(".w-b", el), r.cfg, id); }
  const cols = el.gridstackNode?.w || 2;
  $(".age", el).textContent = r.error && !r.updated ? "error" : timeAgo(r.updated);
  $(".w-b", el).innerHTML = render(r.cfg, r, cols);
}
let tickN = 0;
setInterval(() => {
  tickN++;
  rt.forEach((r, id) => {
    const el = itemEl(id); if (!el || !r.updated) return;
    $(".age", el).textContent = timeAgo(r.updated);
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
