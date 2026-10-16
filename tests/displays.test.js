const test = require("node:test"), assert = require("node:assert/strict");
const { load } = require("./load");
const $ = load("js/engine.js", "js/displays.js");
const DISPLAYS = $("DISPLAYS");
const X = `<img src=x onerror=alert(1)>`, XQ = `https://x.test/a.png" onerror="alert(1)`;

test("API text can't inject markup through any display type", () => {
  const c = { name: X, unit: X, prefix: X, item: `{t} ${X}`, caption: "cap", ok: [X], warn: [X], decimals: undefined };
  const values = [X, XQ, { t: X }, [X, { t: X }], [{ t: X }]];
  for (const [type, fn] of Object.entries(DISPLAYS)) for (const v of values) {
    const html = fn({ ...c, display: type }, v, { history: [1, 2, 3, 4], data: { cap: X } }, 3);
    assert.ok(!html.includes("<img src=x"), `${type} let a raw <img> through for ${JSON.stringify(v)}`);
    assert.ok(!/"\s*onerror="alert/.test(html), `${type} let an attribute break out for ${JSON.stringify(v)}`);
  }
});

test("image display only shows https images and sends no referrer", () => {
  assert.match(DISPLAYS.image({ name: "i" }, "http://x.test/a.png", {}), /Only https images/);
  assert.match(DISPLAYS.image({ name: "i" }, "javascript:alert(1)", {}), /Only https images/);
  assert.match(DISPLAYS.image({ name: "i" }, "https://x.test/a.png", {}), /referrerpolicy="no-referrer"/);
});

test("charts escape labels, field names and x values", () => {
  const t0 = Date.now() - 3 * 3600e3;
  const pts = [0, 1, 2, 3].map(i => ({ t: i === 1 ? X : new Date(t0 + i * 3600e3).toISOString(), v: i }));
  const html = DISPLAYS.chart({ xField: "t", yFields: [{ y: "v", label: X, unit: X }, { y: "v", label: "b" }], mark: "max" }, pts);
  assert.ok(!html.includes("<img src=x"), "raw markup in chart");
  const tip = JSON.parse(html.match(/data-tip="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&"));
  assert.equal(tip.s[0].n, X, "the tooltip gets the raw text and renders it with textContent");
});

test("charts: bars, panels, now marker and extreme label", () => {
  const t0 = Date.now() - 2 * 3600e3;
  const pts = Array.from({ length: 6 }, (_, i) => ({ t: new Date(t0 + i * 3600e3).toISOString(), a: [5, 3, 8, 1, 4, 6][i], b: i }));
  const html = DISPLAYS.chart({ xField: "t", yFields: [{ y: "a", label: "A", kind: "bar" }, { y: "b", label: "B", unit: "mm", panel: 1 }], mark: "min" }, pts);
  assert.equal((html.match(/class="ch-bar/g) || []).length, 6);
  assert.equal((html.match(/class="ch-panel"/g) || []).length, 2, "different panels for different units");
  assert.match(html, /ch-bar s0 ch-hi/, "the lowest bar is marked");
  assert.match(html, /Lowest/);
  assert.match(html, /ch-nowline/);
  assert.match(DISPLAYS.chart({ yFields: "a" }, [{ a: 1 }]), /Not enough data/);
});

test("charts sort time series that arrive newest first", () => {
  const pts = [{ t: "2026-03-01", v: 3 }, { t: "2026-02-01", v: 2 }, { t: "2026-01-01", v: 1 }];
  const tip = JSON.parse(DISPLAYS.chart({ xField: "t", yFields: "v", xFormat: "date" }, pts).match(/data-tip="([^"]*)"/)[1].replace(/&quot;/g, '"'));
  assert.deepEqual(tip.s[0].v, ["1", "2", "3"]);
});
