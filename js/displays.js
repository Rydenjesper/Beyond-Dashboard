"use strict";
/* Display types: config + value → HTML. Pure (no DOM at load), so the tests can run every one in Node. */
function sparkline(hist) {
  if (!hist || hist.length < 3) return "";
  const min = Math.min(...hist), max = Math.max(...hist), span = max - min || 1;
  const d = hist.map((v, i) => (i ? "L" : "M") + ((i / (hist.length - 1)) * 100).toFixed(2) + " " + (30 - ((v - min) / span) * 26 - 2).toFixed(2)).join(" ");
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="${d} L100 30 L0 30 Z"/><path class="line" d="${d}"/></svg>`;
}
const DISPLAYS = {
  stat(c, v, r, cols) {
    const s = fmt(v, c);
    return `<div class="stat"><div class="stat-row"><span class="num${s.length > 9 ? " small" : ""}">${esc(c.prefix || "")}${esc(s)}</span>${c.unit ? `<span class="unit">${esc(c.unit)}</span>` : ""}</div></div>${cols >= 2 ? sparkline(r.history) : ""}`;
  },
  gauge(c, v) {
    const min = c.min != null && c.min !== "" ? +c.min : 0, max = c.max != null && c.max !== "" ? +c.max : 100, n = Number(v);
    const ratio = isNaN(n) || v == null ? 0 : clamp((n - min) / (max - min || 1), 0, 1);
    const R = 40, C = 2 * Math.PI * R, arc = C * 0.75, filled = arc * ratio;
    const ticks = [0, .25, .5, .75, 1].map(t => { const a = (135 + 270 * t) * Math.PI / 180; return `<line class="g-tick" x1="${50 + 46 * Math.cos(a)}" y1="${50 + 46 * Math.sin(a)}" x2="${50 + 49 * Math.cos(a)}" y2="${50 + 49 * Math.sin(a)}"/>`; }).join("");
    return `<div class="gauge"><svg viewBox="0 0 100 92" role="img" aria-label="${esc(c.name)}: ${esc(fmt(v, c))} ${esc(c.unit || "")}">
      <g transform="rotate(135 50 50)">
        <circle class="g-track" cx="50" cy="50" r="${R}" stroke-width="7" stroke-dasharray="${arc} ${C}"/>
        ${filled > 0.5 ? `<circle class="g-fill" cx="50" cy="50" r="${R}" stroke-width="7" stroke-dasharray="${filled} ${C}"/>` : ""}
      </g>${ticks}
      <text class="g-val" x="50" y="53" text-anchor="middle" font-size="19">${esc(c.prefix || "")}${esc(fmt(v, c))}</text>
      <text class="g-unit" x="50" y="66" text-anchor="middle" font-size="7">${esc(c.unit || "")}</text>
      <text class="g-lim" x="24" y="88" text-anchor="middle" font-size="6.5">${esc(fmt(min, { decimals: c.decimals }))}</text>
      <text class="g-lim" x="76" y="88" text-anchor="middle" font-size="6.5">${esc(fmt(max, { decimals: c.decimals }))}</text>
    </svg></div>`;
  },
  text(c, v) {
    const s = c.format ? fmt(v, c) : (v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
    return `<blockquote class="txt${s.length > 130 ? " long" : ""}"><p>${esc(s)}</p></blockquote>`;
  },
  list(c, v) {
    const arr = Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : [v];
    const items = arr.slice(0, 25).map((it, i) => `<li><b>${pad(i + 1)}</b><span>${esc(c.item ? tmpl(c.item, it) : typeof it === "object" ? JSON.stringify(it) : it)}</span></li>`).join("");
    return `<ul class="list">${items || "<li>Nothing here right now.</li>"}</ul>`;
  },
  ticker(c, v) {
    const arr = (Array.isArray(v) ? v : [v]).slice(0, 20).map(it => c.item ? tmpl(c.item, it) : typeof it === "object" ? JSON.stringify(it) : String(it));
    const spans = arr.map(s => `<span>${esc(s)}</span>`).join("");
    return `<div class="ticker"><div class="ticker-track" style="--dur:${Math.max(30, arr.join("").length / 7)}s">${spans}${spans}</div></div>`;
  },
  image(c, v, r) {
    if (!v || typeof v !== "string") return `<div class="state">This value isn't an image URL.</div>`;
    if (!/^https:\/\//i.test(v)) return `<div class="state">Only https images are shown.</div>`;
    const cap = c.caption ? pick(r.data, c.caption) : "";
    return `<figure class="img"><img src="${esc(v)}" referrerpolicy="no-referrer" alt="${esc(cap || c.name)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'state',textContent:'No image this round. A new one comes with the next refresh.'}))">${cap ? `<figcaption>${esc(String(unescapeHTML(cap)).replace(/^File:/, "").replace(/\.(jpe?g|png|gif|webp|svg|tiff?)$/i, ""))}</figcaption>` : ""}</figure>`;
  },
  beacon(c, v) {
    const list = x => (Array.isArray(x) ? x : String(x || "").split(",")).map(s => String(s).trim().toLowerCase()).filter(Boolean);
    const val = String(v).toLowerCase(), ok = list(c.ok), warn = list(c.warn);
    const level = ok.length ? (ok.includes(val) ? "ok" : warn.includes(val) ? "warn" : "bad") : (v && v !== "false" && v !== "0" ? "ok" : "bad");
    const word = c.ok && c.ok[0] === "daylight" ? (level === "ok" ? "In sunlight" : "In shadow") : c.ok && c.ok[0] === 1 ? (level === "ok" ? "Daytime" : "Night") : { ok: "All good", warn: "Degraded", bad: "Problem" }[level];
    return `<div class="beacon"><span class="b-dot ${level}" aria-hidden="true"></span><div class="b-label"><strong>${word}</strong><span>${esc(fmt(v, c))}</span></div></div>`;
  },
  json(c, v) { return `<pre class="json">${highlight(v)}</pre>`; },
};
function highlight(v) {
  const s = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  return esc(s).replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi,
    (m, str, colon, lit, num) => str ? `<span class="${colon ? "k" : "s"}">${str}</span>${colon || ""}` : lit ? `<span class="l">${lit}</span>` : `<span class="n">${num}</span>`);
}
const ticks = c => c.format === "countdown" || /\|countdown|\[now\]/.test(`${c.path} ${c.item || ""}`);
