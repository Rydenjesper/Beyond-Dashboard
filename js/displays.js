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
  beacon(c, v, r) {
    if (r && r.level) {   // combined widgets decide the color with okIf / warnIf
      const word = (c.words || {})[r.level] || { ok: "All good", warn: "Maybe", bad: "No" }[r.level];
      return `<div class="beacon"><span class="b-dot ${r.level}" aria-hidden="true"></span><div class="b-label"><strong>${esc(word)}</strong><span>${esc(typeof v === "object" ? "" : fmt(v, c))}</span></div></div>`;
    }
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

/* ═══ Charts ═══════════════════════════════════════════════ */
/* chart: path → array of points. xField: field (time or label). yFields: field, or a list of fields / { y, label, unit, kind, panel }.
   (Not x/y: custom widgets keep their settings next to their grid position.)
   kind: line | area | bar (default c.chart). Series with different units go in separate panels stacked over one
   shared x axis (never two y scales in one panel). mark: "min" | "max" labels that point of the first series. */
const CHART_MAX = 400;
function niceTicks(lo, hi, n = 4) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, out = [];
  for (let v = a; v <= b + step / 2; v += step) out.push(+v.toFixed(10));
  return out;
}
const asTime = v => typeof v === "number" ? (v > 1e11 ? v : v > 1e9 ? v * 1000 : NaN) : typeof v === "string" && /^\d{4}-\d\d-\d\d/.test(v) ? Date.parse(v) : typeof v === "string" && /^\d{10}$/.test(v) ? Date.parse(`${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T${v.slice(8)}:00`) : NaN;
function xLabel(v, t, f) {
  if (isNaN(t)) return String(v ?? "");
  const d = new Date(t);
  if (f === "hour") return pad(d.getHours());
  if (f === "time") return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (f === "day") return d.toLocaleDateString([], { weekday: "short" });
  if (f === "month") return d.toLocaleDateString([], { month: "short", year: "2-digit" });
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}
const axisNum = v => Math.abs(v) >= 1000 ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(v) : String(+v.toFixed(2));
function chartSeries(c) {
  const ys = Array.isArray(c.yFields) ? c.yFields : c.yFields != null ? [c.yFields] : [];
  return ys.slice(0, 4).map((s, i) => typeof s === "string" ? { y: s, label: s, unit: c.unit || "", kind: c.chart || "line", panel: 0, i }
    : { label: s.label || s.y, unit: s.unit ?? c.unit ?? "", kind: s.kind || c.chart || "line", panel: s.panel || 0, ...s, i });
}
DISPLAYS.chart = function (c, v) {
  let pts = Array.isArray(v) ? v.slice(-CHART_MAX) : [];
  const series = chartSeries(c);
  if (!series.length) return `<div class="state">Pick which fields to plot.</div>`;
  const num = (p, s) => { const n = Number(pick(p, s.y)); return isNaN(n) || pick(p, s.y) == null || pick(p, s.y) === "" ? null : c.scale != null ? n * c.scale : n; };
  pts = pts.filter(p => p && typeof p === "object" && series.some(s => num(p, s) != null));
  if (c.xField != null && pts.every(p => !isNaN(asTime(pick(p, c.xField))))) pts.sort((a, b) => asTime(pick(a, c.xField)) - asTime(pick(b, c.xField)));   // APIs often list newest first
  if (pts.length < 2) return `<div class="state">Not enough data to draw a chart yet.</div>`;
  const N = pts.length, xs = pts.map((p, i) => c.xField != null ? pick(p, c.xField) : i), ts = xs.map(asTime), timed = c.xField != null && ts.every(t => !isNaN(t));
  const span = timed ? ts[N - 1] - ts[0] : 0, xf = c.xFormat || (timed ? (span <= 2 * 86400e3 ? "time" : span > 400 * 86400e3 ? "month" : "date") : "");
  const hasBar = series.some(s => s.kind === "bar");
  /* x position (0–100) of each point: time-scaled for lines, bands when there are bars */
  const fx = pts.map((_, i) => hasBar || !timed ? (hasBar ? (i + .5) / N : i / (N - 1)) * 100 : (ts[i] - ts[0]) / (span || 1) * 100);
  const panels = [...new Set(series.map(s => s.panel))].sort((a, b) => a - b);
  const nowT = Date.now(), nowI = timed && nowT >= ts[0] && nowT <= ts[N - 1] + (hasBar ? (span / (N - 1)) : 0) ? ts.findLastIndex(t => t <= nowT) : -1;
  const nowX = nowI < 0 ? null : hasBar ? fx[nowI] : (nowT - ts[0]) / (span || 1) * 100;
  const markS = c.mark && series[0], markVals = markS ? pts.map(p => num(p, markS)) : [];
  const markI = markS ? markVals.reduce((best, val, i) => val == null ? best : best < 0 || (c.mark === "min" ? val < markVals[best] : val > markVals[best]) ? i : best, -1) : -1;
  const panelHTML = panels.map((pn, pi) => {
    const ss = series.filter(s => s.panel === pn), vals = ss.flatMap(s => pts.map(p => num(p, s))).filter(x => x != null);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (ss.some(s => s.kind !== "line") && lo > 0) lo = 0;   // bars and areas grow from zero
    const ticks = niceTicks(lo, hi, pi === 0 && panels.length > 1 ? 3 : 4); lo = ticks[0]; hi = ticks[ticks.length - 1];
    const Y = val => (1 - (val - lo) / (hi - lo || 1)) * 100, base = Y(Math.max(lo, Math.min(0, hi)));
    const grid = ticks.map(t => `<line class="ch-grid" x1="0" x2="100" y1="${Y(t)}" y2="${Y(t)}"/>`).join("");
    const marks = ss.map(s => {
      const cls = `s${s.i}`, bw = Math.max(.15, 100 / N * .72 - (N > 60 ? 0 : .4));
      if (s.kind === "bar") return pts.map((p, i) => { const val = num(p, s); if (val == null) return ""; const y = Y(val);
        return `<rect class="ch-bar ${cls}${i === markI && s === markS ? " ch-hi" : ""}${i === nowI ? " ch-now" : ""}" x="${(fx[i] - bw / 2).toFixed(3)}" y="${Math.min(y, base).toFixed(3)}" width="${bw.toFixed(3)}" height="${Math.max(.4, Math.abs(base - y)).toFixed(3)}"/>`; }).join("");
      const segs = []; let cur = [];
      pts.forEach((p, i) => { const val = num(p, s); if (val == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push(`${fx[i].toFixed(3)},${Y(val).toFixed(3)}`); });
      if (cur.length) segs.push(cur);
      return segs.map(seg => (s.kind === "area" ? `<polygon class="ch-area ${cls}" points="${seg[0].split(",")[0]},${base} ${seg.join(" ")} ${seg[seg.length - 1].split(",")[0]},${base}"/>` : "")
        + `<polyline class="ch-line ${cls}" points="${seg.join(" ")}"/>`).join("");
    }).join("");
    const now = nowX == null ? "" : `<line class="ch-nowline" x1="${nowX}" x2="${nowX}" y1="0" y2="100"/>`;
    const yl = ticks.map(t => `<span style="top:${Y(t)}%">${esc(axisNum(t))}</span>`).join("");
    let markLbl = "";
    if (markI >= 0 && ss.includes(markS)) {
      const mv = markVals[markI], left = Math.min(88, Math.max(12, fx[markI]));
      markLbl = `<span class="ch-mark" style="left:${left}%;top:${Y(mv)}%">${esc(c.mark === "min" ? "Lowest" : "Highest")} ${esc(xLabel(xs[markI], ts[markI], xf === "hour" ? "time" : xf))} · ${esc(fmt(mv, { decimals: c.decimals }))}</span>`;
    }
    return `<div class="ch-panel"><div class="ch-y">${yl}</div>
      <div class="ch-plot"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${grid}${marks}${now}</svg>${markLbl}<i class="ch-guide" hidden></i></div></div>`;
  }).join("");
  const step = Math.max(1, Math.ceil(N / 5)), xl = [];
  for (let i = 0; i < N; i += step) xl.push(`<span style="left:${fx[i]}%"${fx[i] < 4 ? ' class="edge"' : ""}>${esc(xLabel(xs[i], ts[i], xf))}</span>`);
  const legend = series.length > 1 ? `<div class="ch-legend">${series.map(s => `<span><i class="s${s.i} ${s.kind === "bar" ? "sq" : ""}"></i>${esc(s.label)}${s.unit ? ` (${esc(s.unit)})` : ""}</span>`).join("")}</div>`
    : series[0].unit ? `<div class="ch-legend ch-unit">${esc(series[0].unit)}</div>` : "";
  /* everything the tooltip needs, already formatted, so hover never re-reads the API data */
  const tip = { fx: fx.map(f => +f.toFixed(2)), x: xs.map((x, i) => xLabel(x, ts[i], xf === "hour" ? "time" : xf)),
    s: series.map(s => ({ n: s.label, u: s.unit, k: s.kind === "bar" ? "sq" : "", c: `s${s.i}`, v: pts.map(p => { const val = num(p, s); return val == null ? "—" : fmt(val, { decimals: c.decimals }); }) })) };
  return `<div class="chart${panels.length > 1 ? " multi" : ""}" data-tip="${esc(JSON.stringify(tip))}">${legend}<div class="ch-panels">${panelHTML}</div>
    <div class="ch-x">${xl.join("")}</div><div class="ch-tip" hidden></div></div>`;
};

/* history: the widget's own recorded values over time, drawn as a line. */
DISPLAYS.history = function (c, v, r) {
  const h = (r && r.hist) || [];
  if (h.length < 2) return `<div class="state">Collecting history. A line appears after a few refreshes.</div>`;
  return DISPLAYS.chart({ ...c, xField: "t", yFields: [{ y: "v", label: c.name, unit: c.unit || "" }], chart: "line", scale: undefined }, h.map(([t, val]) => ({ t, v: val })));
};
