"use strict";
/* Welcome flow and tour. */
/* ═══ Welcome: home + interests → a personal board ════════ */
const INTERESTS = [
  { id: "weather", label: "Weather", hint: "Temperature, conditions, UV and daylight at home", cat: "weather" },
  { id: "sweden", label: "Sweden", hint: "Electricity prices, police events, holidays and live radio", cat: "sweden" },
  { id: "space", label: "Space", hint: "Launch countdowns, the ISS, auroras", cat: "space" },
  { id: "money", label: "Money", hint: "Crypto, exchange rates, market mood", cat: "money" },
  { id: "dev", label: "Dev", hint: "Status pages, Hacker News, GitHub", cat: "dev" },
  { id: "sport", label: "Sport", hint: "F1 standings, chess ratings, Bundesliga", cat: "sport" },
  { id: "earth", label: "Planet Earth", hint: "Earthquakes, volcanoes, air quality", cat: "earth" },
  { id: "knowledge", label: "Curiosity", hint: "On this day, Wikipedia, trending books", cat: "knowledge" },
  { id: "fun", label: "Fun", hint: "Cat facts, dad jokes, trivia", cat: "fun" },
  { id: "images", label: "Pictures", hint: "Dogs, foxes, fine art, Pokémon", cat: "images" },
  { id: "productivity", label: "Productivity", hint: "To-do list, clock, pomodoro timer, notes", cat: "personal" },
  { id: "absurd", label: "The absurd", hint: "South Pole weather, waves at Point Nemo", cat: "weather" },
];
const inSweden = p => p && (p.country_code ? p.country_code === "SE" : p.lat > 55 && p.lat < 69.2 && p.lon > 10.9 && p.lon < 24.2);
const elZone = lat => lat >= 65.5 ? "SE1" : lat >= 61.5 ? "SE2" : lat >= 56.9 ? "SE3" : "SE4";
/* Each interest is a ranked list of widgets. B = ready-made, W = module with params. */
function recipes(home) {
  const place = home ? { name: home.name, lat: home.lat, lon: home.lon } : { ...P0 };
  const se = inSweden(home);
  const B = (id, w, h) => ({ bp: id, w, h }), W = (mod, params, w, h) => ({ mod, params, w, h });
  return {
    weather: [W("weather", { metric: "temperature_2m", place }, 2, 1), W("weather", { metric: "weather_code", place }, 2, 1), W("weather", { metric: "uv_index", place }, 2, 2), W("sun", { metric: "day_length", place }, 2, 1), W("air", { metric: "european_aqi", place }, 2, 2), W("forecast", { place }, 4, 2)],
    sweden: [W("elpris", { zone: se ? elZone(home.lat) : "SE3", vat: "ex" }, 2, 2), W("polisen", { place: se ? home.name : "Stockholm" }, 2, 2), W("holidays", { country: "SE", show: "next" }, 2, 1), W("radio", { channel: { value: "132", label: "P1" } }, 2, 1), W("el_cheap", { zone: se ? elZone(home.lat) : "SE3" }, 2, 1), W("smhi_warn", {}, 2, 1)],
    space: [B("bp_next_launch", 2, 1), W("aurora", { place }, 2, 1), B("bp_iss_velocity", 2, 1), B("bp_kp_index", 2, 2), B("bp_people_in_space", 2, 1), B("bp_space_news", 2, 2)],
    money: [B("bp_btc", 2, 1), W("metal", { cur: se ? "SEK" : "USD" }, 2, 1), W("fx", se ? { from: "EUR", to: "SEK" } : { from: "EUR", to: "USD" }, 2, 1), B("bp_fear_greed", 2, 2), B("bp_trending_coins", 2, 2)],
    dev: [B("bp_github_status", 2, 1), B("bp_claude_status", 2, 1), B("bp_hn_front", 2, 2), B("bp_gh_firehose", 6, 1)],
    sport: [B("bp_f1_drivers", 2, 2), B("bp_magnus_blitz", 2, 1), B("bp_bundesliga", 2, 2)],
    earth: [B("bp_quakes_big", 2, 2), B("bp_quakes_count", 2, 1), B("bp_volcanoes", 2, 2), B("bp_uk_carbon", 2, 2)],
    knowledge: [B("bp_on_this_day", 2, 2), B("bp_useless_fact", 3, 1), B("bp_trending_books", 2, 2), W("holidays", { country: home?.country_code || "SE", show: "next" }, 2, 1)],
    fun: [B("bp_cat_fact", 3, 1), B("bp_dad_joke", 3, 1), B("bp_trivia", 3, 1), B("bp_kanye", 3, 1)],
    images: [B("bp_dog", 2, 2), B("bp_art", 2, 2), B("bp_pokemon", 2, 2), B("bp_fox", 2, 2)],
    productivity: [W("todo", { title: "To do" }, 2, 2), W("clock", {}, 2, 2), W("pomodoro", {}, 2, 2), W("note", { title: "Note" }, 2, 2)],
    absurd: [B("bp_sahara_uv", 2, 2), B("bp_southpole_temp", 2, 1), B("bp_point_nemo_waves", 2, 2), B("bp_is_odd", 2, 1)],
  };
}
const P0 = (window.PLACES || [])[0] || { name: "Stockholm", lat: 59.33, lon: 18.07 };
function buildBoard(home, picks) {
  const R = recipes(home), lists = picks.map(id => R[id] || []), out = [], seen = new Set(), MAX = 16;
  for (let round = 0; out.length < MAX && lists.some(l => l[round]); round++)   // round-robin so every interest gets a seat
    for (const l of lists) { const s = l[round]; if (!s || out.length >= MAX) continue; const key = s.bp || s.mod + JSON.stringify(s.params); if (seen.has(key)) continue; seen.add(key); out.push(s); }
  out.sort((a, b) => (a.w === 6) - (b.w === 6));   // full-width tickers go to the bottom
  return out.map(s => s.bp ? (BANK_BY_ID[s.bp] ? fromBlueprint(BANK_BY_ID[s.bp], s.w, s.h) : null) : { id: uid(), mod: s.mod, params: s.params, w: s.w, h: s.h }).filter(Boolean);
}

let wlHome = null, wlPicks = new Set(), wlMode = "replace";   // replace this board | new board | home of this board
const WL_TITLE = $("#wlTitle1").textContent;
function openWelcome(mode = "replace") {
  wlMode = mode;
  wlHome = mode === "new" ? store.get("beyond.home", null) : homeOf();
  $("#wlTitle1").textContent = mode === "home" ? `Home for “${state.title}”` : mode === "new" ? "Where is this board for?" : WL_TITLE;
  $("#wlSkipHome").textContent = mode === "home" ? "Use my default home" : "Skip, I'm not telling";
  wlPicks = new Set(store.get("beyond.interests", []));
  $("#wlGeo").innerHTML = `${ICON.locate}<span class="lbl">Me</span>`;
  $("#wlPlace").value = ""; $("#wlResults").hidden = true;
  showWlStep(1); paintHome(); paintInterests();
  $("#welcome").showModal();
  setTimeout(() => $("#wlPlace").focus(), 50);
}
function showWlStep(n) { $("#wlStep1").hidden = n !== 1; $("#wlStep2").hidden = n !== 2; }
function paintHome() {
  $("#wlPicked").innerHTML = wlHome ? `${ICON.pin}<b>${esc(wlHome.name)}</b><span class="muted">${esc(wlHome.region || "")}</span>` : `<span class="muted">Used for weather, daylight and, in Sweden, your electricity zone and local police news.</span>`;
  $("#wlNext").textContent = wlMode === "home" ? "Save home" : wlHome ? "Next" : "Next without a home";
}
function paintInterests() {
  if (inSweden(wlHome) && !store.get("beyond.interests", null) && !wlPicks.size) wlPicks.add("sweden");
  $("#wlInterests").innerHTML = INTERESTS.map(i => `<button type="button" class="interest" data-i="${i.id}" aria-pressed="${wlPicks.has(i.id)}" style="--c:${CATS[i.cat]}"><b><i></i>${esc(i.label)}</b><span>${esc(i.hint)}</span></button>`).join("");
  const n = wlPicks.size ? buildBoard(wlHome, [...wlPicks]).length : 0;
  $("#wlBuild").disabled = !n;
  $("#wlBuild").textContent = n ? `Build my board (${n} widgets)` : "Pick at least one";
}
const wlSearch = debounce(async q => {
  const box = $("#wlResults");
  if (q.trim().length < 2) { box.hidden = true; return; }
  try {
    const d = await fetchData({ url: `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=6&language=en` });
    const res = d.results || [];
    box.innerHTML = res.length ? res.map(r => `<button type="button" data-home="${esc(JSON.stringify({ name: r.name, lat: r.latitude, lon: r.longitude, country_code: r.country_code, region: [r.admin1, r.country].filter(Boolean).join(", ") }))}">${esc(r.name)} <small>${esc([r.admin1, r.country].filter(Boolean).join(", "))}</small></button>`).join("")
      : `<button type="button" disabled>No places called “${esc(q)}”</button>`;
    box.hidden = false;
  } catch { box.innerHTML = `<button type="button" disabled>Search is unavailable right now. You can skip this step.</button>`; box.hidden = false; }
}, 300);
$("#wlPlace").addEventListener("input", e => wlSearch(e.target.value));
$("#wlResults").addEventListener("click", e => { const b = e.target.closest("[data-home]"); if (!b) return; wlHome = JSON.parse(b.dataset.home); $("#wlResults").hidden = true; $("#wlPlace").value = ""; paintHome(); });
$("#wlGeo").addEventListener("click", async () => {
  const b = $("#wlGeo"); b.disabled = true;
  try {
    const pos = await new Promise((ok, no) => navigator.geolocation.getCurrentPosition(ok, no, { timeout: 8000 }));
    wlHome = { name: "My location", lat: +pos.coords.latitude.toFixed(3), lon: +pos.coords.longitude.toFixed(3) }; paintHome();
  } catch { toast("Location isn't available here. Search for your city instead."); }
  b.disabled = false;
});
function saveBoardHome(home) { state.home = home || undefined; save(); $("#welcome").close(); renderBoardList(); toast(home ? `New widgets on “${state.title}” start in ${home.name}` : "This board uses your default home"); }
$("#wlSkipHome").addEventListener("click", () => { if (wlMode === "home") return saveBoardHome(null); wlHome = null; paintInterests(); showWlStep(2); });
$("#wlNext").addEventListener("click", () => { if (wlMode === "home") return saveBoardHome(wlHome); paintInterests(); showWlStep(2); });
$("#wlBack").addEventListener("click", () => showWlStep(1));
$("#wlInterests").addEventListener("click", e => {
  const b = e.target.closest("[data-i]"); if (!b) return;
  wlPicks.has(b.dataset.i) ? wlPicks.delete(b.dataset.i) : wlPicks.add(b.dataset.i);
  paintInterests();
});
function finishWelcome(widgets) {
  if (wlMode === "new") {
    if (!store.get("beyond.home", null)) store.set("beyond.home", wlHome);
    store.set("beyond.onboarded", true); $("#welcome").close();
    return addBoard({ title: wlHome ? `${wlHome.name} board` : "New board", widgets, allowed: [], ...(wlHome ? { home: wlHome } : {}) });
  }
  const prev = savedOnce() ? clone(state) : null;   // only offer undo when replacing a board the user already had
  store.set("beyond.home", wlHome); store.set("beyond.interests", [...wlPicks]); store.set("beyond.onboarded", true);
  previewing = false; $("#sharedBanner").hidden = true;
  state = { title: state.title && state.title !== "Control Room" ? state.title : (wlHome ? `${wlHome.name} control room` : "Control Room"), widgets, allowed: [], ...(state.home ? { home: state.home } : {}) };
  renderAll(); $("#welcome").close();
  if (prev && prev.widgets.length) toast("Built a new board", () => { state = prev; renderAll(); });
  if (!store.get("beyond.toured", false) && widgets.length) setTimeout(startTour, 700);
}
const savedOnce = () => store.get("beyond.onboarded", false) || !!savedState;
$("#wlBuild").addEventListener("click", () => finishWelcome(buildBoard(wlHome, [...wlPicks])));
$("#wlEmpty").addEventListener("click", () => finishWelcome([]));

/* ═══ Tour: five coach marks over the real UI ═════════════ */
const TOUR = [
  { sel: () => tourWidget()?.querySelector(".w-h"), title: "Drag to rearrange", text: "Grab any widget by its title bar and move it. The others slide out of the way." },
  { sel: () => tourWidget()?.querySelector(".ui-resizable-se"), title: "Resize from the corner", text: "Drag the bottom-right corner to make a widget wider or taller. Numbers and gauges scale with it." },
  { sel: () => tourWidget()?.querySelector('[data-a="edit"]'), title: "Change what it shows", text: "The pencil opens the widget's settings. A weather widget can show any metric for any place on Earth." },
  { sel: () => $("#openBank"), title: "Add more widgets", text: `${MODULES.length} configurable modules and ${BANK.length} ready-made widgets. Or connect any API yourself with Custom API.` },
  { sel: () => $("#openShare"), title: "Share your board", text: "Your whole layout fits in one link. No account needed, and API keys are never included." },
];
let tourI = 0;
function tourWidget() {
  const items = $$(".grid-stack-item", grid.el); if (!items.length) return null;
  return items.reduce((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return rb.top + rb.left < ra.top + ra.left ? b : a; });
}
function startTour() { tourI = 0; $("#tour").hidden = false; document.body.classList.add("touring"); tourWidget()?.classList.add("tour-target"); showTourStep(); }
function endTour() { $("#tour").hidden = true; document.body.classList.remove("touring"); $$(".tour-target").forEach(x => x.classList.remove("tour-target")); store.set("beyond.toured", true); }
function showTourStep() {
  const s = TOUR[tourI], el = s.sel();
  if (!el) { tourI < TOUR.length - 1 ? (tourI++, showTourStep()) : endTour(); return; }
  el.scrollIntoView({ block: "nearest" });
  const r = el.getBoundingClientRect(), pad = 6, spot = $("#tourSpot"), card = $("#tourCard");
  Object.assign(spot.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
  $("#tourStep").textContent = `Tip ${tourI + 1} of ${TOUR.length}`;
  $("#tourTitle").textContent = s.title; $("#tourText").textContent = s.text;
  $("#tourNext").textContent = tourI === TOUR.length - 1 ? "Got it" : "Next";
  const cw = card.offsetWidth, ch = card.offsetHeight, vw = innerWidth, vh = innerHeight;
  let top = r.bottom + 16, left = r.left;
  if (top + ch > vh - 12) top = r.top - ch - 16;            // flip above if no room below
  if (top < 12) top = Math.min(vh - ch - 12, r.bottom + 16);
  left = clamp(left, 16, vw - cw - 16);
  Object.assign(card.style, { top: top + "px", left: left + "px" });
  $("#tourNext").focus();
}
$("#tourNext").addEventListener("click", () => { if (++tourI >= TOUR.length) endTour(); else showTourStep(); });
$("#tourSkip").addEventListener("click", endTour);
document.addEventListener("keydown", e => { if (!$("#tour").hidden && e.key === "Escape") endTour(); });
addEventListener("resize", () => { if (!$("#tour").hidden) showTourStep(); });
$("#help").addEventListener("click", () => { if (state.widgets.length) startTour(); else openWelcome(); });
