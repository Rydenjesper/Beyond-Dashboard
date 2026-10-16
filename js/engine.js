"use strict";
/* Pure engine: paths, templates, formatting, module configs. Loads in the browser and in Node (tests). */
/* ═══ Utilities ═══════════════════════════════════════════ */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const pad = n => String(n).padStart(2, "0");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const maskSecrets = (s, c) => (c.secrets || []).reduce((t, k) => t.split(k).join("•••"), String(s));
const host = u => { try { return new URL(String(u).replace(/\{[^}]*\}/g, "x")).hostname.replace(/^www\./, ""); } catch { return ""; } };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const WMO = { 0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Freezing fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  56: "Freezing drizzle", 57: "Freezing drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow",
  75: "Heavy snow", 77: "Snow grains", 80: "Rain showers", 81: "Rain showers", 82: "Violent showers", 85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm, hail", 99: "Thunderstorm, heavy hail" };

/* ═══ Placeholders, paths, templates, formatting ══════════ */
function fillPlaceholders(s) {
  const d = new Date();
  return String(s)
    .replace(/\{YYYY\}/g, d.getFullYear()).replace(/\{MM\}/g, pad(d.getMonth() + 1)).replace(/\{DD\}/g, pad(d.getDate()))
    .replace(/\{SEASON\}/g, d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1)
    .replace(/\{rand:(\d+)-(\d+)\}/g, (_, a, b) => +a + Math.floor(Math.random() * (+b - +a + 1)));
}
/* [now] picks the entry of a time-sliced array that covers the current moment (electricity prices, schedules). */
const START_KEYS = ["time_start", "start", "startTime", "from", "valid_from"], END_KEYS = ["time_end", "end", "endTime", "to", "valid_to"];
function pickNow(arr) {
  const now = Date.now(), key = (o, ks) => ks.find(k => o && o[k] != null);
  const sk = key(arr[0], START_KEYS); if (!sk) return undefined;
  const ek = key(arr[0], END_KEYS);
  let best;
  for (const it of arr) {
    const s = Date.parse(it[sk]);
    if (s <= now && (!ek || now < Date.parse(it[ek]))) best = it;
  }
  return best;
}
function pick(obj, path) {
  if (path == null || path === "") return obj;
  const parts = String(path).replace(/\[(-?\d+|now)\]/g, ".$1").split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur) && /^-?\d+$/.test(p)) { const i = +p; cur = cur[i < 0 ? cur.length + i : i]; }
    else if (Array.isArray(cur) && p === "now") cur = pickNow(cur);
    else cur = cur[p];
  }
  return cur;
}
/* Browser: let the DOM decode every entity. Node (tests): the common ones. */
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
let decoder;
const decodeHTML = s => typeof document !== "undefined"
  ? ((decoder ||= document.createElement("textarea")).innerHTML = s, decoder.value)
  : s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) => e[0] !== "#" ? ENTITIES[e] ?? m : String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)));
const unescapeHTML = s => typeof s === "string" && /&#?\w+;/.test(s) ? decodeHTML(s) : s;
const isTemplate = s => /\{[^}]+\}/.test(String(s || ""));
/* Templates: {path} or {path|filter}. Filters: countdown, time, date, compact, round. */
const tmpl = (t, obj) => String(t).replace(/\{([^}|]+)(?:\|(\w+))?\}/g, (_, p, f) => {
  const v = pick(obj, p.trim());
  if (v == null) return "";
  if (f) return fmt(v, { format: f === "round" ? undefined : f, decimals: f === "round" ? 0 : undefined });
  return unescapeHTML(typeof v === "object" ? JSON.stringify(v) : String(v));
});
function resolve(c, data) {
  if (typeof c.transform === "function") data = c.transform(data);   // only modules can set this; links can't carry functions
  const path = fillPlaceholders(c.path || "");
  let v = isTemplate(path) ? tmpl(path, data) : pick(data, path);
  if (c.template && v != null) v = tmpl(c.template, v);
  if (c.scale != null && v != null && v !== "" && !isNaN(Number(v))) v = Number(v) * c.scale;
  return unescapeHTML(v);
}
function countdown(v) {
  const t = Date.parse(v); if (isNaN(t)) return String(v);
  let s = Math.round((t - Date.now()) / 1000); const past = s < 0; s = Math.abs(s);
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  const txt = d ? `${d}d ${h}h` : h ? `${h}h ${pad(m)}m` : `${m}m`;
  return s < 60 ? "now" : past ? `${txt} ago` : `in ${txt}`;
}
function fmtDuration(sec) { sec = Math.round(+sec); if (isNaN(sec)) return "—"; const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h}h ${pad(m)}m` : `${m}m`; }
function fmt(v, c) {
  if (v == null || v === "") return "—";
  switch (c.format) {
    case "time": { const d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
    case "date": { const d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }); }
    case "duration": return fmtDuration(v);
    case "compact": { const n = Number(v); return isNaN(n) ? String(v) : new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n); }
    case "wmo": return WMO[v] || `Code ${v}`;
    case "countdown": return countdown(v);
  }
  if (typeof v === "object") return JSON.stringify(v);
  const n = Number(v);
  if (String(v).trim() !== "" && !isNaN(n) && typeof v !== "boolean") {
    const fixed = c.decimals != null && c.decimals !== "";
    const dec = fixed ? +c.decimals : (Math.abs(n) < 10 ? 2 : Math.abs(n) < 1000 ? 1 : 0);
    return new Intl.NumberFormat("en", { minimumFractionDigits: fixed ? dec : 0, maximumFractionDigits: dec }).format(n);
  }
  return String(v);
}
const timeAgo = t => { if (!t) return "waiting"; const s = Math.round((Date.now() - t) / 1000); return s < 5 ? "just now" : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`; };

/* ═══ Modules: params → widget config ═════════════════════ */
function modDefaults(m) { const p = {}; m.params.forEach(x => { if (x.type !== "secret") p[x.key] = clone(x.default); }); return p; }
function modSelected(m, p) { const s = {}; m.params.forEach(x => { if (x.type === "choice") s[x.key] = x.options.find(o => o.value === p[x.key]) || x.options[0]; }); return s; }
function modDisplays(m, s) { let d = m.displays; m.params.forEach(x => { if (x.type === "choice" && s[x.key]?.displays) d = s[x.key].displays; }); return d || ["stat"]; }
/* Secret params (API keys) live in beyond.keys, never in the board or in share links.
   One value per module + param (or per x.store), shared by every widget of that module. */
const KEYS = "beyond.keys";
const secretId = (m, x) => x.store || `${m.id}.${x.key}`;
const getSecret = (m, x) => store.get(KEYS, {})[secretId(m, x)] || "";
function setSecret(m, x, v) { const k = store.get(KEYS, {}); if (v) k[secretId(m, x)] = v; else delete k[secretId(m, x)]; store.set(KEYS, k); }
const secretParams = m => m.params.filter(x => x.type === "secret");
/* secrets: optional {key: value} that overrides the stored keys (the configurator's unsaved input). */
function buildCfg(m, params, secrets) {
  const p = { ...modDefaults(m), ...params };
  let needsKey = null;
  secretParams(m).forEach(x => {
    p[x.key] = (secrets && x.key in secrets ? secrets[x.key] : getSecret(m, x)).trim();
    if (!p[x.key] && !x.optional) needsKey = { label: x.label, help: x.help };
  });
  const s = modSelected(m, p), ds = modDisplays(m, s);
  m.params.forEach(x => { if (x.type === "choice") p[x.key] = s[x.key].value; });   // never build a URL from a value that isn't an option
  const display = ds.includes(p.display) ? p.display : ds[0];
  const extra = {}; Object.values(s).forEach(({ value, label, displays, ...rest }) => Object.assign(extra, rest));
  const c = { refresh: 900, ...extra, ...m.build(p, s, display), display, category: m.category, displays: ds };
  if (needsKey) c.needsKey = needsKey;
  const hide = secretParams(m).map(x => p[x.key]).filter(Boolean);
  if (hide.length) c.secrets = hide;   // masked wherever the URL is shown
  return c;
}

/* ═══ Catalog hosts: every domain the built-in catalog can call ═══ */
function catalogHosts(modules, bank) {
  const hs = new Set(), add = c => { const h = host(c.url); if (h) hs.add(h); };
  bank.forEach(b => { if (b.url) add(b); });
  modules.forEach(m => {
    let combos = [{}];   // every combination of choice values (small: a few options per param)
    m.params.forEach(x => { if (x.type === "choice") combos = combos.flatMap(c => x.options.map(o => ({ ...c, [x.key]: o.value }))).slice(0, 500); });
    combos.forEach(p => { try { add(buildCfg(m, p, {})); } catch {} });
  });
  return hs;
}

/* ═══ Share links: encode, decode, validate ═══════════════ */
const SHARE_MAX = 16384, SHARE_MAX_WIDGETS = 100;
const DISPLAY_TYPES = ["stat", "gauge", "text", "list", "ticker", "image", "beacon", "json"];
const FORMATS = ["time", "date", "duration", "compact", "wmo", "countdown"];
const b64url = bytes => { let s = ""; bytes.forEach(b => s += String.fromCharCode(b)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
async function encode(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream !== "undefined") return "z" + b64url(new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer()));
  return "j" + b64url(raw);
}
/* Reads at most max bytes, so a tiny link can't inflate into megabytes. */
async function readLimited(stream, max) {
  const reader = stream.getReader(), chunks = []; let n = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    if ((n += value.length) > max) { reader.cancel().catch(() => {}); throw new Error("Share link is too large."); }
    chunks.push(value);
  }
  const out = new Uint8Array(n); let o = 0; chunks.forEach(c => { out.set(c, o); o += c.length; });
  return new TextDecoder().decode(out);
}
async function decode(code) {
  code = String(code).trim().replace(/^.*#d=/, "");
  if (!code || code.length > SHARE_MAX * 2) throw new Error("Not a share link.");
  const bytes = unb64url(code.slice(1));
  if (code[0] === "z") return JSON.parse(await readLimited(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")), SHARE_MAX));
  if (bytes.length > SHARE_MAX) throw new Error("Share link is too large.");
  return JSON.parse(new TextDecoder().decode(bytes));
}
const str = (v, max) => typeof v === "string" ? v.slice(0, max) : undefined;
const num = (v, a, b) => typeof v === "number" && isFinite(v) ? Math.min(b, Math.max(a, v)) : undefined;
const vals = v => Array.isArray(v) ? v.filter(x => typeof x === "string" || typeof x === "number").slice(0, 20).map(x => typeof x === "string" ? x.slice(0, 100) : x) : undefined;
/* A custom widget from a link keeps only fields the engine knows, each with the right type. */
const CUSTOM_FIELDS = {
  name: v => str(v, 120), url: v => typeof v === "string" && /^https?:\/\//i.test(v) ? v.slice(0, 2000) : undefined,
  path: v => str(v, 500), item: v => str(v, 500), template: v => str(v, 500), caption: v => str(v, 200),
  display: v => DISPLAY_TYPES.includes(v) ? v : undefined, format: v => FORMATS.includes(v) ? v : undefined,
  prefix: v => str(v, 20), unit: v => str(v, 20), category: v => str(v, 20),
  min: v => num(v, -1e15, 1e15), max: v => num(v, -1e15, 1e15), scale: v => num(v, -1e15, 1e15),
  decimals: v => num(v, 0, 10) === undefined ? undefined : Math.round(num(v, 0, 10)), refresh: v => num(v, 10, 86400),
  ok: vals, warn: vals,
  headers: v => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
    const h = Object.entries(v).filter(([k, x]) => typeof x === "string" && /^[\w-]{1,64}$/.test(k)).slice(0, 20).map(([k, x]) => [k, x.slice(0, 500)]);
    return h.length ? Object.fromEntries(h) : undefined;
  },
};
function sanitizeCustom(c) {
  if (!c || typeof c !== "object") return null;
  const out = {};
  Object.entries(CUSTOM_FIELDS).forEach(([k, f]) => { const v = f(c[k]); if (v !== undefined) out[k] = v; });
  return out.url ? { ...out, display: out.display || "text", name: out.name || host(out.url) || "Custom widget", category: out.category || "custom" } : null;
}
function sanitizeParams(m, p) {
  const out = {}; if (!p || typeof p !== "object") return out;
  m.params.forEach(x => {
    const v = p[x.key];
    if (x.type === "choice" && x.options.some(o => o.value === v)) out[x.key] = v;
    else if (x.type === "text" && typeof v === "string") out[x.key] = v.slice(0, 200);
    else if (x.type === "search" && v && (typeof v.value === "string" || typeof v.value === "number") && typeof v.label === "string") out[x.key] = { value: String(v.value).slice(0, 40), label: v.label.slice(0, 80) };
    else if (x.type === "place" && v && num(v.lat, -90, 90) !== undefined && num(v.lon, -180, 180) !== undefined) out[x.key] = { name: str(v.name, 80) || "Somewhere", lat: num(v.lat, -90, 90), lon: num(v.lon, -180, 180) };
  });   // secret params are never taken from a link
  if (DISPLAY_TYPES.includes(p.display)) out.display = p.display;
  return out;
}
const SECRET = /auth|key|token|secret|cookie|password|session/i;
/* The link carries layout and settings, never keys: secret params, auth headers and ?key= values are removed. */
function shareable(board, mods) {
  let stripped = 0;
  const ws = board.widgets.map(w => {
    const pos = { x: w.x, y: w.y, w: w.w, h: w.h };
    if (w.mod) {
      const p = { ...w.params }; (mods[w.mod] ? secretParams(mods[w.mod]) : []).forEach(x => delete p[x.key]);
      return { m: w.mod, p, ...(w.title ? { t: w.title } : {}), ...pos };
    }
    if (w.bp) return { b: w.bp, ...pos };
    const { id, x, y, w: _w, h, ...c } = w;
    if (c.headers) { c.headers = Object.fromEntries(Object.entries(c.headers).filter(([k]) => !(SECRET.test(k) && ++stripped))); if (!Object.keys(c.headers).length) delete c.headers; }
    if (/[?&](api_?key|key|token|access_token|apikey)=(?!DEMO_KEY)/i.test(c.url || "")) { c.url = c.url.replace(/([?&](?:api_?key|key|token|access_token|apikey)=)[^&]*/gi, "$1YOUR_KEY"); stripped++; }
    return { c, ...pos };
  });
  return { payload: { v: 2, t: board.title, ws }, stripped };
}
/* Turns a decoded share payload into a board. Anything malformed is dropped, never trusted. */
function hydrate(p, mods, bankById) {
  if (!p || typeof p !== "object" || !Array.isArray(p.ws)) throw new Error("Not a share link.");
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const widgets = p.ws.slice(0, SHARE_MAX_WIDGETS).map(s => {
    if (!s || typeof s !== "object") return null;
    const pos = { id: uid(), x: num(s.x, 0, 5), y: num(s.y, 0, 1000), w: num(s.w, 1, 6) ?? 2, h: num(s.h, 1, 4) ?? 1 };
    ["x", "y", "w", "h"].forEach(k => { if (pos[k] === undefined) delete pos[k]; else pos[k] = Math.round(pos[k]); });
    if (typeof s.m === "string" && has(mods, s.m)) return { ...pos, mod: s.m, params: sanitizeParams(mods[s.m], s.p), ...(str(s.t, 120) ? { title: str(s.t, 120) } : {}) };
    if (typeof s.b === "string" && has(bankById, s.b)) return { ...pos, bp: s.b };
    const c = sanitizeCustom(s.c);
    return c ? { ...c, ...pos } : null;
  }).filter(Boolean);
  return { title: str(p.t, 100) || "Shared dashboard", widgets, allowed: [] };   // a link never pre-approves domains
}

/* ═══ Boards: several dashboards in one browser ═══════════ */
/* beyond.boards.v1 = { active, boards: [{ id, title, widgets, allowed, home? }] }.
   Before v1.1 there was one board under beyond.dashboard.v2; it becomes the first board and the old key stays. */
function migrateBoards(saved, old) {
  const fix = b => b && typeof b === "object" ? { ...b, id: typeof b.id === "string" && b.id ? b.id : uid(), title: typeof b.title === "string" ? b.title : "Control Room", widgets: Array.isArray(b.widgets) ? b.widgets : [] } : null;
  if (saved && Array.isArray(saved.boards)) {
    const boards = saved.boards.map(fix).filter(Boolean);
    const ids = new Set(); boards.forEach(b => { if (ids.has(b.id)) b.id = uid(); ids.add(b.id); });
    if (boards.length) return { active: boards.some(b => b.id === saved.active) ? saved.active : boards[0].id, boards };
  }
  const b = old && Array.isArray(old.widgets) ? fix(old) : null;
  return b ? { active: b.id, boards: [b] } : null;
}

if (typeof module !== "undefined") module.exports = { esc, maskSecrets, uid, pad, clamp, clone, store, host, debounce, WMO, fillPlaceholders, pickNow, pick, unescapeHTML, isTemplate, tmpl, resolve, countdown, fmtDuration, fmt, timeAgo, modDefaults, modSelected, modDisplays, buildCfg, getSecret, setSecret, secretParams, catalogHosts, encode, decode, hydrate, shareable, migrateBoards, sanitizeCustom, sanitizeParams, SHARE_MAX };
