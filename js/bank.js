"use strict";
/* Widget bank and module configurator. */
/* ═══ Widget bank ═════════════════════════════════════════ */
let bankCat = "all";
/* Last night's health check (status.json, written by CI). Missing on file:// or before the first run: then no warnings. */
let health = null;
const healthNote = id => { const r = health?.results?.[id]; return r && !r.ok ? `<span class="bp-warn" title="Didn't answer in the check on ${esc(fmt(health.checked, { format: "date" }))}. It may be down for now.">⚠ Not answering</span>` : ""; };
function loadHealth() { if (health !== null) return; health = {}; fetch("status.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : {}).then(d => { health = d || {}; if ($("#bank").open) renderBank(); }).catch(() => {}); }
function openBank() { loadHealth(); renderBank(); $("#bank").showModal(); $("#bankSearch").focus(); }
function renderBank() {
  const q = $("#bankSearch").value.trim().toLowerCase();
  const all = [...MODULES.map(m => ({ ...m, kind: "mod" })), ...BANK.map(b => ({ ...b, kind: "bp" }))];
  const catOf = x => x.category || (x.mod && MOD[x.mod]?.category) || "custom";
  const counts = all.reduce((a, x) => (a[catOf(x)] = (a[catOf(x)] || 0) + 1, a), {});
  $("#bankChips").innerHTML = [["all", all.length], ...Object.entries(counts)].map(([c, n]) =>
    `<button class="chip" data-cat="${c}" aria-pressed="${c === bankCat}">${c === "all" ? "All" : c[0].toUpperCase() + c.slice(1)}<em>${n}</em></button>`).join("");
  const match = x => (bankCat === "all" || catOf(x) === bankCat) && (!q || `${x.name} ${x.desc} ${catOf(x)} ${x.url || ""} ${x.mod || ""}`.toLowerCase().includes(q));
  const mods = all.filter(x => x.kind === "mod" && match(x)), bps = all.filter(x => x.kind === "bp" && match(x));
  $("#bankCount").textContent = `${MODULES.length} modules · ${BANK.length} ready-made`;
  const modCard = m => `<div class="bp mod">
      <div class="bp-top"><span class="bp-cat"><span class="cat" style="background:${CATS[m.category]}"></span>${esc(m.category)}</span><span class="bp-type">module</span></div>${healthNote(m.id)}
      <h4>${esc(m.name)}</h4><p>${esc(m.desc)}</p>
      <div class="bp-foot"><span class="bp-host">${m.params.map(p => esc(p.label.toLowerCase())).join(" · ")}</span><button class="add" data-mod="${m.id}">Set up</button></div></div>`;
  const bpCard = b => { const c = b.mod ? buildCfg(MOD[b.mod], b.params) : b; return `<div class="bp">
      <div class="bp-top"><span class="bp-cat"><span class="cat" style="background:${CATS[catOf(b)] || CATS.custom}"></span>${esc(catOf(b))}</span><span class="bp-type">${esc(DISPLAY_NAMES[c.display] || c.display)}</span></div>${healthNote(b.mod || b.id)}
      <h4>${esc(b.name)}</h4><p>${esc(b.desc)}</p>
      <div class="bp-foot"><span class="bp-host">${esc(host(c.url))}</span><button class="add" data-add="${b.id}">Add</button></div></div>`; };
  $("#bankBody").innerHTML =
    (mods.length ? `<div class="sec-h"><h3>Modules</h3><span>Choose what to show and where</span></div><div class="bank-grid">${mods.map(modCard).join("")}</div>` : "") +
    (bps.length ? `<div class="sec-h"><h3>Ready-made</h3><span>One click, already configured</span></div><div class="bank-grid">${bps.map(bpCard).join("")}</div>` : "") +
    (!mods.length && !bps.length ? `<p class="note">Nothing matches “${esc(q)}”. Connect it yourself with <b>Connect your own API</b>.</p>` : "");
}
$("#bankSearch").addEventListener("input", renderBank);
$("#bankChips").addEventListener("click", e => { const c = e.target.closest("[data-cat]"); if (c) { bankCat = c.dataset.cat; renderBank(); } });
$("#bankBody").addEventListener("click", e => {
  const m = e.target.closest("[data-mod]");
  if (m) { $("#bank").close(); openConfig(MOD[m.dataset.mod]); return; }
  const b = e.target.closest("[data-add]"); if (!b) return;
  addWidget(fromBlueprint(BANK_BY_ID[b.dataset.add]));
  b.textContent = "Added"; b.classList.add("done"); setTimeout(() => { b.textContent = "Add"; b.classList.remove("done"); }, 1400);
});
$("#resetLayout").addEventListener("click", () => { $("#bank").close(); openWelcome(); });

/* ═══ Module configurator ═════════════════════════════════ */
let cfgSecrets = {}, cfgMod = null, cfgParams = null, cfgEditing = null, cfgRT = null, cfgCtrl = null;
function openConfig(m, w) {
  cfgMod = m; cfgEditing = w || null;
  cfgParams = { ...modDefaults(m), ...clone(w ? w.params : {}) };
  cfgSecrets = Object.fromEntries(secretParams(m).map(x => [x.key, getSecret(m, x)]));
  const home = homeOf();   // new widgets start at this board's home
  if (!w && home) m.params.forEach(x => { if (x.type === "place") cfgParams[x.key] = { name: home.name, lat: home.lat, lon: home.lon }; });
  $("#cfgTitle").textContent = m.name; $("#cfgDesc").textContent = m.desc;
  $("#cfgSave").textContent = w ? "Save changes" : "Add to dashboard";
  renderConfigForm(); refreshPreview();
  $("#config").showModal();
}
function renderConfigForm() {
  const m = cfgMod, p = cfgParams, s = modSelected(m, p), ds = modDisplays(m, s);
  const html = m.params.map(x => {
    if (x.type === "choice") return `<div class="param"><span class="lbl">${esc(x.label)}</span><div class="chips">${x.options.map(o =>
      `<button type="button" class="chip" data-k="${x.key}" data-v="${esc(o.value)}" aria-pressed="${o.value === p[x.key]}">${esc(o.label)}</button>`).join("")}</div></div>`;
    if (x.type === "text") return `<div class="param"><label for="p_${x.key}">${esc(x.label)}</label><input class="input" style="width:100%" id="p_${x.key}" data-text="${x.key}" value="${esc(p[x.key])}" placeholder="${esc(x.placeholder || "")}" autocomplete="off" spellcheck="false"></div>`;
    if (x.type === "search") return `<div class="param"><label for="p_${x.key}">${esc(x.label)}</label>
      <div class="place-search"><input class="input" id="p_${x.key}" data-search="${x.key}" placeholder="${esc(x.placeholder || "Search…")}" autocomplete="off" spellcheck="false">
        <div class="place-results" id="res_${x.key}" hidden></div></div>
      <div class="place-now"><b>${esc(p[x.key]?.label || "")}</b></div></div>`;
    if (x.type === "secret") return `<div class="param"><label for="p_${x.key}">${esc(x.label)}${x.optional ? " (optional)" : ""}</label><input class="input" style="width:100%" type="password" id="p_${x.key}" data-secret="${x.key}" value="${esc(cfgSecrets[x.key])}" placeholder="${esc(x.placeholder || "")}" autocomplete="off" spellcheck="false">
      <small class="hint">Saved only in this browser and never included in share links.${x.help ? ` <a href="${esc(x.help)}" target="_blank" rel="noopener">Get a key</a>` : ""}</small></div>`;
    if (x.type === "place") return `<div class="param"><label for="p_place">${esc(x.label)}</label>
      <div class="place-search"><input class="input" id="p_place" data-place="${x.key}" placeholder="Search any city or place…" autocomplete="off">
        <button type="button" class="btn" data-geo="${x.key}" title="Use my location">${ICON.locate}<span class="lbl">Me</span></button>
        <div class="place-results" id="placeResults" hidden></div></div>
      <div class="place-now">${ICON.pin}<b>${esc(p[x.key].name)}</b><span>${(+p[x.key].lat).toFixed(2)}, ${(+p[x.key].lon).toFixed(2)}</span></div>
      <div class="chips place-presets">${PLACES.map((pl, i) => `<button type="button" class="chip" data-preset="${i}" data-k="${x.key}" aria-pressed="${pl.name === p[x.key].name}" title="${esc(pl.note || "")}">${esc(pl.name)}</button>`).join("")}</div></div>`;
    return "";
  }).join("") + (ds.length > 1 ? `<div class="param"><span class="lbl">Display as</span><div class="chips">${ds.map(d =>
    `<button type="button" class="chip" data-display="${d}" aria-pressed="${d === (ds.includes(p.display) ? p.display : ds[0])}">${DISPLAY_NAMES[d]}</button>`).join("")}</div></div>` : "");
  $("#cfgForm").innerHTML = html;
}
$("#cfgForm").addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.preset != null) { const { note, ...pl } = PLACES[+t.dataset.preset]; cfgParams[t.dataset.k] = pl; }
  else if (t.dataset.place) cfgParams[t.dataset.k] = JSON.parse(t.dataset.place);
  else if (t.dataset.display) cfgParams.display = t.dataset.display;
  else if (t.dataset.geo) {
    t.disabled = true;
    try {
      const pos = await new Promise((ok, no) => navigator.geolocation.getCurrentPosition(ok, no, { timeout: 8000 }));
      cfgParams[t.dataset.geo] = { name: "My location", lat: +pos.coords.latitude.toFixed(3), lon: +pos.coords.longitude.toFixed(3) };
    } catch { toast("Location isn't available here. Search for your city instead."); t.disabled = false; return; }
  }
  else if (t.dataset.k) cfgParams[t.dataset.k] = t.dataset.v;
  else return;
  renderConfigForm(); refreshPreview();
});
$("#cfgForm").addEventListener("input", e => {
  if (e.target.dataset.text) {
    const x = cfgMod.params.find(p => p.key === e.target.dataset.text);
    cfgParams[x.key] = x.upper ? e.target.value.trim().toUpperCase() : e.target.value.trim();
    refreshPreviewSoon();
  }
  if (e.target.dataset.secret) { cfgSecrets[e.target.dataset.secret] = e.target.value.trim(); refreshPreviewSoon(); }
  if (e.target.dataset.search) searchLookup(e.target.value, e.target.dataset.search);
  if (e.target.dataset.place) searchPlace(e.target.value, e.target.dataset.place);
});
const searchPlace = debounce(async (q, key) => {
  const box = $("#placeResults"); if (!box) return;
  if (q.trim().length < 2) { box.hidden = true; return; }
  try {
    const d = await fetchData({ url: `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=6&language=en` });
    const res = d.results || [];
    box.innerHTML = res.length ? res.map(r => `<button type="button" data-k="${key}" data-place="${esc(JSON.stringify({ name: r.name, lat: r.latitude, lon: r.longitude }))}">${esc(r.name)} <small>${esc([r.admin1, r.country].filter(Boolean).join(", "))}</small></button>`).join("")
      : `<button type="button" disabled>No places called “${esc(q)}”</button>`;
    box.hidden = false;
  } catch { box.innerHTML = `<button type="button" disabled>Place search is unavailable right now</button>`; box.hidden = false; }
}, 300);

const searchLookup = debounce(async (q, key) => {
  const box = $(`#res_${key}`), x = cfgMod.params.find(p => p.key === key); if (!box || !x) return;
  if (q.trim().length < 1) { box.hidden = true; return; }
  box.innerHTML = `<button type="button" disabled>Searching…</button>`; box.hidden = false;
  try {
    const res = await SEARCHERS[x.search](q);
    if ($("#p_" + key)?.value !== q) return;   // a newer search is on its way
    box.innerHTML = res.length ? res.map(r => `<button type="button" data-k="${key}" data-place="${esc(JSON.stringify({ value: r.value, label: r.label }))}">${esc(r.label)} <small>${esc(r.sub || "")}</small></button>`).join("")
      : `<button type="button" disabled>Nothing called “${esc(q)}”</button>`;
  } catch { box.innerHTML = `<button type="button" disabled>Search is unavailable right now</button>`; }
}, 200);

function refreshPreview() {
  const c = buildCfg(cfgMod, cfgParams, cfgSecrets);
  const [, h] = DEFAULT_SIZE[c.display] || [2, 1];
  const rows = Math.min(h, 2);
  $("#cfgPreview").innerHTML = cardHTML(c, false);
  $("#cfgPreview .w").style.setProperty("--ph", `${rows * 128 + (rows - 1) * 12}px`);
  $("#cfgMeta").textContent = maskSecrets(fillPlaceholders(c.url), c);
  const mine = cfgRT = { history: [], cfg: c, preview: true };
  if (c.local) { mountLocal($("#cfgPreview .w-b"), c, "preview"); $("#cfgPreview .age").textContent = ""; return; }
  $("#cfgPreview .w-b").innerHTML = render(c, mine, 3);
  cfgCtrl?.abort(); cfgCtrl = new AbortController();
  if (c.needsKey) return;
  fetchData(c, cfgCtrl.signal).then(d => { mine.data = d; mine.value = resolve(c, d); mine.updated = Date.now(); })
    .catch(e => { mine.error = e.name === "AbortError" ? null : errText(e); })
    .finally(() => { if (mine !== cfgRT) return; $("#cfgPreview .w-b").innerHTML = render(c, mine, 3); $("#cfgPreview .age").textContent = mine.error ? "error" : "just now"; });
}
const refreshPreviewSoon = debounce(refreshPreview, 450);
$("#cfgSave").addEventListener("click", () => {
  const params = clone(cfgParams);
  allowHost(host(buildCfg(cfgMod, params, cfgSecrets).url));
  secretParams(cfgMod).forEach(x => { setSecret(cfgMod, x, cfgSecrets[x.key]); delete params[x.key]; });
  if (secretParams(cfgMod).length) rt.forEach((r, id) => { const w = find(id); if (w?.mod === cfgMod.id && w !== cfgEditing) { r.cfg = cfgOf(w); paint(id); if (!r.updated) load(id); } });   // a new key wakes every widget of this module
  if (cfgEditing) {
    const w = cfgEditing; w.params = params; delete w.title;
    const r = rt.get(w.id);
    Object.assign(r, { cfg: cfgOf(w), history: [], value: undefined, data: undefined, error: null, updated: 0 });
    if (cfgRT && cfgRT.updated) Object.assign(r, { data: cfgRT.data, value: cfgRT.value, updated: cfgRT.updated });
    itemEl(w.id).querySelector(".grid-stack-item-content").innerHTML = cardHTML(r.cfg);
    paint(w.id); schedule(w.id); if (!r.updated) load(w.id); save(); toast("Saved");
  } else {
    const c = buildCfg(cfgMod, params), [dw, dh] = c.size || DEFAULT_SIZE[c.display] || [2, 1];
    addWidget({ id: uid(), mod: cfgMod.id, params, w: dw, h: dh });
    toast(`Added ${c.name}`);
  }
  $("#config").close();
});
