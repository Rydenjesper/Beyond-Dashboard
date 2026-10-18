/* Beyond Dashboard MCP tools. Everything here reuses the app's own code (js/engine.js, blueprints.js,
   js/lookups.js) loaded into Node, so a board built from chat is validated and encoded exactly like
   one built in the browser. The result is a share link: open it and choose "Add as new board".
   API keys are never handled here: secret params are ignored, those widgets ask for a key in the app. */
const { load } = require("../tests/load");

/* lookups.js expects the app's fetchData; Node has fetch and no CORS. */
globalThis.fetchData = async c => {
  const res = await fetch(c.url, { headers: c.headers || {} });
  if (!res.ok) throw new Error(`The API answered ${res.status}`);
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return txt.trim(); }
};
const $ = load("js/engine.js", "blueprints.js", "js/lookups.js");
const E = name => $(name);
const MODULES = $("window.MODULES"), BLUEPRINTS = $("window.BLUEPRINTS"), PLACES = $("window.PLACES");
const MOD = Object.fromEntries(MODULES.map(m => [m.id, m])), BANK = Object.fromEntries(BLUEPRINTS.map(b => [b.id, b]));
const CATALOG_HOSTS = E("catalogHosts")(MODULES, BLUEPRINTS);
const DEFAULT_SIZE = { stat: [2, 1], gauge: [2, 2], text: [3, 1], list: [2, 2], ticker: [6, 1], image: [2, 2], beacon: [2, 1], json: [2, 2], chart: [3, 2], history: [3, 2], local: [2, 2] };   // as js/app.js
const LIVE = "https://rydenjesper.github.io/Beyond-Dashboard/", ORIGIN = "https://rydenjesper.github.io";
const has = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const catOf = x => x.category || (x.mod && MOD[x.mod]?.category) || "custom";

function paramSummary(x) {
  if (x.type === "choice") return { key: x.key, type: "choice", default: x.default, options: x.options.map(o => o.value) };
  if (x.type === "place") return { key: x.key, type: "place", hint: "a place name like \"Göteborg\", or { name, lat, lon }" };
  if (x.type === "search") return { key: x.key, type: "search", hint: `a name to look up (${x.search === "sl_sites" ? "SL stop" : "SR channel"}), e.g. "${x.default.label}"` };
  if (x.type === "secret") return { key: x.key, type: "secret", hint: "API key: can't be set from here, the user adds it in the app" + (x.optional ? " (optional)" : "") };
  const HINTS = { currencies: "an ISO currency code, e.g. SEK", countries: "a two-letter country code, e.g. SE", coins: "a coin symbol, e.g. BTC",
    police: "a Swedish county (\"Skåne län\") or town (\"Malmö\")", sl_lines: "a line number at the chosen stop, or empty for all", wiki_titles: "an exact Wikipedia article title" };
  const hint = x.input === "date" ? "YYYY-MM-DD for one date, or MM-DD for every year" : x.input === "zones" ? "comma-separated IANA time zones, e.g. \"Europe/London, Asia/Tokyo\"" : HINTS[x.pick || x.suggest] || x.placeholder;
  return { key: x.key, type: x.type, default: x.default, ...(hint ? { hint } : {}) };
}

/* ── search_catalog ── */
function searchCatalog({ query = "", category } = {}) {
  const q = String(query).trim().toLowerCase();
  const all = [...MODULES.map(m => ({ ...m, kind: "module" })), ...BLUEPRINTS.map(b => ({ ...b, kind: "blueprint" }))];
  const hits = all.filter(x => (!category || catOf(x) === category) && (!q || `${x.name} ${x.desc} ${catOf(x)} ${x.id}`.toLowerCase().includes(q)));
  return {
    categories: [...new Set(all.map(catOf))].sort(),
    total: hits.length,
    results: hits.slice(0, 40).map(x => ({ kind: x.kind, id: x.id, name: x.name, category: catOf(x), desc: x.desc,
      ...(x.kind === "module" ? { params: x.params.map(p => p.key) } : x.mod ? { module: x.mod } : {}) })),
  };
}

/* ── describe_module ── */
function describeModule({ id }) {
  const m = MOD[id];
  if (!m) {
    if (BANK[id]) return { kind: "blueprint", id, name: BANK[id].name, desc: BANK[id].desc, category: catOf(BANK[id]), note: "Ready-made: add it with { blueprint: id }. No params." };
    throw new Error(`No module or blueprint called “${id}”. Use search_catalog to find one.`);
  }
  const defaults = E("buildCfg")(m, {}, {});
  return { kind: "module", id, name: m.name, category: m.category, desc: m.desc, params: m.params.map(paramSummary),
    displays: defaults.displays, defaultDisplay: defaults.display, defaultSize: defaults.size || DEFAULT_SIZE[defaults.display] || [2, 1],
    note: defaults.local ? "Personal widget: no API, its content stays on the user's device." : undefined };
}

/* ── params from chat: names become places and search results ── */
async function geocode(name) {
  const preset = PLACES.find(p => p.name.toLowerCase() === String(name).trim().toLowerCase());
  if (preset) return { name: preset.name, lat: preset.lat, lon: preset.lon };
  const d = await globalThis.fetchData({ url: `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(String(name).trim())}&count=1&language=en` });
  const r = d?.results?.[0];
  if (!r) throw new Error(`Couldn't find a place called “${name}”.`);
  return { name: r.name, lat: +r.latitude.toFixed(4), lon: +r.longitude.toFixed(4) };
}
async function resolveParams(m, params = {}, warnings, label) {
  const out = {};
  for (const [k, v] of Object.entries(params || {})) {
    const x = m.params.find(p => p.key === k);
    if (k === "display") { out.display = v; continue; }
    if (!x) { warnings.push(`${label}: “${k}” isn't a parameter of ${m.id} (it has ${m.params.map(p => p.key).join(", ") || "none"}).`); continue; }
    if (x.type === "secret") { warnings.push(`${label}: API keys can't be set from chat. The widget will ask for its key in the app.`); continue; }
    if (x.type === "place" && typeof v === "string") out[k] = await geocode(v);
    else if (x.type === "search" && typeof v === "string") {
      const hit = (await E("SEARCHERS")[x.search](v))[0];
      if (!hit) throw new Error(`${label}: nothing called “${v}” for ${k}.`);
      out[k] = { value: hit.value, label: hit.label };
    } else out[k] = v;
  }
  const clean = E("sanitizeParams")(m, out);
  for (const k of Object.keys(out)) if (!has(clean, k)) {
    const x = m.params.find(p => p.key === k);
    warnings.push(`${label}: ${JSON.stringify(out[k])} isn't a valid ${k}${x?.type === "choice" ? ` (options: ${x.options.map(o => o.value).join(", ")})` : ""}; the default is used.`);
  }
  if (has(clean, "display")) {
    const ds = E("buildCfg")(m, clean, {}).displays;
    if (!ds.includes(clean.display)) { warnings.push(`${label}: display “${clean.display}” isn't available here (choose ${ds.join(", ")}).`); delete clean.display; }
  }
  return clean;
}
const sizeOf = (c, w, h) => {
  const [dw, dh] = c.size || DEFAULT_SIZE[c.display] || [2, 1];
  const n = (v, d, max) => Number.isInteger(v) && v >= 1 && v <= max ? v : d;
  return { w: n(w, dw, 6), h: n(h, dh, 4) };
};

/* ── build_board ── */
async function buildBoard({ title = "From Claude", widgets = [], base_url } = {}) {
  if (!Array.isArray(widgets) || !widgets.length) throw new Error("Give at least one widget.");
  if (widgets.length > 40) throw new Error("That's a lot of widgets; keep a board to 40 or fewer.");
  const warnings = [], board = { title: String(title).slice(0, 100), widgets: [] }, summary = [];
  for (const [i, spec] of widgets.entries()) {
    const label = `Widget ${i + 1}`;
    if (spec.module) {
      const m = MOD[spec.module]; if (!m) throw new Error(`${label}: no module called “${spec.module}”.`);
      const params = await resolveParams(m, spec.params, warnings, label), c = E("buildCfg")(m, params, {});
      board.widgets.push({ id: `w${i}`, mod: m.id, params, ...(spec.title ? { title: String(spec.title).slice(0, 120) } : {}), ...sizeOf(c, spec.w, spec.h) });
      summary.push(`${spec.title || c.name} (${m.id}, ${c.display})${c.needsKey ? ", needs an API key in the app" : ""}`);
    } else if (spec.blueprint) {
      const b = BANK[spec.blueprint]; if (!b) throw new Error(`${label}: no ready-made widget called “${spec.blueprint}”.`);
      const c = b.mod ? E("buildCfg")(MOD[b.mod], b.params, {}) : b;
      board.widgets.push(b.mod ? { id: `w${i}`, mod: b.mod, params: E("clone")(b.params), title: b.name, ...sizeOf(c, spec.w, spec.h) } : { id: `w${i}`, bp: b.id, ...sizeOf(c, spec.w, spec.h) });
      summary.push(`${b.name} (${b.id})`);
    } else if (spec.custom) {
      const c = E("sanitizeCustom")(spec.custom);
      if (!c) throw new Error(`${label}: a custom widget needs an https url (or sources).`);
      const outside = E("cfgUrls")(c).map(E("host")).filter(h => !CATALOG_HOSTS.has(h));
      if (outside.length) warnings.push(`${label}: ${[...new Set(outside)].join(", ")} isn't in the catalog, so the app asks before loading it.`);
      board.widgets.push({ ...c, id: `w${i}`, ...sizeOf(c, spec.w, spec.h) });
      summary.push(`${c.name} (custom, ${c.display})`);
    } else throw new Error(`${label}: use { module, params }, { blueprint } or { custom }.`);
  }
  const { payload, stripped } = E("shareable")(board, MOD);
  if (stripped) warnings.push(`Removed ${stripped} API key(s) or auth header(s) from custom widgets.`);
  const code = await E("encode")(payload);
  const back = E("hydrate")(await E("decode")(code), MOD, BANK);   // the same check the app runs when the link opens
  if (back.widgets.length !== board.widgets.length) throw new Error("Some widgets didn't survive validation; check the warnings.");
  const base = typeof base_url === "string" && /^https?:\/\//.test(base_url) ? base_url.split("#")[0] : LIVE;
  return { link: `${base}#d=${code}`, title: board.title, widgets: summary, warnings,
    howTo: "Open the link and choose “Add as new board”. Nothing is saved until then." };
}

/* ── preview_widget: real values from Node, plus whether a browser would be allowed to read them ── */
async function previewWidget(spec = {}) {
  const warnings = [];
  let c;
  if (spec.module) {
    const m = MOD[spec.module]; if (!m) throw new Error(`No module called “${spec.module}”.`);
    c = E("buildCfg")(m, await resolveParams(m, spec.params, warnings, "Preview"), {});
  } else if (spec.blueprint) {
    const b = BANK[spec.blueprint]; if (!b) throw new Error(`No ready-made widget called “${spec.blueprint}”.`);
    c = b.mod ? E("buildCfg")(MOD[b.mod], b.params, {}) : b;
  } else if (spec.custom) { c = E("sanitizeCustom")(spec.custom); if (!c) throw new Error("A custom widget needs an https url (or sources)."); }
  else throw new Error("Use { module, params }, { blueprint } or { custom }.");
  if (c.local) return { name: c.name, display: "personal", note: "No API: this widget works on the user's device." };
  if (c.needsKey) return { name: c.name, note: `Needs ${c.needsKey.label}, which the user adds in the app.` };
  const urls = E("cfgUrls")(c), browserOk = {}, data = {};
  for (const u of urls) {
    const res = await fetch(E("fillPlaceholders")(u), { headers: { Origin: ORIGIN, ...(c.headers || {}) } });
    browserOk[E("host")(u)] = !!res.headers.get("access-control-allow-origin");
    const txt = await res.text(); let d; try { d = JSON.parse(txt); } catch { d = txt.trim(); }
    if (!res.ok) throw new Error(`${E("host")(u)} answered ${res.status}.`);
    data[u] = d;
  }
  let value, level;
  if (c.sources) {
    const vals = Object.fromEntries(Object.entries(c.sources).map(([k, s]) => [k, E("resolve")(s, data[s.url])]));
    ({ value, level } = E("combine")(c, vals));
  } else value = E("resolve")(c, data[c.url]);
  const shown = Array.isArray(value) ? { items: value.length, first: value.slice(0, 3) }
    : typeof value === "string" && /^\s*<\?xml|^\s*<(rss|feed)\b/.test(value) ? "An RSS/Atom feed: the dashboard turns it into headlines (use the rss module)."
    : typeof value === "string" && value.length > 300 ? value.slice(0, 300) + "…" : value;
  Object.entries(browserOk).forEach(([h, ok]) => { if (!ok) warnings.push(`${h} doesn't allow browser requests (CORS): it works here but will fail in the dashboard.`); });
  return { name: c.name, display: c.display, value: shown, ...(level ? { level } : {}), unit: c.unit, warnings };
}

module.exports = { searchCatalog, describeModule, buildBoard, previewWidget, get: E };
