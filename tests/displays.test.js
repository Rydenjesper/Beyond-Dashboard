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
