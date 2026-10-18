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
    .replace(/\{(date|ymd|dpath):([+-]\d+)\}/g, (_, f, n) => { const x = new Date(d); x.setDate(x.getDate() + +n); const s = `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; return f === "ymd" ? s.replace(/-/g, "") : f === "dpath" ? s.replace(/-/g, "/") : s; })
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
  const parts = String(path).replace(/\[(-?\d+|now|\*)\]/g, ".$1").split(".").filter(Boolean);
  let cur = obj;
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k];
    if (cur == null) return undefined;
    if (p === "*") return Array.isArray(cur) ? cur.map(x => pick(x, parts.slice(k + 1).join("."))) : undefined;   // every item
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
  if (c.empty && (v == null || (Array.isArray(v) && !v.length))) return c.empty;   // "No departures in the next hour" rather than " · "
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
/* Every date and time in the app uses this locale, so months never switch language with the browser. */
const LOCALE = "en-GB";
function fmtDuration(sec) { sec = Math.round(+sec); if (isNaN(sec)) return "—"; const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h}h ${pad(m)}m` : `${m}m`; }
function fmt(v, c) {
  if (v == null || v === "") return "—";
  switch (c.format) {
    case "time": { const d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" }); }
    case "date": { const d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" }); }
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
function modDisplays(m, s) {
  let d = m.displays; m.params.forEach(x => { if (x.type === "choice" && s[x.key]?.displays) d = s[x.key].displays; });
  d = d || ["stat"];
  return d.includes("stat") && !d.includes("history") ? [...d, "history"] : d;   // any number can also be drawn over time
}
/* Secret params (API keys) live in beyond.keys, never in the board or in share links.
   One value per module + param (or per x.store), shared by every widget of that module. */
const KEYS = "beyond.keys";
const secretId = (m, x) => x.store || `${m.id}.${x.key}`;
const getSecret = (m, x) => store.get(KEYS, {})[secretId(m, x)] || "";
function setSecret(m, x, v) { const k = store.get(KEYS, {}); if (v) k[secretId(m, x)] = v; else delete k[secretId(m, x)]; store.set(KEYS, k); }
const secretParams = m => m.params.filter(x => x.type === "secret");
/* secrets: optional {key: value} that overrides the stored keys (the configurator's unsaved input). */
/* Formats that turn a value into words or clock times: those can't be drawn over time. */
const NOT_NUMBERS = ["time", "date", "countdown", "wmo", "duration"];
function buildCfg(m, params, secrets) {
  const p = { ...modDefaults(m), ...params };
  let needsKey = null;
  secretParams(m).forEach(x => {
    p[x.key] = (secrets && x.key in secrets ? secrets[x.key] : getSecret(m, x)).trim();
    if (!p[x.key] && !x.optional) needsKey = { label: x.label, help: x.help };
  });
  const s = modSelected(m, p);
  let ds = modDisplays(m, s);
  m.params.forEach(x => { if (x.type === "choice") p[x.key] = s[x.key].value; });   // never build a URL from a value that isn't an option
  const extra = {}; Object.values(s).forEach(({ value, label, displays, ...rest }) => Object.assign(extra, rest));
  if (ds.includes("history")) {   // offered only when the big number really is a number
    const probe = { ...extra, ...m.build(p, s, "stat") };
    if (NOT_NUMBERS.includes(probe.format) || isTemplate(probe.path) || probe.sources && !probe.value) ds = ds.filter(d => d !== "history");
  }
  const display = ds.includes(p.display) ? p.display : ds[0];
  const c = { refresh: 900, ...extra, ...m.build(p, s, display === "history" ? "stat" : display), display, category: m.category, displays: ds };
  if (needsKey) c.needsKey = needsKey;
  const hide = secretParams(m).map(x => p[x.key]).filter(Boolean);
  if (hide.length) c.secrets = hide;   // masked wherever the URL is shown
  return c;
}

/* ═══ Expressions: a small, safe calculator for combined widgets ═══
   Numbers, "strings", source names with paths (gold, iss.latitude, p[now].SEK_per_kWh, p[*].SEK_per_kWh),
   + - * / % ( ), comparisons < > <= >= == !=, and/or/not, true/false and a short list of functions.
   No eval, no property access outside pick(), unknown names are errors. */
const EXPR_FUNCS = {
  min: (...a) => Math.min(...a.flat()), max: (...a) => Math.max(...a.flat()), abs: Math.abs, floor: Math.floor, ceil: Math.ceil,
  round: (x, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; },
  sum: (...a) => a.flat().reduce((s, x) => s + Number(x || 0), 0),
  avg: (...a) => { const v = a.flat().filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((s, x) => s + Number(x), 0) / v.length : NaN; },
  count: (...a) => a.flat().filter(x => x != null).length,
  distance: (la1, lo1, la2, lo2) => { const r = Math.PI / 180, a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(a)); },
  if: (c, a, b) => c ? a : b,
  text: (x, d) => typeof x === "number" && d != null ? x.toFixed(d) : String(x ?? ""),
  format: (x, d) => fmt(x, { decimals: d }), compact: x => fmt(x, { format: "compact" }),
  weather: code => WMO[code] || "", countdown: t => countdown(t), date: t => fmt(t, { format: "date" }), time: t => fmt(t, { format: "time" }),
};
const BANNED = /(^|[.[\]])(__proto__|prototype|constructor)($|[.[\]])/;
function tokenize(src) {
  const re = /\s*(?:(\d+(?:\.\d+)?(?:e[+-]?\d+)?)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([A-Za-z_]\w*(?:\.[A-Za-z_]\w*|\[(?:-?\d+|now|\*)\])*)|(<=|>=|==|!=|[-+*\/%(),<>]))/y;
  const out = []; let m; re.lastIndex = 0;
  src = String(src);
  if (src.length > 500) throw new Error("That calculation is too long.");
  while (re.lastIndex < src.length) {
    const at = re.lastIndex;
    if (!(m = re.exec(src))) { if (/^\s*$/.test(src.slice(at))) break; throw new Error(`Can't read “${src.slice(at).trim().slice(0, 12)}”.`); }
    if (m[1]) out.push({ t: "num", v: +m[1] });
    else if (m[2]) out.push({ t: "str", v: m[2].slice(1, -1).replace(/\\(.)/g, "$1") });
    else if (m[3]) out.push(["and", "or", "not", "true", "false"].includes(m[3]) ? { t: "op", v: m[3] } : { t: "name", v: m[3] });
    else out.push({ t: "op", v: m[4] });
  }
  return out;
}
const exprCache = new Map();
function compileExpr(src) {
  if (exprCache.has(src)) return exprCache.get(src);
  const tk = tokenize(src); let i = 0;
  const peek = v => tk[i] && tk[i].t === "op" && tk[i].v === v, eat = v => { if (!peek(v)) throw new Error(`Expected “${v}”.`); i++; };
  const bin = (next, ops) => () => { let l = next(); while (tk[i]?.t === "op" && ops.includes(tk[i].v)) { const op = tk[i++].v; l = { op, l, r: next() }; } return l; };
  const primary = () => {
    const t = tk[i++]; if (!t) throw new Error("The calculation ends too early.");
    if (t.t === "num" || t.t === "str") return { lit: t.v };
    if (t.t === "op" && (t.v === "true" || t.v === "false")) return { lit: t.v === "true" };
    if (t.t === "op" && t.v === "(") { const e = or(); eat(")"); return e; }
    if (t.t === "op" && t.v === "-") return { op: "neg", r: primary() };
    if (t.t === "op" && t.v === "not") return { op: "not", r: cmp() };
    if (t.t === "name") {
      if (BANNED.test(t.v)) throw new Error(`“${t.v}” isn't allowed.`);
      if (peek("(")) {
        if (!Object.prototype.hasOwnProperty.call(EXPR_FUNCS, t.v)) throw new Error(`Unknown function “${t.v}”.`);
        i++; const args = []; if (!peek(")")) { do args.push(or()); while (peek(",") && ++i); } eat(")");
        return { fn: t.v, args };
      }
      return { name: t.v };
    }
    throw new Error(`Unexpected “${t.v}”.`);
  };
  const mul = bin(primary, ["*", "/", "%"]), add = bin(mul, ["+", "-"]), cmp = bin(add, ["<", ">", "<=", ">=", "==", "!="]);
  const and = bin(() => peek("not") ? (i++, { op: "not", r: cmp() }) : cmp(), ["and"]), or = bin(and, ["or"]);
  const ast = or();
  if (i < tk.length) throw new Error(`Unexpected “${tk[i].v}”.`);
  if (exprCache.size > 500) exprCache.clear();
  exprCache.set(src, ast);
  return ast;
}
function evalExpr(src, env) {
  const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
  const ev = n => {
    if ("lit" in n) return n.lit;
    if (n.name) {
      const root = n.name.match(/^[A-Za-z_]\w*/)[0];
      if (!own(env, root)) throw new Error(`Unknown name “${root}”.`);
      const v = pick(env[root], n.name.slice(root.length).replace(/^\./, ""));
      return typeof v === "function" ? undefined : v;
    }
    if (n.fn) return EXPR_FUNCS[n.fn](...n.args.map(ev));
    const num = x => typeof x === "string" && x.trim() !== "" && !isNaN(x) ? Number(x) : x;
    if (n.op === "neg") return -num(ev(n.r));
    if (n.op === "not") return !ev(n.r);
    if (n.op === "and") return ev(n.l) && ev(n.r);
    if (n.op === "or") return ev(n.l) || ev(n.r);
    const rl = ev(n.l), rr = ev(n.r), l = num(rl), r = num(rr);
    switch (n.op) {
      case "+":   // two strings join ("409" + " " stays text); a numeric string next to a number adds
        if (typeof rl === "string" && typeof rr === "string") return rl + rr;
        return typeof l === "string" || typeof r === "string" ? `${rl ?? ""}${rr ?? ""}` : l + r;
      case "-": return l - r; case "*": return l * r; case "/": return l / r; case "%": return l % r;
      case "<": return l < r; case ">": return l > r; case "<=": return l <= r; case ">=": return l >= r;
      case "==": return l == r; case "!=": return l != r;   // loose on purpose: "200" == 200
    }
  };
  return ev(compileExpr(src));
}

/* Every URL a widget calls: one, or one per source in a combined widget. */
const SOURCE_NAME = /^[A-Za-z_]\w{0,19}$/;
const cfgUrls = c => c.sources && typeof c.sources === "object" ? Object.values(c.sources).map(s => s && s.url).filter(Boolean) : c.url ? [c.url] : [];

/* ═══ Combined widgets: several sources, one calculated value ═══
   { sources: { gold: { url, path }, fx: { url, path } }, calc: { kg: "gold * 32.15" }, value: "kg * fx",
     okIf: "...", warnIf: "...", words: { ok, warn, bad } }. Sources come in as named values, calc adds named
   steps in order, value is what the widget shows. okIf/warnIf pick the beacon's color. */
function combine(c, values) {
  const env = { ...values };
  Object.entries(c.calc || {}).forEach(([k, ex]) => { if (SOURCE_NAME.test(k)) env[k] = evalExpr(ex, env); });
  const value = c.value ? evalExpr(c.value, env) : c.template ? tmpl(c.template, env) : env;
  const level = c.okIf ? (evalExpr(c.okIf, env) ? "ok" : c.warnIf && evalExpr(c.warnIf, env) ? "warn" : "bad") : undefined;
  return { env, value: c.value && c.template ? tmpl(c.template, { ...env, value }) : value, level };
}

/* ═══ Sun: sunrise and sunset from the standard sunrise equation (accurate to a minute or two) ═══ */
function sunTimes(lat, lon, t = Date.now()) {
  const rad = Math.PI / 180, day = new Date(t);
  const noon = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 12) - lon / 15 * 3600e3;
  const n = Math.round(noon / 864e5 + 2440587.5 - 2451545 + 0.0008), J = n - lon / 360;
  const M = (357.5291 + 0.98560028 * J) % 360, C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const L = (M + C + 180 + 102.9372) % 360, transit = 2451545 + J + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * L * rad);
  const dec = Math.asin(Math.sin(L * rad) * Math.sin(23.4397 * rad));
  const cosW = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(dec)) / (Math.cos(lat * rad) * Math.cos(dec));
  if (cosW < -1) return { polar: "day" };
  if (cosW > 1) return { polar: "night" };
  const w = Math.acos(cosW) / rad / 360, ms = j => (j - 2440587.5) * 864e5;
  return { rise: ms(transit - w), set: ms(transit + w) };
}
const isNight = (lat, lon, t = Date.now()) => { const s = sunTimes(lat, lon, t); return s.polar ? s.polar === "night" : t < s.rise || t > s.set; };

/* ═══ Catalog hosts: every domain the built-in catalog can call ═══ */
function catalogHosts(modules, bank) {
  const hs = new Set(), add = c => cfgUrls(c).forEach(u => { const h = host(u); if (h) hs.add(h); });
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
const DISPLAY_TYPES = ["stat", "gauge", "text", "list", "ticker", "image", "beacon", "json", "chart", "history"];
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
  path: v => str(v, 500), item: v => str(v, 500), empty: v => str(v, 120), template: v => str(v, 500), caption: v => str(v, 200),
  display: v => DISPLAY_TYPES.includes(v) ? v : undefined, format: v => FORMATS.includes(v) ? v : undefined,
  prefix: v => str(v, 20), unit: v => str(v, 20), category: v => str(v, 20),
  min: v => num(v, -1e15, 1e15), max: v => num(v, -1e15, 1e15), scale: v => num(v, -1e15, 1e15),
  decimals: v => num(v, 0, 10) === undefined ? undefined : Math.round(num(v, 0, 10)), refresh: v => num(v, 10, 86400),
  ok: vals, warn: vals,
  chart: v => ["line", "area", "bar"].includes(v) ? v : undefined, xFormat: v => ["hour", "time", "date", "day", "month"].includes(v) ? v : undefined,
  mark: v => ["min", "max"].includes(v) ? v : undefined, xField: v => str(v, 200),
  yFields: v => typeof v === "string" ? v.slice(0, 200) : Array.isArray(v) ? (v.filter(x => typeof x === "string").slice(0, 4).map(x => x.slice(0, 200)) || undefined) : undefined,
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
  if (c.sources && typeof c.sources === "object" && !Array.isArray(c.sources)) {
    const src = Object.entries(c.sources).filter(([k]) => SOURCE_NAME.test(k)).slice(0, 6)
      .map(([k, s]) => [k, s && { url: CUSTOM_FIELDS.url(s.url), path: str(s.path, 500) || "", ...(CUSTOM_FIELDS.headers(s.headers) ? { headers: CUSTOM_FIELDS.headers(s.headers) } : {}) }])
      .filter(([, s]) => s && s.url);
    if (src.length) {
      out.sources = Object.fromEntries(src); delete out.url;
      ["value", "okIf", "warnIf"].forEach(k => { if (typeof c[k] === "string") out[k] = c[k].slice(0, 500); });
      if (c.calc && typeof c.calc === "object") out.calc = Object.fromEntries(Object.entries(c.calc).filter(([k, v]) => SOURCE_NAME.test(k) && typeof v === "string").slice(0, 8).map(([k, v]) => [k, v.slice(0, 500)]));
    }
  }
  const first = cfgUrls(out)[0];
  return first ? { ...out, display: out.display || "text", name: out.name || host(first) || "Custom widget", category: out.category || "custom" } : null;
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
    const { id, x, y, w: _w, h, ...c } = clone(w);
    const clean = o => {
      if (o.headers) { o.headers = Object.fromEntries(Object.entries(o.headers).filter(([k]) => !(SECRET.test(k) && ++stripped))); if (!Object.keys(o.headers).length) delete o.headers; }
      if (/[?&](api_?key|key|token|access_token|apikey)=(?!DEMO_KEY)/i.test(o.url || "")) { o.url = o.url.replace(/([?&](?:api_?key|key|token|access_token|apikey)=)[^&]*/gi, "$1YOUR_KEY"); stripped++; }
    };
    clean(c); Object.values(c.sources || {}).forEach(s => s && clean(s));
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

if (typeof module !== "undefined") module.exports = { esc, maskSecrets, uid, pad, clamp, clone, store, host, debounce, WMO, fillPlaceholders, pickNow, pick, unescapeHTML, isTemplate, tmpl, resolve, countdown, fmtDuration, fmt, timeAgo, modDefaults, modSelected, modDisplays, buildCfg, getSecret, setSecret, secretParams, catalogHosts, encode, decode, hydrate, shareable, migrateBoards, compileExpr, evalExpr, combine, cfgUrls, sunTimes, isNight, LOCALE, NOT_NUMBERS, sanitizeCustom, sanitizeParams, SHARE_MAX };
