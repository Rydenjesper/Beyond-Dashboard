"use strict";
/* Wall display: full screen, no chrome, locked layout, optional board rotation and a night theme
   that follows the sun at home. ?kiosk=1&board=<id>&rotate=<minutes> starts straight into it. */
const KIOSK_KEY = "beyond.kiosk";
let kiosk = null;   // { rotate, dark, timers }
const kioskOpts = () => ({ rotate: 0, dark: true, ...store.get(KIOSK_KEY, {}) });
const ROTATE = [0, 1, 5, 10, 30];

function kioskLink() {
  const o = kioskOpts(), u = new URL(location.href.split("#")[0]);
  u.search = ""; u.searchParams.set("kiosk", "1"); u.searchParams.set("board", boards.active);
  if (o.rotate) u.searchParams.set("rotate", o.rotate);
  if (!o.dark) u.searchParams.set("dark", "0");
  return u.toString();
}
function paintKioskDialog() {
  const o = kioskOpts();
  $("#kRotate").innerHTML = ROTATE.map(m => `<button type="button" class="chip" data-m="${m}" aria-pressed="${o.rotate === m}">${m ? `${m} min` : "Never"}</button>`).join("");
  $("#kDark").checked = o.dark; $("#kLink").value = kioskLink();
}
function nightTheme() {
  const home = homeOf();
  if (!home) return;
  document.documentElement.dataset.theme = isNight(+home.lat, +home.lon) ? "dark" : "light";
}
function enterKiosk(o = kioskOpts()) {
  if (previewing) leavePreview();
  kiosk = { ...o, timers: [] };
  document.body.classList.add("kiosk"); grid.setStatic(true);
  $$("dialog[open]").forEach(d => d.close());
  if (document.fullscreenEnabled && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  if (o.dark) { nightTheme(); kiosk.timers.push(setInterval(nightTheme, 60e3)); }
  if (o.rotate && boards.boards.length > 1) kiosk.timers.push(setInterval(() => {
    const i = boards.boards.findIndex(b => b.id === boards.active);
    switchBoard(boards.boards[(i + 1) % boards.boards.length].id);
  }, o.rotate * 60e3));
  wakeLock();
}
function exitKiosk() {
  if (!kiosk) return;
  kiosk.timers.forEach(clearInterval); kiosk = null;
  document.body.classList.remove("kiosk"); grid.setStatic(false); $("#kExit").hidden = true;
  const t = store.get("beyond.theme", null); if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  if (new URLSearchParams(location.search).has("kiosk")) history.replaceState(null, "", location.pathname);
  wakeSentinel?.release?.().catch?.(() => {}); wakeSentinel = null;
}
/* Keep a wall screen from going to sleep, where the browser allows it. */
let wakeSentinel = null;
async function wakeLock() { try { wakeSentinel = await navigator.wakeLock?.request("screen"); } catch {} }
document.addEventListener("visibilitychange", () => { if (kiosk && !document.hidden) wakeLock(); });

$("#openKiosk").addEventListener("click", () => { paintKioskDialog(); $("#kiosk").showModal(); });
$("#kRotate").addEventListener("click", e => { const b = e.target.closest("[data-m]"); if (!b) return; store.set(KIOSK_KEY, { ...kioskOpts(), rotate: +b.dataset.m }); paintKioskDialog(); });
$("#kDark").addEventListener("change", e => { store.set(KIOSK_KEY, { ...kioskOpts(), dark: e.target.checked }); paintKioskDialog(); });
$("#kCopy").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("#kLink").value); toast("Link copied"); } catch { $("#kLink").select(); } });
$("#kStart").addEventListener("click", () => enterKiosk());
$("#kExit").addEventListener("click", exitKiosk);
document.addEventListener("keydown", e => { if (kiosk && e.key === "Escape") exitKiosk(); });
document.addEventListener("fullscreenchange", () => { if (kiosk && !document.fullscreenElement && document.fullscreenEnabled) exitKiosk(); });
/* The exit button shows for a few seconds after any touch or mouse movement. */
let exitT;
["pointermove", "pointerdown"].forEach(t => document.addEventListener(t, () => {
  if (!kiosk) return; $("#kExit").hidden = false; clearTimeout(exitT); exitT = setTimeout(() => { $("#kExit").hidden = true; }, 3000);
}, { passive: true }));

/* Called from boot: ?kiosk=1&board=<id>&rotate=<min>&dark=0 */
function kioskFromUrl() {
  const q = new URLSearchParams(location.search); if (q.get("kiosk") !== "1") return false;
  const b = q.get("board"); if (b && boards.boards.some(x => x.id === b)) switchBoard(b);
  const rotate = ROTATE.includes(+q.get("rotate")) ? +q.get("rotate") : 0;
  enterKiosk({ rotate, dark: q.get("dark") !== "0" });
  return true;
}
