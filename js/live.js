"use strict";
/* Live link to Claude: Claude's MCP server (mcp/live.js) runs on this computer. The user pairs once with a code,
   then commands arrive over Server-Sent Events and answers go back with POST. Every command is validated here with
   the same rules as a share link, applied at once and undoable. Claude sees layout and settings, never API keys
   or the content of to-do lists and notes. */
const LIVE_URL = "http://127.0.0.1:47331", LIVE_TOKEN = "beyond.live.token";
let liveES = null;
const liveToken = () => { try { return sessionStorage.getItem(LIVE_TOKEN); } catch { return null; } };

function liveUI() {
  const on = !!liveES && liveES.readyState === 1;
  $("#openLive").classList.toggle("live-on", on);
  $("#liveLbl").textContent = on ? "Claude connected" : "Claude";
  $("#livePair").hidden = on; $("#liveOn").hidden = !on;
}
async function livePair(code) {
  $("#liveMsg").textContent = "Connecting…"; $("#liveMsg").className = "note";
  try {
    const res = await fetch(`${LIVE_URL}/pair`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "That didn't work.");
    try { sessionStorage.setItem(LIVE_TOKEN, body.token); } catch {}
    liveOpen(body.token);
  } catch (e) {
    $("#liveMsg").className = "note warn";
    $("#liveMsg").textContent = e instanceof TypeError ? "Can't reach Claude on this computer. Ask Claude to connect to the dashboard first (it starts the link and shows the code)." : e.message;
  }
}
function liveOpen(token) {
  liveES?.close();
  let fails = 0;
  liveES = new EventSource(`${LIVE_URL}/events?token=${encodeURIComponent(token)}`);
  liveES.onopen = () => { if (!fails) toast("Claude is connected to this dashboard"); fails = 0; liveUI(); $("#liveMsg").textContent = ""; };
  liveES.onerror = () => {   // Claude's session ended (or the link was refused): stop knocking after a few tries
    if (liveES?.readyState === 2 || ++fails >= 3) { liveES?.close(); liveES = null; try { sessionStorage.removeItem(LIVE_TOKEN); } catch {} }
    liveUI();
  };
  liveES.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } liveRun(m, token); };
}
function liveClose() { liveES?.close(); liveES = null; try { sessionStorage.removeItem(LIVE_TOKEN); } catch {} liveUI(); toast("Disconnected from Claude"); }

async function liveRun({ id, op, args }, token) {
  let reply;
  try { reply = { id, ok: true, result: await LIVE_OPS[op]?.(args || {}) ?? (() => { throw new Error(`Unknown command ${op}`); })() }; }
  catch (e) { reply = { id, ok: false, error: e.message }; }
  fetch(`${LIVE_URL}/reply?token=${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reply) }).catch(() => {});
}

/* What Claude may see of a board: layout and settings. No keys (secret params are never in params), no personal content. */
function liveBoard(b) {
  return { id: b.id, title: b.title, active: b.id === boards.active && !previewing, home: b.home?.name,
    widgets: b.widgets.map(w => { const c = cfgOf(w); return { id: w.id, name: c.name, display: c.display, x: w.x, y: w.y, w: w.w, h: w.h,
      ...(w.mod ? { module: w.mod, params: w.params, ...(c.local ? { personal: true } : {}) } : w.bp ? { blueprint: w.bp } : { custom: cfgUrls(c).map(host) }) }; }) };
}
function liveFind(ref) {
  if (previewing) throw new Error("The user is looking at a shared link right now. Ask them to close it (Back to my dashboard) first.");
  const b = ref == null || ref === "" ? boards.boards.find(x => x.id === boards.active)
    : boards.boards.find(x => x.id === ref) || boards.boards.find(x => x.title.toLowerCase() === String(ref).toLowerCase());
  if (!b) throw new Error(`No board “${ref}”. Boards: ${boards.boards.map(x => `“${x.title}”`).join(", ")}.`);
  return b;
}
/* Same validation as a share link: unknown modules, bad params, keys and unknown fields are dropped, ids are new. */
const liveClean = ws => hydrate(shareable({ title: "", widgets: ws }, MOD).payload, MOD, BANK_BY_ID).widgets;
function liveRefresh(b) { if (b === state) renderAll(); else { store.set(BOARDS, boards); renderTabs(); } }
/* Every change keeps a copy of the board before it, so one Undo puts everything back. */
function liveChange(b, message, fn) {
  const before = { title: b.title, widgets: clone(b.widgets) };
  const result = fn();
  liveRefresh(b);
  toast(`Claude: ${message}`, () => { b.title = before.title; b.widgets = before.widgets; if (b === state) $("#title").textContent = b.title; liveRefresh(b); });
  return result;
}

const LIVE_OPS = {
  state: () => ({ previewing, boards: boards.boards.map(liveBoard) }),
  add({ board, widgets }) {
    const b = liveFind(board), ws = liveClean(widgets || []);
    if (!ws.length) throw new Error("None of those widgets were valid.");
    if (b.widgets.length + ws.length > 100) throw new Error("That board would get more than 100 widgets.");
    liveChange(b, `added ${ws.length} widget${ws.length === 1 ? "" : "s"}${b === state ? "" : ` to “${b.title}”`}`, () => { b.widgets.push(...ws); });
    return { board: liveBoard(b), added: ws.map(w => w.id) };
  },
  update({ board, widget, changes = {} }) {
    const b = liveFind(board), w = b.widgets.find(x => x.id === widget);
    if (!w) throw new Error(`No widget “${widget}” on “${b.title}”.`);
    liveChange(b, `changed ${cfgOf(w).name}`, () => {
      if (w.mod && (changes.params || changes.display)) {
        const merged = { ...w.params, ...(changes.params || {}), ...(changes.display ? { display: changes.display } : {}) };
        w.params = sanitizeParams(MOD[w.mod], merged);
      } else if (!w.mod && !w.bp && changes.display && DISPLAY_NAMES[changes.display]) w.display = changes.display;
      if (typeof changes.title === "string") { if (changes.title.trim()) w.title = changes.title.trim().slice(0, 120); else delete w.title; if (!w.mod && !w.bp) w.name = w.title || w.name; }
      const int = (v, a, z) => Number.isInteger(v) ? Math.min(z, Math.max(a, v)) : undefined;
      [["w", 1, 6], ["h", 1, 4], ["x", 0, 5], ["y", 0, 200]].forEach(([k, a, z]) => { const v = int(changes[k], a, z); if (v !== undefined) w[k] = v; });
      const r = rt.get(w.id); if (r) Object.assign(r, { updated: 0, value: undefined, data: undefined, error: null });   // fetch again with the new settings
    });
    return { board: liveBoard(b) };
  },
  remove({ board, widgets = [] }) {
    const b = liveFind(board), ids = new Set(widgets), n = b.widgets.filter(w => ids.has(w.id)).length;
    if (!n) throw new Error("None of those widget ids are on that board.");
    liveChange(b, `removed ${n} widget${n === 1 ? "" : "s"}`, () => { b.widgets = b.widgets.filter(w => !ids.has(w.id)); });
    return { board: liveBoard(b) };
  },
  create({ title, widgets }) {
    if (previewing) leavePreview();
    const b = { title: String(title || "From Claude").slice(0, 80), widgets: liveClean(widgets || []), allowed: [] };
    addBoard(b);
    toast(`Claude: created “${b.title}”`, () => { const i = boards.boards.indexOf(b); if (i >= 0 && boards.boards.length > 1) { boards.boards.splice(i, 1); switchBoard(boards.boards[Math.max(0, i - 1)].id); } });
    return { board: liveBoard(b) };
  },
  rename({ board, title }) {
    const b = liveFind(board), t = String(title || "").trim().slice(0, 80);
    if (!t) throw new Error("A board needs a name.");
    liveChange(b, `renamed “${b.title}” to “${t}”`, () => { b.title = t; if (b === state) $("#title").textContent = t; });
    return { board: liveBoard(b) };
  },
  show({ board }) { const b = liveFind(board); switchBoard(b.id); return { board: liveBoard(b) }; },
};

$("#openLive").addEventListener("click", () => { liveUI(); $("#live").showModal(); if (!liveES) setTimeout(() => $("#liveCode").focus(), 50); });
$("#livePair").addEventListener("submit", e => { e.preventDefault(); livePair($("#liveCode").value); });
$("#liveOff").addEventListener("click", () => { liveClose(); $("#live").close(); });
/* A reload in the same tab reconnects by itself while Claude's session is still running. */
if (liveToken()) liveOpen(liveToken());
liveUI();
