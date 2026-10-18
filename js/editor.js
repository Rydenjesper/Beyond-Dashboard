"use strict";
/* Custom API editor. */
/* ═══ Custom API editor ═══════════════════════════════════ */
let editing = null, exData;
const F = id => $("#e_" + id);
/* Combine mode: several sources, one calculation. URL, Fetch, the tree and the path chooser all work on the active source. */
let combo = null;   // { srcs: [{ name, url, path, data }], active }
const srcNow = () => combo.srcs[combo.active];
function keepActive() { if (!combo) return; Object.assign(srcNow(), { url: F("url").value.trim(), path: F("path").value.trim(), data: exData }); }
function showSource(i, keep = true) {
  if (keep) keepActive();
  combo.active = i;
  const s = srcNow(); F("url").value = s.url; F("path").value = s.path; F("srcName").value = s.name; exData = s.data;
  if (exData === undefined) { $("#ex_tree").innerHTML = `<div class="ex-empty">Paste this source's URL and press <b>Fetch</b>.</div>`; $("#e_pathSel").disabled = true; $("#ex_status").textContent = ""; }
  else { renderTree(); renderPathOptions(); markTreeRow(); }
  renderSourceChips(); updatePreview();
}
function renderSourceChips() {
  $("#e_srcChips").innerHTML = combo.srcs.map((s, i) => `<button type="button" class="chip" data-src="${i}" aria-pressed="${i === combo.active}">${esc(s.name)}<em>${s.data === undefined ? "…" : "✓"}</em></button>`).join("")
    + (combo.srcs.length < 6 ? `<button type="button" class="chip" data-src="add">+ Add source</button>` : "")
    + (combo.srcs.length > 1 ? `<button type="button" class="chip" data-src="del">Remove ${esc(srcNow().name)}</button>` : "");
  $("#e_urlLbl").textContent = `URL for “${srcNow().name}”`; $("label[for=e_pathSel]").textContent = `Field from “${srcNow().name}”`;
}
function setCombine(on, srcs) {
  combo = on ? { srcs: srcs || [{ name: "a", url: F("url").value.trim(), path: F("path").value.trim(), data: exData }], active: 0 } : null;
  $("#edForm").classList.toggle("combining", on);
  if (!on) { $("#e_urlLbl").textContent = "Endpoint URL"; $("label[for=e_pathSel]").textContent = "Value to show"; return; }
  F("srcName").value = combo.srcs[0].name; F("url").value = combo.srcs[0].url; F("path").value = combo.srcs[0].path; exData = combo.srcs[0].data;
  if (!F("value").value && combo.srcs.length === 1) F("value").value = combo.srcs[0].name;
  renderSourceChips();
}
$("#e_combine").addEventListener("click", () => { setCombine(true); if (!["stat", "text", "beacon", "gauge", "history"].includes(F("display").value)) F("display").value = "stat"; toggleFields(); updatePreview(); });
$("#e_srcChips").addEventListener("click", e => {
  const b = e.target.closest("[data-src]"); if (!b) return;
  if (b.dataset.src === "add") {
    keepActive(); let n = 98; while (combo.srcs.some(s => s.name === String.fromCharCode(n))) n++;
    combo.srcs.push({ name: String.fromCharCode(n), url: "", path: "", data: undefined }); showSource(combo.srcs.length - 1); F("url").focus();
  } else if (b.dataset.src === "del") { combo.srcs.splice(combo.active, 1); showSource(0, false); }
  else showSource(+b.dataset.src);
});
F("srcName").addEventListener("change", () => {
  const old = srcNow().name, v = F("srcName").value.trim();
  if (!SOURCE_NAME.test(v) || ["and", "or", "not", "true", "false"].includes(v) || combo.srcs.some((s, i) => i !== combo.active && s.name === v)) { toast("Use a short name: letters, digits and _, starting with a letter"); F("srcName").value = old; return; }
  srcNow().name = v;
  F("value").value = F("value").value.replace(new RegExp(`\\b${old}\\b`, "g"), v);   // keep the calculation in step
  renderSourceChips(); updatePreview();
});
["value", "okIf", "warnIf"].forEach(k => F(k).addEventListener("input", updatePreview));
function comboResult() {
  keepActive();
  const missing = combo.srcs.find(s => s.data === undefined);
  if (missing) return { error: `Fetch “${missing.name}” to see the result.` };
  try {
    const vals = Object.fromEntries(combo.srcs.map(s => [s.name, resolve({ path: s.path }, s.data)]));
    return combine({ value: F("value").value.trim() || undefined, okIf: F("okIf").value.trim() || undefined, warnIf: F("warnIf").value.trim() || undefined }, vals);
  } catch (e) { return { error: e.message }; }
}

function openEditor(w) {
  editing = w || null;
  const v = w ? cfgOf(w) : { display: "stat", refresh: 300, min: 0, max: 100 };
  ["value", "okIf", "warnIf"].forEach(k => F(k).value = v[k] ?? "");
  setCombine(false);
  ["url", "name", "path", "item", "prefix", "unit", "min", "max", "decimals", "refresh"].forEach(k => F(k).value = v[k] ?? "");
  F("display").value = v.display || "stat"; F("format").value = v.format || ""; F("chart").value = v.chart || "line";
  const ys = [].concat(v.yFields ?? []);
  setOpts(F("x"), v.xField ? [v.xField] : [], v.xField || ""); setOpts(F("y"), ys.slice(0, 1), ys[0] || ""); setOpts(F("y2"), ys.slice(1, 2), ys[1] || "", true);
  F("ok").value = [].concat(v.ok ?? []).join(", "); F("warn").value = [].concat(v.warn ?? []).join(", ");
  F("headers").value = Object.entries(v.headers || Object.values(v.sources || {})[0]?.headers || {}).map(([k, x]) => `${k}: ${x}`).join("\n");
  $("#edTitle").textContent = w ? `Edit ${v.name}` : "Connect an API";
  F("name").dataset.auto = w ? "0" : "1";
  $("#e_save").textContent = w ? "Save changes" : "Add to dashboard";
  exData = undefined; $("#ex_status").textContent = "";
  $("#e_pathSel").innerHTML = `<option value="">Press Fetch to see every field in the response</option>`; $("#e_pathSel").disabled = true;
  $("#e_adv").open = isTemplate(v.path); $("#e_itemFields").innerHTML = "";
  $("#ex_tree").innerHTML = `<div class="ex-empty">Press <b>Fetch</b> to load the response. Click any value to point the widget at it.${w ? "" : `<br><br>No idea where to start? Try <code>https://api.wheretheiss.at/v1/satellites/25544</code>`}</div>`;
  if (v.sources) setCombine(true, Object.entries(v.sources).map(([name, s]) => ({ name, url: s.url, path: s.path || "", data: undefined })));
  toggleFields(); updatePreview();
  if ($("#bank").open) $("#bank").close();
  $("#editor").showModal();
  if (v.sources) (async () => { for (let i = combo.srcs.length - 1; i >= 0; i--) { showSource(i); await testFetch(); } })();
  else if (w) testFetch();
}
/* Chart field pickers: x can be any field of a point, y only numbers. */
function setOpts(sel, fields, cur, optional) {
  const list = [...new Set([...(cur ? [cur] : []), ...fields])];
  sel.innerHTML = (optional || !list.length ? `<option value="">${optional ? "None" : "Fetch to choose"}</option>` : "") + list.map(f => `<option value="${esc(f)}"${f === cur ? " selected" : ""}>${esc(f)}</option>`).join("");
}
function renderChartFields() {
  const v = exData === undefined ? undefined : resolve({ ...readForm(), display: "list" }, exData);
  const first = Array.isArray(v) ? v.find(x => x && typeof x === "object") : undefined;
  if (!first) return;
  const leaves = Array.isArray(first) ? first.slice(0, 8).map((_, i) => ({ p: `[${i}]`, label: "" })) : collectPaths(first).filter(x => x.p && !x.label.endsWith("items]")), nums = leaves.filter(x => !isNaN(Number(pick(first, x.p))) && pick(first, x.p) !== "" && typeof pick(first, x.p) !== "boolean").map(x => x.p);
  const timeish = leaves.find(x => !isNaN(asTime(pick(first, x.p))))?.p || leaves.find(x => typeof pick(first, x.p) === "string")?.p || "";
  setOpts(F("x"), leaves.map(x => x.p), F("x").value || timeish);
  setOpts(F("y"), nums, F("y").value || nums.find(n => n !== F("x").value) || "");
  setOpts(F("y2"), nums, F("y2").value, true);
}
["x", "y", "y2", "chart"].forEach(k => F(k).addEventListener("change", updatePreview));
function toggleFields() { const d = F("display").value; $$("#edForm [data-for]").forEach(f => f.hidden = !f.dataset.for.split(" ").includes(d)); }
F("display").addEventListener("change", () => { toggleFields(); if (F("display").value === "chart") renderChartFields(); updatePreview(); });
["path", "item", "prefix", "unit", "decimals"].forEach(k => F(k).addEventListener("input", updatePreview));
F("format").addEventListener("change", updatePreview);
function parseHeaders(t) { const h = {}; t.split("\n").forEach(l => { const i = l.indexOf(":"); if (i > 0) h[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }); return h; }
function readForm() {
  const num = k => F(k).value === "" ? undefined : +F(k).value;
  const list = k => F(k).value.split(",").map(s => s.trim()).filter(Boolean);
  return {
    name: F("name").value.trim() || host(F("url").value) || "Combined widget", url: F("url").value.trim(), path: F("path").value.trim(),
    display: F("display").value, item: F("item").value.trim() || undefined, prefix: F("prefix").value || undefined, unit: F("unit").value || undefined,
    min: num("min"), max: num("max"), decimals: num("decimals"), format: F("format").value || undefined, refresh: Math.max(10, num("refresh") || 300),
    ok: list("ok"), warn: list("warn"), headers: parseHeaders(F("headers").value), category: "custom",
    ...(F("display").value === "chart" ? { chart: F("chart").value, xField: F("x").value || undefined, yFields: [F("y").value, F("y2").value].filter(Boolean) } : {}),
    ...(combo ? comboFields() : {}),
  };
}
/* Combine mode saves sources + calculation instead of url + path. Headers apply to every source. */
function comboFields() {
  keepActive();
  const headers = parseHeaders(F("headers").value), opt = k => F(k).value.trim() || undefined;
  return { url: undefined, path: undefined, headers: undefined, value: opt("value"), okIf: opt("okIf"), warnIf: opt("warnIf"),
    sources: Object.fromEntries(combo.srcs.filter(s => s.url).map(s => [s.name, { url: s.url, path: s.path, ...(Object.keys(headers).length ? { headers } : {}) }])) };
}
async function testFetch() {
  const url = F("url").value.trim(); if (!url) { F("url").focus(); return; }
  $("#ex_status").textContent = "fetching…";
  try {
    const t0 = performance.now();
    const res = await fetch(fillPlaceholders(url), { headers: parseHeaders(F("headers").value), cache: "no-store" });
    const txt = await res.text(); try { exData = JSON.parse(txt); } catch { exData = txt.trim(); }
    $("#ex_status").textContent = `${res.status} · ${Math.round(performance.now() - t0)} ms · ${(txt.length / 1024).toFixed(1)} kB`;
    const cur = F("path").value.trim();
    if (cur && !isTemplate(cur) && pick(exData, cur) === undefined) F("path").value = "";   // new endpoint, old field doesn't exist
    renderTree(); renderPathOptions(); markTreeRow(); renderItemFields();
    if (combo) { keepActive(); renderSourceChips(); }
    if (!F("name").value || F("name").dataset.auto === "1") { F("name").value = host(url); F("name").dataset.auto = "1"; }   // keep auto-names in sync until the user types one
  } catch {
    exData = undefined; $("#ex_status").textContent = "failed";
    $("#e_pathSel").innerHTML = `<option value="">No response to choose from</option>`; $("#e_pathSel").disabled = true;
    $("#ex_tree").innerHTML = `<div class="ex-empty"><b>Couldn't reach that endpoint.</b><br>Either the URL is wrong, or the API doesn't allow requests from browsers (CORS). Many APIs only work from a server. Check the API docs for “CORS” or try another endpoint.</div>`;
  }
  updatePreview();
}
$("#e_test").addEventListener("click", testFetch);
F("name").addEventListener("input", () => F("name").dataset.auto = "0");
F("url").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); testFetch(); } });
function renderTree() {
  const out = []; let rows = 0;
  const walk = (v, path, key, depth) => {
    if (rows > 400) return;
    const ind = `padding-left:${depth * 14 + 6}px`, k = key !== null ? `<span class="k">${esc(key)}</span>:` : "";
    if (Array.isArray(v)) {
      rows++; out.push(`<div class="row" style="${ind}" data-p="${esc(path)}">${k}<span class="arr">[${v.length} items]</span></div>`);
      v.slice(0, 3).forEach((x, i) => walk(x, `${path}[${i}]`, i, depth + 1));
      if (v.length > 3) out.push(`<div style="padding-left:${(depth + 1) * 14 + 12}px;color:var(--faint)">… ${v.length - 3} more</div>`);
    } else if (v && typeof v === "object") {
      if (key !== null) { rows++; out.push(`<div class="row" style="${ind}" data-p="${esc(path)}">${k}<span class="v">{…}</span></div>`); }
      Object.entries(v).forEach(([kk, x]) => walk(x, path ? `${path}.${kk}` : kk, kk, key === null ? depth : depth + 1));
    } else { rows++; out.push(`<div class="row" style="${ind}" data-p="${esc(path)}">${k}<span class="v">${esc(JSON.stringify(v))}</span></div>`); }
  };
  walk(exData, "", null, 0);
  $("#ex_tree").innerHTML = out.join("") || `<div class="ex-empty">Empty response.</div>`;
}
/* Every pickable field in the response: leaves, plus arrays (for lists). Arrays are sampled through their first item. */
function collectPaths(data) {
  const out = [];
  const short = v => { const s = typeof v === "string" ? `"${v}"` : JSON.stringify(v); return s.length > 42 ? s.slice(0, 41) + "…" : s; };
  const walk = (v, path, depth) => {
    if (out.length > 400 || depth > 8) return;
    if (Array.isArray(v)) {
      out.push({ p: path, label: `${path || "(whole response)"}  ·  [${v.length} items]` });
      if (v.length) walk(v[0], `${path}[0]`, depth + 1);
    } else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, path ? `${path}.${k}` : k, depth + 1));
    else out.push({ p: path, label: `${path || "(whole response)"}  ·  ${short(v)}` });
  };
  walk(data, "", 0);
  return out;
}
function renderPathOptions() {
  const sel = $("#e_pathSel"), cur = F("path").value.trim(), paths = collectPaths(exData);
  const known = paths.some(x => x.p === cur);
  sel.innerHTML = (cur && !known ? `<option value="${esc(cur)}">Custom: ${esc(cur)}</option>` : "") +
    (!known && !cur ? `<option value="__none" disabled selected>Choose a field…</option>` : "") +
    paths.map(x => `<option value="${esc(x.p)}"${x.p === cur ? " selected" : ""}>${esc(x.label)}</option>`).join("");
  sel.disabled = false;
  if (cur && !known) { sel.value = cur; $("#e_adv").open = true; }
}
function markTreeRow() {
  const p = F("path").value.trim();
  $$("#ex_tree .row").forEach(r => r.classList.toggle("sel", r.dataset.p === p));
}
/* For lists: offer the fields of one item as one-click {placeholders}. */
function renderItemFields() {
  const box = $("#e_itemFields"), v = exData === undefined ? undefined : resolve(readForm(), exData);
  const first = Array.isArray(v) ? v[0] : undefined;
  if (!first || typeof first !== "object") { box.innerHTML = ""; return; }
  const fields = collectPaths(first).filter(x => x.p && !x.label.endsWith("items]")).slice(0, 24);
  box.innerHTML = fields.map(x => `<button type="button" class="chip" data-field="${esc(x.p)}" title="${esc(x.label)}">${esc(x.p)}</button>`).join("");
}
$("#e_itemFields").addEventListener("click", e => {
  const b = e.target.closest("[data-field]"); if (!b) return;
  const cur = F("item").value.trim();
  F("item").value = cur ? `${cur} · {${b.dataset.field}}` : `{${b.dataset.field}}`;
  updatePreview();
});
function choosePath(p) {
  const v = pick(exData, p);
  F("path").value = p;
  if (combo) { keepActive(); if (!F("value").value.trim()) F("value").value = srcNow().name; }
  else if (Array.isArray(v) && !["list", "ticker", "json", "chart"].includes(F("display").value)) F("display").value = "list";
  else if (typeof v === "number" && !["stat", "gauge"].includes(F("display").value)) F("display").value = "stat";
  else if (typeof v === "string" && /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(v)) F("display").value = "image";
  else if (typeof v === "string" && ["stat", "gauge"].includes(F("display").value) && isNaN(Number(v))) F("display").value = "text";
  if (Array.isArray(v) && !F("item").value) {   // sensible default line for list items
    const f = v[0] && typeof v[0] === "object" ? collectPaths(v[0]).find(x => /title|name|text|headline|label/i.test(x.p) && !x.label.endsWith("items]")) : null;
    if (f) F("item").value = `{${f.p}}`;
  }
  if ($("#e_pathSel").value !== p) $("#e_pathSel").value = p;
  toggleFields(); markTreeRow(); renderItemFields(); renderChartFields(); updatePreview();
}
$("#ex_tree").addEventListener("click", e => { const row = e.target.closest(".row"); if (row) choosePath(row.dataset.p); });
$("#e_pathSel").addEventListener("change", e => choosePath(e.target.value));
F("path").addEventListener("input", () => {
  if (exData === undefined) return;
  const p = F("path").value.trim(), sel = $("#e_pathSel");
  if ([...sel.options].some(o => o.value === p && !o.textContent.startsWith("Custom"))) sel.value = p; else renderPathOptions();
  markTreeRow(); renderItemFields();
});
/* Only offer views that can show the chosen value: a gauge needs a number, a list needs a list. */
const NEEDS = { stat: "a number or short text", gauge: "a number", history: "a number", list: "a list", ticker: "a list", chart: "a list of items with numbers", image: "an image address", beacon: "a value", text: "a value", json: "a value" };
function fitDisplays(v) {
  if (v === undefined) return null;   // nothing fetched yet: everything stays open
  const num = v !== null && v !== "" && typeof v !== "boolean" && !isNaN(Number(v)), arr = Array.isArray(v);
  const objs = arr && v.some(x => x && typeof x === "object" && Object.values(x).some(y => y !== "" && y !== null && !isNaN(Number(y))));
  const ok = new Set(["json"]);
  if (num) ["stat", "gauge", "history", "text", "beacon"].forEach(d => ok.add(d));
  else if (typeof v === "string" || typeof v === "boolean") {
    ["text", "beacon"].forEach(d => ok.add(d));
    if (String(v).length <= 24) ok.add("stat");
    if (/^https:\/\/\S+$/.test(String(v))) ok.add("image");
  } else if (arr) { ["list", "ticker"].forEach(d => ok.add(d)); if (objs || v.length > 1 && v.every(Array.isArray)) ok.add("chart"); }
  return ok;
}
function updateDisplayOptions() {
  let v;
  if (combo) { const r = comboResult(); v = r.error ? undefined : r.value; }
  else if (exData !== undefined) { try { v = resolve({ ...readForm(), display: "list", template: undefined }, exData); } catch {} }
  const ok = fitDisplays(v);
  [...F("display").options].forEach(o => {
    o.dataset.label ||= o.textContent;
    const fits = !ok || ok.has(o.value);
    o.disabled = !fits && o.value !== F("display").value;   // the current choice stays selectable so nothing jumps
    o.textContent = fits ? o.dataset.label : `${o.dataset.label}, needs ${NEEDS[o.value]}`;
  });
}

function updatePreview() {
  updateDisplayOptions();
  if (combo) {
    const out = comboResult(), c = readForm();
    $("#ex_preview").textContent = out.error ? out.error : `${out.level ? { ok: "Green", warn: "Yellow", bad: "Red" }[out.level] + " · " : ""}${typeof out.value === "object" ? JSON.stringify(out.value).slice(0, 120) : `${c.prefix || ""}${fmt(out.value, c)}${c.unit ? " " + c.unit : ""}`}`;
    return;
  }
  if (exData === undefined) { $("#ex_preview").textContent = "—"; return; }
  const c = readForm(), v = resolve(c, exData);
  let s;
  if (c.display === "chart") { const a = Array.isArray(v) ? v : []; s = a.length ? `${a.length} points · ${[].concat(c.yFields ?? []).join(", ") || "choose what to plot"}` : "Point the widget at a list of items with numbers"; }
  else if (c.display === "history") s = `${fmt(v, c)}${c.unit ? " " + c.unit : ""}, drawn over time as it refreshes`;
  else if (c.display === "list" || c.display === "ticker") { const a = Array.isArray(v) ? v : [v]; s = `${a.length} items · first: ${c.item ? tmpl(c.item, a[0]) : JSON.stringify(a[0])}`; }
  else s = `${c.prefix || ""}${fmt(v, c)}${c.unit ? " " + c.unit : ""}`;
  $("#ex_preview").textContent = s.length > 160 ? s.slice(0, 160) + "…" : s;
}
$("#edForm").addEventListener("submit", e => {
  e.preventDefault();
  const data = readForm();
  Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
  if (combo) {
    const r = comboResult(); if (r.error) { toast(r.error); return; }
    if (!data.value) { F("value").focus(); return; }
  } else if (!data.url) { F("url").focus(); return; }
  cfgUrls(data).forEach(u => allowHost(host(u)));
  if (editing) {
    const w = editing; const keep = { id: w.id, x: w.x, y: w.y, w: w.w, h: w.h };
    Object.keys(w).forEach(k => delete w[k]); Object.assign(w, data, keep);
    const r = rt.get(w.id); Object.assign(r, { cfg: cfgOf(w), history: [], value: undefined, data: undefined, error: null, updated: 0 });
    itemEl(w.id).querySelector(".grid-stack-item-content").innerHTML = cardHTML(r.cfg);
    paint(w.id); schedule(w.id); load(w.id); save(); toast("Saved");
  } else {
    const [dw, dh] = DEFAULT_SIZE[data.display] || [2, 1];
    addWidget({ ...data, id: uid(), w: dw, h: dh }); toast("Widget added");
  }
  $("#editor").close();
});
$("#openCustom").addEventListener("click", () => openEditor());
$("#bankCustom").addEventListener("click", () => openEditor());
