"use strict";
/* Several dashboards: tabs (desktop), the Boards dialog (everywhere), keys 1–9. */
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const BICON = { up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'), down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'), copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>') };
const activeBoard = () => boards.boards.find(b => b.id === boards.active);

function renderTabs() {
  const tabs = $("#tabs");
  tabs.hidden = previewing || boards.boards.length < 2;
  tabs.innerHTML = boards.boards.map((b, i) => `<button type="button" class="tab" data-board="${esc(b.id)}" aria-current="${!previewing && b.id === boards.active}"${i < 9 ? ` title="Press ${i + 1}"` : ""}>${esc(b.title || "Untitled")}</button>`).join("");
  $("#boardsLbl").textContent = boards.boards.length > 1 ? `Boards · ${boards.boards.length}` : "Boards";
}
function renderBoardList() {
  if (!$("#boards").open) return;
  const n = boards.boards.length, globalHome = store.get("beyond.home", null);
  $("#bdList").innerHTML = boards.boards.map((b, i) => {
    const home = b.home || globalHome;
    return `<li class="bd-row${b.id === boards.active && !previewing ? " on" : ""}" data-id="${esc(b.id)}">
      <button type="button" class="bd-go" data-act="go" aria-label="Open ${esc(b.title)}">${i < 9 ? i + 1 : "·"}</button>
      <div class="bd-main"><input class="input bd-name" data-act="name" value="${esc(b.title)}" aria-label="Board name" maxlength="80">
        <span class="bd-meta">${b.widgets.length} widget${b.widgets.length === 1 ? "" : "s"} · <button type="button" class="linkish" data-act="home">${ICON.pin}${home ? esc(home.name) : "No home"}${b.home ? "" : home ? " (default)" : ""}</button></span></div>
      <div class="bd-btns">
        <button type="button" class="btn icon-btn" data-act="up" aria-label="Move up" title="Move up"${i ? "" : " disabled"}>${BICON.up}</button>
        <button type="button" class="btn icon-btn" data-act="down" aria-label="Move down" title="Move down"${i < n - 1 ? "" : " disabled"}>${BICON.down}</button>
        <button type="button" class="btn icon-btn" data-act="dup" aria-label="Duplicate" title="Duplicate">${BICON.copy}</button>
        <button type="button" class="btn icon-btn" data-act="del" aria-label="Delete" title="Delete"${n > 1 ? "" : " disabled"}>${ICON.trash}</button>
      </div></li>`;
  }).join("");
}
function switchBoard(id) {
  const b = boards.boards.find(x => x.id === id); if (!b) return;
  if (previewing) leavePreview();
  else if (b === state) return;
  boards.active = id; state = b; renderAll(); renderBoardList();
}
function addBoard(b, at = boards.boards.length) {
  b.id = uid(); b.allowed ||= [];
  if (previewing) leavePreview();
  boards.boards.splice(at, 0, b); boards.active = b.id; state = b;
  renderAll(); renderBoardList();
  toast(`Created “${b.title}”`);
}
function duplicateBoard(id) {
  const i = boards.boards.findIndex(b => b.id === id), copy = clone(boards.boards[i]);
  copy.title = `${copy.title} copy`; copy.widgets.forEach(w => { const old = w.id; w.id = uid(); copyLocal(old, w.id); });
  addBoard(copy, i + 1);
}
function deleteBoard(id) {
  if (boards.boards.length < 2) return;
  const i = boards.boards.findIndex(b => b.id === id), [gone] = boards.boards.splice(i, 1), wasActive = boards.active === id;
  if (wasActive) { boards.active = boards.boards[Math.min(i, boards.boards.length - 1)].id; state = activeBoard(); renderAll(); }
  else { store.set(BOARDS, boards); renderTabs(); }
  renderBoardList();
  toast(`Deleted “${gone.title}”`, () => {
    boards.boards.splice(i, 0, gone);
    if (wasActive) { boards.active = gone.id; state = gone; renderAll(); } else { store.set(BOARDS, boards); renderTabs(); }
    renderBoardList();
  });
}
function moveBoard(id, d) {
  const i = boards.boards.findIndex(b => b.id === id), j = i + d;
  if (j < 0 || j >= boards.boards.length) return;
  [boards.boards[i], boards.boards[j]] = [boards.boards[j], boards.boards[i]];
  store.set(BOARDS, boards); renderTabs(); renderBoardList();
  $(`#bdList [data-id="${CSS.escape(id)}"] [data-act="${d < 0 ? "up" : "down"}"]`)?.focus();
}

$("#tabs").addEventListener("click", e => { const t = e.target.closest("[data-board]"); if (t) switchBoard(t.dataset.board); });
$("#openBoards").addEventListener("click", () => { $("#boards").showModal(); renderBoardList(); });
$("#bdList").addEventListener("click", e => {
  const b = e.target.closest("[data-act]"), id = e.target.closest("[data-id]")?.dataset.id; if (!b || !id) return;
  const a = b.dataset.act;
  if (a === "go") { switchBoard(id); $("#boards").close(); }
  if (a === "up" || a === "down") moveBoard(id, a === "up" ? -1 : 1);
  if (a === "dup") duplicateBoard(id);
  if (a === "del") deleteBoard(id);
  if (a === "home") { switchBoard(id); $("#boards").close(); openWelcome("home"); }
});
$("#bdList").addEventListener("change", e => {
  if (e.target.dataset.act !== "name") return;
  const b = boards.boards.find(x => x.id === e.target.closest("[data-id]").dataset.id);
  b.title = e.target.value.trim() || "Untitled"; e.target.value = b.title;
  if (b === state) $("#title").textContent = b.title;
  store.set(BOARDS, boards); renderTabs();
});
$("#bdList").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.dataset.act === "name") e.target.blur(); });
$("#bdNewEmpty").addEventListener("click", () => { $("#boards").close(); addBoard({ title: "New board", widgets: [] }); });
$("#bdNewWelcome").addEventListener("click", () => { $("#boards").close(); openWelcome("new"); });

/* 1–9 open a board, unless the user is typing or a dialog is open. */
document.addEventListener("keydown", e => {
  if (e.metaKey || e.ctrlKey || e.altKey || !/^[1-9]$/.test(e.key)) return;
  if (e.target.closest("input, textarea, select, [contenteditable='true']") || $("dialog[open]") || !$("#tour").hidden) return;
  const b = boards.boards[+e.key - 1]; if (b) { e.preventDefault(); switchBoard(b.id); }
});
