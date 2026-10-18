"use strict";
/* Title, theme, boot. Loads last. */
/* ═══ Title, theme, boot ══════════════════════════════════ */
$("#title").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } });
$("#title").addEventListener("blur", e => { state.title = e.target.textContent.trim() || "Control Room"; e.target.textContent = state.title; save(); renderTabs(); });
const savedTheme = store.get("beyond.theme", null); if (savedTheme) document.documentElement.dataset.theme = savedTheme;
$("#theme").addEventListener("click", () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark"; store.set("beyond.theme", root.dataset.theme);
});
$("#openBank").addEventListener("click", openBank);
$("#emptyAdd").addEventListener("click", openBank);
$$("[data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));
$$("dialog").forEach(d => d.addEventListener("click", e => { if (e.target === d) d.close(); }));
$("#config").addEventListener("close", () => cfgCtrl?.abort());
document.addEventListener("visibilitychange", () => { if (!document.hidden) rt.forEach((r, id) => { if (r.updated && Date.now() - r.updated > (r.cfg.refresh || 300) * 1000) load(id); }); });

pruneLocal(boards.boards); pruneHistory(boards.boards);
/* Installable app: the service worker runs on the https site. Locally it stays off (it would serve cached code while
   you edit) unless you ask for it with ?sw=1 to test offline mode. Never from file://. */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" && new URLSearchParams(location.search).has("sw"))) navigator.serviceWorker.register("sw.js").catch(() => {});
addEventListener("online", () => rt.forEach((r, id) => { if (r.stale || r.error) load(id); }));
addEventListener("offline", () => rt.forEach((r, id) => paint(id)));

(async function boot() {
  const m = location.hash.match(/#d=(.+)$/);
  if (m) { try { enterPreview(hydrateShared(await decode(m[1]))); return; } catch { toast("Couldn't open that share link"); } }
  renderAll();
  if (kioskFromUrl()) return;
  if (!savedState && !store.get("beyond.onboarded", false)) openWelcome();   // first visit: the starter board waits behind the welcome
})();
