const test = require("node:test"), assert = require("node:assert/strict");
const { load } = require("./load");
const $ = load("js/engine.js", "blueprints.js");
const pick = $("pick"), tmpl = $("tmpl"), fmt = $("fmt"), resolve = $("resolve"), fillPlaceholders = $("fillPlaceholders"),
  countdown = $("countdown"), buildCfg = $("buildCfg"), unescapeHTML = $("unescapeHTML"), esc = $("esc");
const MODULES = $("window.MODULES");

test("pick: dotted paths, indexes, negative indexes", () => {
  const d = { a: { b: [{ c: 1 }, { c: 2 }, { c: 3 }] } };
  assert.equal(pick(d, "a.b[0].c"), 1);
  assert.equal(pick(d, "a.b[-1].c"), 3);
  assert.equal(pick(d, "a.b[-2].c"), 2);
  assert.equal(pick(d, ""), d);
  assert.equal(pick(d, "a.x.y"), undefined);
  assert.equal(pick([5, 6], "[1]"), 6);
});

test("pick: [now] finds the slice that covers the current moment", () => {
  const h = 3600e3, t = Date.now();
  const slices = [-2, -1, 0, 1].map(i => ({ time_start: new Date(t + i * h).toISOString(), time_end: new Date(t + (i + 1) * h).toISOString(), v: i }));
  assert.equal(pick({ s: slices }, "s[now].v"), 0);
  assert.equal(pick({ s: [{ start: new Date(t - h).toISOString(), v: "open" }, { start: new Date(t + h).toISOString(), v: "later" }] }, "s[now].v"), "open");
  assert.equal(pick({ s: [{ x: 1 }] }, "s[now]"), undefined);
});

test("tmpl: fields and filters", () => {
  assert.equal(tmpl("{a} and {b.c}", { a: "x", b: { c: 2 } }), "x and 2");
  assert.equal(tmpl("{n|compact}", { n: 12345 }), "12.3K");
  assert.equal(tmpl("{n|round}", { n: 3.7 }), "4");
  assert.equal(tmpl("{missing}!", {}), "!");
  assert.match(tmpl("{d|countdown}", { d: new Date(Date.now() + 2 * 86400e3 + 5 * 3600e3 + 60e3).toISOString() }), /^in 2d 5h$/);
});

test("fmt: formats and decimals", () => {
  assert.equal(fmt(null, {}), "—");
  assert.equal(fmt(3.14159, {}), "3.14");
  assert.equal(fmt(123.456, {}), "123.5");
  assert.equal(fmt(12345.6, {}), "12,346");
  assert.equal(fmt(2.5, { decimals: 0 }), "3");
  assert.equal(fmt(5400, { format: "duration" }), "1h 30m");
  assert.equal(fmt(3, { format: "wmo" }), "Overcast");
  assert.equal(fmt(1500000, { format: "compact" }), "1.5M");
  assert.equal(fmt(true, {}), "true");
  assert.equal(fmt("hello", {}), "hello");
});

test("countdown: future, past and now", () => {
  assert.equal(countdown(new Date(Date.now() + 90 * 60e3 + 5e3).toISOString()), "in 1h 30m");
  assert.equal(countdown(new Date(Date.now() - 10 * 60e3).toISOString()), "10m ago");
  assert.equal(countdown(new Date().toISOString()), "now");
  assert.equal(countdown("not a date"), "not a date");
});

test("fillPlaceholders: dates and random ranges", () => {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  assert.equal(fillPlaceholders("{YYYY}-{MM}-{DD}"), `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  for (let i = 0; i < 50; i++) { const n = +fillPlaceholders("{rand:3-5}"); assert.ok(n >= 3 && n <= 5); }
});

test("resolve: template paths, item templates and scale", () => {
  assert.equal(resolve({ path: "a.b", scale: 100 }, { a: { b: 0.25 } }), 25);
  assert.equal(resolve({ path: "{x} / {y}" }, { x: 1, y: 2 }), "1 / 2");
  assert.equal(resolve({ path: "t" }, { t: "Tom &amp; Jerry" }), "Tom & Jerry");
  assert.equal(resolve({ path: "a", scale: 2 }, { a: "n/a" }), "n/a");
});

test("esc and unescapeHTML", () => {
  assert.equal(esc(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  assert.equal(unescapeHTML("&#x41;&#66;&lt;&unknown;"), "AB<&unknown;");
});

test("buildCfg: invalid choice values fall back to a real option", () => {
  for (const m of MODULES) for (const x of m.params.filter(x => x.type === "choice")) {
    const c = buildCfg(m, { [x.key]: "evil.example" });
    assert.ok(!JSON.stringify(c).includes("evil.example"), `${m.id}.${x.key} built a config from an invalid choice`);
  }
});

test("buildCfg: secret params come from the key store, never from params", () => {
  const m = { id: "t", params: [{ key: "k", type: "secret", label: "key" }], build: p => ({ url: "https://x.test/?k=" + p.k }) };
  const c = buildCfg(m, { k: "FROM_LINK" });
  assert.ok(!c.url.includes("FROM_LINK"));
  assert.deepEqual(c.needsKey, { label: "key", help: undefined });
  const c2 = buildCfg(m, {}, { k: "mine" });
  assert.equal(c2.url, "https://x.test/?k=mine");
  assert.equal(c2.needsKey, undefined);
  assert.deepEqual(c2.secrets, ["mine"]);
});

test("dates and times are always English, 24-hour, whatever the browser's language", () => {
  assert.equal(fmt("2026-10-16T12:00:00", { format: "date" }), "16 Oct 2026");
  assert.equal(fmt("2026-10-16T07:05:00", { format: "time" }), "07:05");
  assert.equal($("LOCALE"), "en-GB");
});

test("an empty list can say what it means", () => {
  assert.equal(resolve({ path: "d", template: "{0.a} · {0.b}", empty: "Nothing leaves" }, { d: [] }), "Nothing leaves");
  assert.equal(resolve({ path: "d", template: "{0.a} · {0.b}", empty: "Nothing leaves" }, { d: [{ a: 1, b: 2 }] }), "1 · 2");
});
