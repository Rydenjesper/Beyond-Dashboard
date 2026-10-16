const test = require("node:test"), assert = require("node:assert/strict");
const { load } = require("./load");
const $ = load("js/engine.js", "blueprints.js");
const buildCfg = $("buildCfg"), MODULES = $("window.MODULES"), BLUEPRINTS = $("window.BLUEPRINTS"), PLACES = $("window.PLACES");
const DISPLAYS = ["stat", "gauge", "text", "list", "ticker", "image", "beacon", "json"];
const MOD = Object.fromEntries(MODULES.map(m => [m.id, m]));

function checkCfg(c, where) {
  assert.equal(typeof c.name, "string", `${where}: name`);
  if (c.local) { assert.ok(["todo", "note", "pomodoro", "clock", "radio"].includes(c.local), `${where}: local kind`); assert.equal(c.url, undefined, `${where}: local widgets call no API`); return; }
  assert.match(c.url, /^https:\/\//, `${where}: url must be https (http never works on GitHub Pages)`);
  assert.ok(DISPLAYS.includes(c.display), `${where}: display ${c.display}`);
  assert.ok(c.displays.every(d => DISPLAYS.includes(d)), `${where}: displays`);
  assert.ok(+c.refresh >= 10, `${where}: refresh`);
}

test("module and blueprint ids are unique", () => {
  const ids = [...MODULES, ...BLUEPRINTS].map(x => x.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every module builds a valid config for its defaults and every choice", () => {
  for (const m of MODULES) {
    assert.ok(m.id && m.name && m.desc && m.category && Array.isArray(m.params) && typeof m.build === "function", `${m.id}: fields`);
    for (const x of m.params) {
      assert.ok(["choice", "text", "place", "secret", "search"].includes(x.type), `${m.id}.${x.key}: type ${x.type}`);
      if (x.type === "choice") assert.ok(x.options.some(o => o.value === x.default), `${m.id}.${x.key}: default isn't an option`);
      if (x.type === "search") { assert.ok(x.search, `${m.id}.${x.key}: search needs a searcher`); assert.ok(x.default?.value && x.default?.label, `${m.id}.${x.key}: default {value, label}`); }
    }
    checkCfg(buildCfg(m, {}), `${m.id} (defaults)`);
    for (const x of m.params.filter(x => x.type === "choice"))
      for (const o of x.options) checkCfg(buildCfg(m, { [x.key]: o.value }), `${m.id}.${x.key}=${o.value}`);
    for (const x of m.params.filter(x => x.type === "place"))
      for (const pl of PLACES) checkCfg(buildCfg(m, { [x.key]: pl }), `${m.id} @ ${pl.name}`);
  }
});

test("every blueprint has the required fields and builds", () => {
  for (const b of BLUEPRINTS) {
    for (const k of ["id", "name", "desc"]) assert.ok(b[k], `${b.id}: missing ${k}`);
    assert.ok(b.category || MOD[b.mod]?.category, `${b.id}: missing category (own or from its module)`);
    assert.ok(!!b.mod !== !!b.url, `${b.id}: needs exactly one of mod or url`);
    if (b.mod) { assert.ok(MOD[b.mod], `${b.id}: unknown module ${b.mod}`); checkCfg(buildCfg(MOD[b.mod], b.params || {}), b.id); }
    else { assert.match(b.url, /^https:\/\//, `${b.id}: url`); assert.ok(DISPLAYS.includes(b.display), `${b.id}: display`); }
  }
});
