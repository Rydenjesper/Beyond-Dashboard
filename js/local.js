"use strict";
/* Local widgets: to-do, note, pomodoro, clock. No API. Their content lives in beyond.local.v1 per widget id,
   outside the board, so share links carry the widget but never what's in it. */
const LOCAL_KEY = "beyond.local.v1";
let localData = store.get(LOCAL_KEY, {});
const previewData = {};   // the configurator's preview never touches saved content
function localCtx(id) {
  const box = id === "preview" ? previewData : localData;
  return {
    get: d => box[id] ?? d,
    set: v => { box[id] = v; if (box === localData) store.set(LOCAL_KEY, localData); },
  };
}
function copyLocal(from, to) { if (localData[from] !== undefined) { localData[to] = clone(localData[from]); store.set(LOCAL_KEY, localData); } }
/* Drop content whose widget no longer exists on any board (kept until the next start so Undo works). */
function pruneLocal(allBoards) {
  const ids = new Set(allBoards.flatMap(b => b.widgets.map(w => w.id)));
  const before = Object.keys(localData).length;
  Object.keys(localData).forEach(id => { if (!ids.has(id)) delete localData[id]; });
  if (Object.keys(localData).length !== before) store.set(LOCAL_KEY, localData);
}
function mountLocal(body, c, id) {
  const kind = LOCAL[c.local];
  if (!kind) { body.innerHTML = `<div class="state"><strong>Unknown widget</strong></div>`; return; }
  body.innerHTML = ""; kind(body, c, localCtx(id), id === "preview");
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };

/* Tiny Markdown: # headings, **bold**, *italic*, `code`, - lists. Escaped first, so no HTML gets through. */
function miniMarkdown(src) {
  const inline = s => s.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>");
  const out = []; let list = false;
  esc(src).split("\n").forEach(line => {
    const li = line.match(/^\s*[-*]\s+(.*)$/), h = line.match(/^(#{1,3})\s+(.*)$/);
    if (li) { if (!list) { out.push("<ul>"); list = true; } out.push(`<li>${inline(li[1])}</li>`); return; }
    if (list) { out.push("</ul>"); list = false; }
    if (h) out.push(`<p class="md-h${h[1].length}">${inline(h[2])}</p>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    else out.push(`<p class="md-gap"></p>`);
  });
  if (list) out.push("</ul>");
  return out.join("");
}

let audio;   // created on the first Start click: browsers only allow sound after a gesture
function chime() {
  if (!audio) return;
  [0, .28, .56].forEach(t => {
    const o = audio.createOscillator(), g = audio.createGain(), at = audio.currentTime + t;
    o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
    g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(.25, at + .02); g.gain.exponentialRampToValueAtTime(.0001, at + .22);
    o.start(at); o.stop(at + .25);
  });
}

/* One player for the whole page: starting a channel stops the one before. */
const player = new Audio();
player.preload = "none";
const syncRadios = () => $$("#grid .radio, #cfgPreview .radio").forEach(r => r._sync?.());
["play", "playing", "pause", "waiting", "error", "emptied"].forEach(t => player.addEventListener(t, syncRadios));
player.addEventListener("error", () => { if (player.dataset.ch) toast("The radio stream didn't start. Try again in a moment."); });

/* Countdown target: "2026-07-01", or "12-24" for the next one every year. */
function nextDate(s, now = new Date()) {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})-(\d{1,2})$/.exec(s); if (!m) return null;
  const d = new Date(now.getFullYear(), +m[1] - 1, +m[2]);
  return d < new Date(now.getFullYear(), now.getMonth(), now.getDate()) ? new Date(now.getFullYear() + 1, +m[1] - 1, +m[2]) : d;
}
/* Moon: age in days since a known new moon, over the mean synodic month. Good to a few hours. */
const SYNODIC = 29.530588853, NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
function moonPhase(t = Date.now()) {
  const age = (((t - NEW_MOON) / 86400e3) % SYNODIC + SYNODIC) % SYNODIC, f = age / SYNODIC;
  const lit = (1 - Math.cos(2 * Math.PI * f)) / 2;
  const name = age < 1.0 || age > SYNODIC - 1.0 ? "New moon" : Math.abs(age - SYNODIC / 2) < 1.0 ? "Full moon" : Math.abs(age - SYNODIC / 4) < 1.0 ? "First quarter" : Math.abs(age - 3 * SYNODIC / 4) < 1.0 ? "Last quarter"
    : f < .25 ? "Waxing crescent" : f < .5 ? "Waxing gibbous" : f < .75 ? "Waning gibbous" : "Waning crescent";
  const toFull = ((SYNODIC / 2 - age) % SYNODIC + SYNODIC) % SYNODIC;
  return { age, f, lit, name, nextFull: new Date(t + toFull * 86400e3) };
}
function periodProgress(of, now = new Date()) {
  const y = now.getFullYear(), mo = now.getMonth();
  const [a, b] = of === "day" ? [new Date(y, mo, now.getDate()), new Date(y, mo, now.getDate() + 1)]
    : of === "week" ? (() => { const s = new Date(y, mo, now.getDate() - (now.getDay() + 6) % 7); return [s, new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7)]; })()
    : of === "month" ? [new Date(y, mo, 1), new Date(y, mo + 1, 1)] : [new Date(y, 0, 1), new Date(y + 1, 0, 1)];
  return (now - a) / (b - a) * 100;
}

const LOCAL = {
  countdown(body, c) {
    body.innerHTML = `<div class="cdown" data-tick><span class="cdown-n"></span><span class="cdown-l"></span></div>`;
    const root = body.firstElementChild;
    root._tick = () => {
      const d = nextDate(c.date);
      if (!d) { root.querySelector(".cdown-n").textContent = "—"; root.querySelector(".cdown-l").textContent = "Set a date like 2026-07-01 or 12-24"; return; }
      const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), days = Math.round((d - today) / 86400e3);
      const hrs = Math.max(0, Math.ceil((d - now) / 3600e3));
      const [n, l] = days === 0 ? ["Today", `It's ${c.name}!`] : days < 0 ? [`${-days} day${days === -1 ? "" : "s"}`, `since ${c.name}`] : days === 1 ? [`${hrs} hours`, `until ${c.name}`] : [`${days} days`, `until ${c.name}`];
      root.querySelector(".cdown-n").textContent = n; root.querySelector(".cdown-l").textContent = l;
    };
    root._tick();
  },
  moon(body) {
    body.innerHTML = `<div class="moon" data-tick><svg viewBox="-50 -50 100 100" aria-hidden="true"><circle class="moon-dark" r="46"/><path class="moon-lit"/></svg><div><b class="moon-name"></b><span class="moon-sub"></span></div></div>`;
    const root = body.firstElementChild;
    root._tick = () => {
      const m = moonPhase(), r = 46, waxing = m.f < .5, k = Math.cos(2 * Math.PI * m.f) * r;   // terminator ellipse x-radius
      /* lit half on the right while waxing (northern hemisphere), then the terminator bulges in or out */
      const outer = `M0,${-r} A${r},${r} 0 0 ${waxing ? 1 : 0} 0,${r}`, inner = `A${Math.abs(k)},${r} 0 0 ${(waxing ? k > 0 : k < 0) ? 0 : 1} 0,${-r}`;
      root.querySelector(".moon-lit").setAttribute("d", `${outer} ${inner} Z`);
      root.querySelector(".moon-name").textContent = m.name;
      root.querySelector(".moon-sub").textContent = `${Math.round(m.lit * 100)}% lit · full ${m.name === "Full moon" ? "now" : fmt(m.nextFull.toISOString(), { format: "date" })}`;
    };
    root._tick();
  },
  progress(body, c) {
    const draw = () => { body.innerHTML = DISPLAYS.gauge({ name: c.name, unit: "%", min: 0, max: 100, decimals: c.of === "day" ? 0 : 1 }, periodProgress(c.of)); body.firstElementChild.dataset.tick = ""; body.firstElementChild._tick = tick; };
    let last = ""; const tick = () => { const v = periodProgress(c.of).toFixed(c.of === "day" ? 0 : 1); if (v !== last) { last = v; draw(); } };
    tick();
  },

  radio(body, c) {
    body.innerHTML = `<div class="radio" data-tick><img class="radio-img" alt="" referrerpolicy="no-referrer" hidden>
      <div class="radio-info"><b class="radio-name">${esc(c.name)}</b><span class="radio-song">Loading…</span></div>
      <button type="button" class="radio-play" aria-label="Play ${esc(c.name)}"><svg viewBox="0 0 24 24"><path class="i-play" d="M8 5v14l11-7z"/><path class="i-pause" d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg></button></div>`;
    const root = body.firstElementChild, btn = root.querySelector(".radio-play");
    let ch = null, polled = 0;
    root._sync = () => {
      const mine = player.dataset.ch === c.channel, on = mine && !player.paused;
      root.classList.toggle("on", on); root.classList.toggle("wait", mine && on && player.readyState < 3);
      btn.setAttribute("aria-label", `${on ? "Pause" : "Play"} ${c.name}`);
    };
    const poll = async () => {
      polled = Date.now();
      try {
        const d = await fetchShared({ url: `https://api.sr.se/api/v2/playlists/rightnow?channelid=${encodeURIComponent(c.channel)}&format=json` }, 25000);
        const s = d.playlist?.song;
        root.querySelector(".radio-song").textContent = s ? `${s.artist ? s.artist + " – " : ""}${s.title}` : "Live";
      } catch { root.querySelector(".radio-song").textContent = "Live"; }
    };
    root._tick = () => { if (Date.now() - polled > 30000) poll(); };
    SR_CHANNELS().then(list => {
      ch = list.find(x => x.value === c.channel);
      if (!ch) { root.querySelector(".radio-song").textContent = "This channel no longer exists"; btn.disabled = true; return; }
      const img = root.querySelector(".radio-img"); if (/^https:/.test(ch.image || "")) { img.src = ch.image; img.hidden = false; }
    }).catch(() => {});
    btn.addEventListener("click", () => {
      if (player.dataset.ch === c.channel && !player.paused) { player.pause(); return; }
      const stream = ch?.stream || `https://www.sverigesradio.se/topsy/direkt/srapi/${encodeURIComponent(c.channel)}.mp3`;
      if (player.dataset.ch !== c.channel) { player.src = stream; player.dataset.ch = c.channel; }
      player.play().catch(() => {});
      if ("mediaSession" in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: c.name, artist: "Sveriges Radio", artwork: ch?.image ? [{ src: ch.image, sizes: "512x512" }] : [] });
      root._sync();
    });
    root._sync(); poll();
  },

  todo(body, c, ctx) {
    const data = () => ctx.get({ items: [] });
    const draw = () => {
      const items = data().items, left = items.filter(i => !i.done).length;
      root.querySelector(".todo-list").innerHTML = items.map(i => `<li data-id="${esc(i.id)}" class="${i.done ? "done" : ""}">
          <span class="grip" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
          <label><input type="checkbox"${i.done ? " checked" : ""}><span>${esc(i.text)}</span></label>
          <button type="button" class="del" aria-label="Delete ${esc(i.text)}">×</button></li>`).join("") || `<li class="todo-empty">Nothing to do. Nice.</li>`;
      root.querySelector(".todo-left").textContent = items.length ? `${left} left` : "";
      root.querySelector(".todo-clear").hidden = !items.some(i => i.done);
    };
    const update = fn => { const d = clone(data()); fn(d); ctx.set(d); draw(); };
    body.innerHTML = `<div class="todo"><form class="todo-add"><input class="input" placeholder="Add a task" maxlength="200" aria-label="New task"><button class="btn icon-btn" aria-label="Add task">+</button></form>
      <ul class="todo-list"></ul><div class="todo-foot"><span class="todo-left"></span><button type="button" class="linkish todo-clear" hidden>Clear done</button></div></div>`;
    const root = body.firstElementChild;
    root.querySelector("form").addEventListener("submit", e => {
      e.preventDefault(); const inp = e.target.querySelector("input"), text = inp.value.trim(); if (!text) return;
      update(d => d.items.push({ id: uid(), text, done: false })); inp.value = ""; inp.focus();
    });
    root.addEventListener("change", e => { const id = e.target.closest("[data-id]")?.dataset.id; if (id) update(d => { const it = d.items.find(i => i.id === id); if (it) it.done = e.target.checked; }); });
    root.addEventListener("click", e => {
      if (e.target.closest(".todo-clear")) update(d => { d.items = d.items.filter(i => !i.done); });
      const del = e.target.closest(".del"); if (del) { const id = del.closest("[data-id]").dataset.id; update(d => { d.items = d.items.filter(i => i.id !== id); }); }
    });
    /* Reorder with the grip: pointer events, so it works with mouse and touch alike. */
    root.addEventListener("pointerdown", e => {
      const grip = e.target.closest(".grip"); if (!grip) return;
      e.preventDefault(); const li = grip.closest("li"), list = li.parentElement; li.classList.add("dragging");
      try { grip.setPointerCapture(e.pointerId); } catch {}
      const move = ev => {
        const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".todo-list > li[data-id]");
        if (!over || over === li || over.parentElement !== list) return;
        const r = over.getBoundingClientRect(); list.insertBefore(li, ev.clientY < r.top + r.height / 2 ? over : over.nextSibling);
      };
      const up = ev => {
        if (ev.type === "pointerup") move(ev);   // some devices send no move before the release
        removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
        li.classList.remove("dragging");
        const order = [...list.querySelectorAll("li[data-id]")].map(x => x.dataset.id);
        update(d => d.items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)));
      };
      addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
    });
    draw();
  },

  note(body, c, ctx) {
    const show = () => {
      const t = ctx.get({ text: "" }).text;
      body.innerHTML = `<div class="note-view" tabindex="0" role="button" aria-label="Edit note">${t.trim() ? miniMarkdown(t) : `<p class="muted">Click to write. # heading, **bold**, - list</p>`}</div>`;
      const v = body.firstElementChild;
      v.addEventListener("click", edit); v.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); edit(); } });
    };
    const edit = () => {
      body.innerHTML = `<textarea class="note-edit" aria-label="Note" maxlength="20000"></textarea>`;
      const ta = body.firstElementChild; ta.value = ctx.get({ text: "" }).text; ta.focus();
      ta.addEventListener("input", debounce(() => ctx.set({ text: ta.value }), 400));
      ta.addEventListener("blur", () => { ctx.set({ text: ta.value }); show(); });
      ta.addEventListener("keydown", e => { if (e.key === "Escape") ta.blur(); });
    };
    show();
  },

  pomodoro(body, c, ctx) {
    const dur = ph => (ph === "work" ? c.work : c.brk) * 60000;
    const data = () => { const d = ctx.get({ phase: "work", endsAt: null, left: null, day: today(), done: 0 }); if (d.day !== today()) { d.day = today(); d.done = 0; } return d; };
    body.innerHTML = `<div class="pomo" data-tick><span class="pomo-phase"></span><span class="pomo-time"></span>
      <div class="pomo-btns"><button type="button" class="btn primary pomo-go"></button><button type="button" class="btn pomo-reset">Reset</button></div><span class="pomo-done"></span></div>`;
    const root = body.firstElementChild;
    const tick = () => {
      let d = data();
      if (d.endsAt && Date.now() >= d.endsAt) {   // a phase ran out: chime, count it, start the next one
        if (d.phase === "work") d.done++;
        d.phase = d.phase === "work" ? "break" : "work"; d.endsAt = Date.now() + dur(d.phase); d.left = null;
        ctx.set(d); chime(); toast(d.phase === "break" ? "Focus done. Take a break." : "Break over. Back to it.");
      }
      const left = d.endsAt ? d.endsAt - Date.now() : d.left ?? dur(d.phase);
      root.querySelector(".pomo-phase").textContent = d.phase === "work" ? "Focus" : "Break";
      root.querySelector(".pomo-time").textContent = mmss(left);
      root.querySelector(".pomo-go").textContent = d.endsAt ? "Pause" : d.left ? "Resume" : "Start";
      root.querySelector(".pomo-done").textContent = d.done ? `${d.done} session${d.done === 1 ? "" : "s"} today` : "No sessions yet today";
      root.classList.toggle("running", !!d.endsAt); root.classList.toggle("brk", d.phase === "break");
      root.dataset.title = d.endsAt ? `${mmss(left)} · ${d.phase === "work" ? "Focus" : "Break"}` : "";
    };
    root._tick = tick;
    root.querySelector(".pomo-go").addEventListener("click", () => {
      try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch {}
      const d = data();
      if (d.endsAt) { d.left = d.endsAt - Date.now(); d.endsAt = null; } else { d.endsAt = Date.now() + (d.left ?? dur(d.phase)); d.left = null; }
      ctx.set(d); tick();
    });
    root.querySelector(".pomo-reset").addEventListener("click", () => { const d = data(); Object.assign(d, { phase: "work", endsAt: null, left: null }); ctx.set(d); tick(); });
    tick();
  },

  clock(body, c) {
    const zones = c.zones.map(z => { try { new Intl.DateTimeFormat("en", { timeZone: z }); return { z, ok: true }; } catch { return { z, ok: false }; } });
    const city = z => z.split("/").pop().replace(/_/g, " ");
    body.innerHTML = `<div class="clock" data-tick><div class="clock-main"><span class="clock-time"></span><span class="clock-date"></span></div>
      <ul class="clock-zones">${zones.map(({ z, ok }) => `<li><span>${esc(city(z))}</span><b>${ok ? "" : "unknown zone"}</b></li>`).join("")}</ul></div>`;
    const root = body.firstElementChild, opts = { hour: "2-digit", minute: "2-digit", hour12: c.h12 };
    const dayOf = (d, tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    root._tick = () => {
      const now = new Date(), here = dayOf(now);
      root.querySelector(".clock-time").textContent = now.toLocaleTimeString(LOCALE, opts);
      root.querySelector(".clock-date").textContent = now.toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" });
      root.querySelectorAll(".clock-zones li").forEach((li, i) => {
        const { z, ok } = zones[i]; if (!ok) return;
        const there = dayOf(now, z), diff = there > here ? " +1" : there < here ? " −1" : "";
        li.querySelector("b").textContent = now.toLocaleTimeString(LOCALE, { ...opts, timeZone: z }) + diff;
      });
    };
    root._tick();
  },
};

/* One clock for every clock and pomodoro on screen. The first running pomodoro shows its time in the tab title. */
const BASE_TITLE = document.title;
const LOCAL_TICK = setInterval(() => {
  let title = "";
  $$("#grid [data-tick], #cfgPreview [data-tick]").forEach(el => { el._tick?.(); if (!title && el.dataset.title && el.closest("#grid")) title = el.dataset.title; });
  document.title = title ? `${title} · Beyond` : BASE_TITLE;
}, 1000);
