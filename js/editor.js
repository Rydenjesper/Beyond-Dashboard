"use strict";
/* Custom API editor. */
/* ═══ Custom API editor ═══════════════════════════════════ */
let editing = null, exData;
const F = id => $("#e_" + id);
function openEditor(w) {
  editing = w || null;
  const v = w ? cfgOf(w) : { display: "stat", refresh: 300, min: 0, max: 100 };
  ["url", "name", "path", "item", "prefix", "unit", "min", "max", "decimals", "refresh"].forEach(k => F(k).value = v[k] ?? "");
  F("display").value = v.display || "stat"; F("format").value = v.format || "";
  F("ok").value = [].concat(v.ok ?? []).join(", "); F("warn").value = [].concat(v.warn ?? []).join(", ");
  F("headers").value = Object.entries(v.headers || {}).map(([k, x]) => `${k}: ${x}`).join("\n");
  $("#edTitle").textContent = w ? `Edit ${v.name}` : "Connect an API";
  F("name").dataset.auto = w ? "0" : "1";
  $("#e_save").textContent = w ? "Save changes" : "Add to dashboard";
  exData = undefined; $("#ex_status").textContent = "";
  $("#e_pathSel").innerHTML = `<option value="">Press Fetch to see every field in the response</option>`; $("#e_pathSel").disabled = true;
  $("#e_adv").open = isTemplate(v.path); $("#e_itemFields").innerHTML = "";
  $("#ex_tree").innerHTML = `<div class="ex-empty">Press <b>Fetch</b> to load the response. Click any value to point the widget at it.${w ? "" : `<br><br>No idea where to start? Try <code>https://api.wheretheiss.at/v1/satellites/25544</code>`}</div>`;
  toggleFields(); updatePreview();
  if ($("#bank").open) $("#bank").close();
  $("#editor").showModal();
  if (w) testFetch();
}
function toggleFields() { const d = F("display").value; $$("#edForm [data-for]").forEach(f => f.hidden = !f.dataset.for.split(" ").includes(d)); }
F("display").addEventListener("change", () => { toggleFields(); updatePreview(); });
["path", "item", "prefix", "unit", "decimals"].forEach(k => F(k).addEventListener("input", updatePreview));
F("format").addEventListener("change", updatePreview);
function parseHeaders(t) { const h = {}; t.split("\n").forEach(l => { const i = l.indexOf(":"); if (i > 0) h[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }); return h; }
function readForm() {
  const num = k => F(k).value === "" ? undefined : +F(k).value;
  const list = k => F(k).value.split(",").map(s => s.trim()).filter(Boolean);
  return {
    name: F("name").value.trim() || host(F("url").value) || "Custom widget", url: F("url").value.trim(), path: F("path").value.trim(),
    display: F("display").value, item: F("item").value.trim() || undefined, prefix: F("prefix").value || undefined, unit: F("unit").value || undefined,
    min: num("min"), max: num("max"), decimals: num("decimals"), format: F("format").value || undefined, refresh: Math.max(10, num("refresh") || 300),
    ok: list("ok"), warn: list("warn"), headers: parseHeaders(F("headers").value), category: "custom",
  };
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
  if (Array.isArray(v) && !["list", "ticker", "json"].includes(F("display").value)) F("display").value = "list";
  else if (typeof v === "number" && !["stat", "gauge"].includes(F("display").value)) F("display").value = "stat";
  else if (typeof v === "string" && /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(v)) F("display").value = "image";
  else if (typeof v === "string" && ["stat", "gauge"].includes(F("display").value) && isNaN(Number(v))) F("display").value = "text";
  if (Array.isArray(v) && !F("item").value) {   // sensible default line for list items
    const f = v[0] && typeof v[0] === "object" ? collectPaths(v[0]).find(x => /title|name|text|headline|label/i.test(x.p) && !x.label.endsWith("items]")) : null;
    if (f) F("item").value = `{${f.p}}`;
  }
  if ($("#e_pathSel").value !== p) $("#e_pathSel").value = p;
  toggleFields(); markTreeRow(); renderItemFields(); updatePreview();
}
$("#ex_tree").addEventListener("click", e => { const row = e.target.closest(".row"); if (row) choosePath(row.dataset.p); });
$("#e_pathSel").addEventListener("change", e => choosePath(e.target.value));
F("path").addEventListener("input", () => {
  if (exData === undefined) return;
  const p = F("path").value.trim(), sel = $("#e_pathSel");
  if ([...sel.options].some(o => o.value === p && !o.textContent.startsWith("Custom"))) sel.value = p; else renderPathOptions();
  markTreeRow(); renderItemFields();
});
function updatePreview() {
  if (exData === undefined) { $("#ex_preview").textContent = "—"; return; }
  const c = readForm(), v = resolve(c, exData);
  let s;
  if (c.display === "list" || c.display === "ticker") { const a = Array.isArray(v) ? v : [v]; s = `${a.length} items · first: ${c.item ? tmpl(c.item, a[0]) : JSON.stringify(a[0])}`; }
  else s = `${c.prefix || ""}${fmt(v, c)}${c.unit ? " " + c.unit : ""}`;
  $("#ex_preview").textContent = s.length > 160 ? s.slice(0, 160) + "…" : s;
}
$("#edForm").addEventListener("submit", e => {
  e.preventDefault();
  const data = readForm(); if (!data.url) { F("url").focus(); return; }
  allowHost(host(data.url));
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
