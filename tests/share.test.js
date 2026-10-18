const test = require("node:test"), assert = require("node:assert/strict");
const { load } = require("./load");
const $ = load("js/engine.js", "blueprints.js");
const encode = $("encode"), decode = $("decode"), hydrate = $("hydrate"), shareable = $("shareable"), SHARE_MAX = $("SHARE_MAX");
const MODS = Object.fromEntries($("window.MODULES").map(m => [m.id, m])), BANK = Object.fromEntries($("window.BLUEPRINTS").map(b => [b.id, b]));
const share = board => shareable(board, MODS);

const board = { title: "Mine", allowed: ["api.example.com"], widgets: [
  { id: "a", mod: "nasa_neo", params: { show: "list", key: "SHOULD_NOT_LEAK" }, x: 0, y: 0, w: 2, h: 2 },
  { id: "b", bp: "bp_cat_fact", x: 2, y: 0, w: 4, h: 1 },
  { id: "c", name: "Private", url: "https://api.example.com/v1?api_key=SECRET1&q=1", path: "x", display: "stat",
    headers: { Authorization: "Bearer SECRET2", "X-Api-Key": "SECRET3", Accept: "application/json" }, x: 0, y: 2, w: 2, h: 1 },
] };

test("round trip keeps layout, modules, blueprints and custom widgets", async () => {
  const back = hydrate(await decode(await encode(share(board).payload)), MODS, BANK);
  assert.equal(back.title, "Mine");
  assert.equal(back.widgets.length, 3);
  assert.equal(back.widgets[0].mod, "nasa_neo");
  assert.equal(back.widgets[0].params.show, "list");
  assert.equal(back.widgets[1].bp, "bp_cat_fact");
  assert.equal(back.widgets[2].path, "x");
  assert.deepEqual(back.widgets.map(w => [w.x, w.y, w.w, w.h]), [[0, 0, 2, 2], [2, 0, 4, 1], [0, 2, 2, 1]]);
});

test("links decode from a full URL as well as a bare code", async () => {
  const code = await encode(share(board).payload);
  assert.deepEqual(await decode(`https://x.test/index.html#d=${code}`), await decode(code));
});

test("keys, secret params and auth headers never reach the link", async () => {
  const { payload, stripped } = share(board);
  const txt = JSON.stringify(payload);
  for (const s of ["SHOULD_NOT_LEAK", "SECRET1", "SECRET2", "SECRET3"]) assert.ok(!txt.includes(s), `${s} leaked`);
  assert.ok(txt.includes("application/json"), "harmless headers are kept");
  assert.equal(stripped, 3);
});

test("personal widgets travel empty: their content is never in the link", () => {
  const b = { title: "P", widgets: [{ id: "t1", mod: "todo", params: { title: "Groceries" }, x: 0, y: 0, w: 2, h: 2 }, { id: "n1", mod: "note", params: {}, x: 2, y: 0, w: 2, h: 2 }] };
  globalThis.localStorage = require("./load").fakeStorage({ "beyond.local.v1": JSON.stringify({ t1: { items: [{ id: "a", text: "PRIVATE_TASK", done: false }] }, n1: { text: "PRIVATE_NOTE" } }) });
  const txt = JSON.stringify(share(b).payload);
  delete globalThis.localStorage;
  assert.ok(!txt.includes("PRIVATE"), "content leaked");
  assert.ok(txt.includes("Groceries"), "the list's name (a setting) is shared");
  const back = hydrate(share(b).payload, MODS, BANK);
  assert.ok(back.widgets.every(w => w.id !== "t1" && w.id !== "n1"), "new ids, so no saved content attaches");
});

test("a link never pre-approves domains", async () => {
  const p = { ...share(board).payload, allowed: ["evil.test"] };
  assert.deepEqual(hydrate(p, MODS, BANK).allowed, []);
});

test("broken and hostile links are rejected or cleaned", async () => {
  for (const bad of ["", "zzzz", "j" + btoa("{"), "j" + btoa("[]"), "j" + btoa('{"ws":"x"}')])
    await assert.rejects(async () => hydrate(await decode(bad), MODS, BANK));
  const b = hydrate({ t: 7, ws: [null, 5, "x", { m: "__proto__" }, { m: "constructor" }, { b: "toString" },
    { c: { url: "javascript:alert(1)" } }, { c: { url: "https://e.test", decimals: 1e6, display: "<x>", onload: "y", headers: { "bad key": "1", ok: 2 } } },
    { m: "status", p: { service: "evil.test", display: "json" }, x: 99, w: 50 }, { m: "weather", p: { place: null } }] }, MODS, BANK);
  assert.equal(b.title, "Shared dashboard");
  assert.equal(b.widgets.length, 3);
  const [custom, status, weather] = b.widgets;
  assert.deepEqual(Object.keys(custom).sort(), ["category", "decimals", "display", "h", "id", "name", "url", "w"].sort());
  assert.equal(custom.decimals, 10); assert.equal(custom.display, "text"); assert.equal(custom.headers, undefined);
  assert.deepEqual(status.params, { display: "json" });
  assert.equal(status.x, 5); assert.equal(status.w, 6);
  assert.deepEqual(weather.params, {});
});

test("links are capped in size, also after decompression", async () => {
  const bomb = await encode({ ws: [], pad: "a".repeat(SHARE_MAX * 10) });
  assert.ok(bomb.length < 1000, "compresses to a short link");
  await assert.rejects(decode(bomb), /too large/);
  await assert.rejects(decode("j" + "A".repeat(SHARE_MAX * 3)), /Not a share link/);
});

test("at most 100 widgets are imported", async () => {
  const ws = Array.from({ length: 500 }, () => ({ b: "bp_cat_fact" }));
  assert.equal(hydrate({ ws }, MODS, BANK).widgets.length, 100);
});

test("a custom chart keeps its fields and its grid position through a link", async () => {
  const b = { title: "C", widgets: [{ id: "c1", name: "ETH", url: "https://api.example.com/x", path: "prices", display: "chart", chart: "line", xField: "[0]", yFields: ["[1]"], x: 2, y: 3, w: 4, h: 2 }] };
  const [w] = hydrate(await decode(await encode(share(b).payload)), MODS, BANK).widgets;
  assert.deepEqual([w.x, w.y, w.w, w.h, w.xField, w.yFields, w.chart, w.display], [2, 3, 4, 2, "[0]", ["[1]"], "line", "chart"]);
});

test("credentials in a custom URL never travel, whatever the parameter is called", () => {
  const url = "https://api.resrobot.se/v2.1/departureBoard?id=740000002&format=json&accessId=K1&lang=sv&client_secret=K2&appid=K3&sig=K4&password=K5&x-api-key=K6&demo=DEMO_KEY";
  const { payload, stripped } = share({ title: "t", widgets: [{ id: "a", name: "x", url, path: "", display: "list", x: 0, y: 0, w: 2, h: 2 }] });
  const txt = JSON.stringify(payload);
  for (const k of ["K1", "K2", "K3", "K4", "K5", "K6"]) assert.ok(!txt.includes(`=${k}`), `${k} leaked`);
  for (const keep of ["id=740000002", "format=json", "lang=sv"]) assert.ok(txt.includes(keep), `${keep} should stay`);
  assert.equal(stripped, 6);
  const keepNames = "passengers=2&monkey=1&keyword=x&lang=sv&access_level=1";
  const kept = JSON.stringify(share({ title: "t", widgets: [{ id: "c", name: "z", url: `https://x.test/?${keepNames}`, path: "", display: "text", x: 0, y: 0, w: 2, h: 1 }] }).payload);
  assert.ok(kept.includes(keepNames), "ordinary parameters that only contain those letters are kept");
  const more = JSON.stringify(share({ title: "t", widgets: [{ id: "d", name: "w", url: "https://x.test/?apikey=A1&subscription-key=A2&access_token=A3&key=A4&Authorization=A5&client_id=A6", path: "", display: "text", x: 0, y: 0, w: 2, h: 1 }] }).payload);
  for (const k of ["A1", "A2", "A3", "A4", "A5", "A6"]) assert.ok(!more.includes(k), `${k} leaked`);
  const src = share({ title: "t", widgets: [{ id: "b", name: "y", display: "stat", value: "a", sources: { a: { url: "https://x.test/?accessId=K7", path: "" } }, x: 0, y: 0, w: 2, h: 1 }] });
  assert.ok(!JSON.stringify(src.payload).includes("K7"), "sources of combined widgets too");
});
