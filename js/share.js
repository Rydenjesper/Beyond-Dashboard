"use strict";
/* Share links. */
/* ═══ Sharing: the layout lives in the link, no server ════ */
const shareBoard = () => shareable(state, MOD);
const hydrateShared = p => hydrate(p, MOD, BANK_BY_ID);
const baseUrl = () => location.href.split("#")[0];
$("#openShare").addEventListener("click", async () => {
  const { payload, stripped } = shareBoard();
  const code = await encode(payload);
  $("#shareOut").value = `${baseUrl()}#d=${code}`;
  $("#shareNote").className = "note" + (stripped ? " warn" : "");
  $("#shareNote").textContent = `${payload.ws.length} widgets, ${code.length} characters. ` + (stripped ? `Removed ${stripped} API key${stripped > 1 ? "s" : ""} or auth header${stripped > 1 ? "s" : ""}: whoever opens the link adds their own.` : "Nothing secret is included.");
  $("#importIn").value = "";
  $("#share").showModal();
});
$("#copyShare").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("#shareOut").value); toast("Link copied"); }
  catch { $("#shareOut").select(); toast("Selected. Press Ctrl/Cmd+C to copy"); }
});
$("#doImport").addEventListener("click", async () => {
  try { const p = await decode($("#importIn").value); $("#share").close(); enterPreview(hydrateShared(p)); }
  catch { toast("That doesn't look like a Beyond share link"); }
});
let mine = null;
function enterPreview(shared) {
  if (!previewing) mine = state;
  previewing = true; state = shared;
  $("#sharedText").textContent = `You're looking at a shared dashboard: “${shared.title}” with ${shared.widgets.length} widgets. Nothing is saved until you choose.`;
  $("#sharedBanner").hidden = false; renderAll();
  const unknown = widgetHosts(shared.widgets);
  if (unknown.length) { $("#trList").innerHTML = unknown.map(h => `<li>${esc(h)}</li>`).join(""); $("#trust").showModal(); }
}
$("#trAll").addEventListener("click", () => { widgetHosts(state.widgets).forEach(allowHost); $("#trust").close(); state.widgets.forEach(w => { paint(w.id); load(w.id); }); });
$("#trCatalog").addEventListener("click", () => $("#trust").close());
$("#trCancel").addEventListener("click", () => { $("#trust").close(); $("#dropShared").click(); });
function leavePreview() { previewing = false; mine = null; $("#sharedBanner").hidden = true; history.replaceState(null, "", baseUrl()); }
$("#keepShared").addEventListener("click", () => { state.id = uid(); leavePreview(); boards.active = state.id; save(); renderTabs(); toast(`Added “${state.title}” as a new board`); });
$("#dropShared").addEventListener("click", () => { leavePreview(); state = boards.boards.find(b => b.id === boards.active) || boards.boards[0]; renderAll(); });

/* Backup: every beyond.* key in localStorage as one JSON file. API keys only when asked for. */
const BACKUP_APP = "beyond-dashboard", BACKUP_MAX = 5e6;
function backupData(withKeys) {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (/^beyond\./.test(k) && !/^beyond\.cache\./.test(k) && (withKeys || k !== KEYS)) data[k] = store.get(k, null);
  }
  return { app: BACKUP_APP, version: 1, exported: new Date().toISOString(), data };
}
function checkBackup(b) {
  if (!b || b.app !== BACKUP_APP || typeof b.data !== "object" || !b.data) throw new Error("This isn't a Beyond backup file.");
  const keys = Object.keys(b.data);
  if (!keys.length || keys.some(k => !/^beyond\.[\w.]+$/.test(k))) throw new Error("This backup file is damaged.");
  if (!migrateBoards(b.data[BOARDS], b.data[KEY]) && (BOARDS in b.data || KEY in b.data)) throw new Error("This backup file is damaged.");
  return b;
}
$("#bkSave").addEventListener("click", () => {
  const b = backupData($("#bkKeys").checked), d = new Date();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: "application/json" }));
  a.download = `beyond-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast($("#bkKeys").checked ? "Backup saved, including API keys. Keep the file private." : "Backup saved");
});
let pendingBackup = null;
$("#bkOpen").addEventListener("click", () => $("#bkFile").click());
$("#bkFile").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    if (f.size > BACKUP_MAX) throw new Error("That file is too large to be a Beyond backup.");
    pendingBackup = checkBackup(JSON.parse(await f.text()));
  } catch (err) { pendingBackup = null; toast(err instanceof SyntaxError ? "This isn't a Beyond backup file." : err.message); return; }
  const bs = migrateBoards(pendingBackup.data[BOARDS], pendingBackup.data[KEY])?.boards || [], when = Date.parse(pendingBackup.exported);
  const what = bs.length === 1 ? `“${bs[0].title}” with ${bs[0].widgets.length} widgets` : `${bs.length} boards with ${bs.reduce((n, b) => n + b.widgets.length, 0)} widgets`;
  $("#bkText").textContent = `Restore ${what}${isNaN(when) ? "" : `, saved ${new Date(when).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" })}`}? This replaces everything in this browser${KEYS in pendingBackup.data ? ", including your API keys" : ". Your API keys stay as they are"}.`;
  $("#bkConfirm").hidden = false;
});
$("#bkCancel").addEventListener("click", () => { pendingBackup = null; $("#bkConfirm").hidden = true; });
$("#bkRestore").addEventListener("click", () => {
  if (!pendingBackup) return;
  const d = pendingBackup.data;
  for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (/^beyond\./.test(k) && (k !== KEYS || KEYS in d)) localStorage.removeItem(k); }
  Object.entries(d).forEach(([k, v]) => store.set(k, v));
  history.replaceState(null, "", baseUrl());   // reload without any #d= share link
  location.reload();
});
$("#share").addEventListener("close", () => { pendingBackup = null; $("#bkConfirm").hidden = true; });
