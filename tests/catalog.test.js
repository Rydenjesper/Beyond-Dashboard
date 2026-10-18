const test = require("node:test"), assert = require("node:assert/strict");
const { load } = require("./load");
const $ = load("js/engine.js", "blueprints.js", "js/lookups.js");
const cfgUrls = $("cfgUrls"), compileExpr = $("compileExpr"), buildCfg = $("buildCfg"), MODULES = $("window.MODULES"), BLUEPRINTS = $("window.BLUEPRINTS"), PLACES = $("window.PLACES");
const DISPLAYS = ["stat", "gauge", "text", "list", "ticker", "image", "beacon", "json", "chart", "history"];
const MOD = Object.fromEntries(MODULES.map(m => [m.id, m]));

function checkCfg(c, where) {
  assert.equal(typeof c.name, "string", `${where}: name`);
  if (c.local) { assert.ok(["todo", "note", "pomodoro", "clock", "radio", "countdown", "moon", "progress"].includes(c.local), `${where}: local kind`); assert.equal(c.url, undefined, `${where}: local widgets call no API`); return; }
  const urls = cfgUrls(c);
  assert.ok(urls.length, `${where}: no url or sources`);
  urls.forEach(u => assert.match(u, /^https:\/\//, `${where}: url must be https (http never works on GitHub Pages)`));
  if (c.sources) {
    [c.value, c.okIf, c.warnIf, ...Object.values(c.calc || {})].filter(Boolean).forEach(ex => assert.doesNotThrow(() => compileExpr(ex), `${where}: bad expression ${ex}`));
    assert.ok(c.value || c.template, `${where}: combined widget needs a value`);
  }
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

test("History is only offered where the big number is a number", () => {
  const NOT_NUMBERS = $("NOT_NUMBERS"), isTemplate = $("isTemplate");
  for (const m of MODULES) {
    let combos = [{}];
    m.params.forEach(x => { if (x.type === "choice") combos = combos.flatMap(c => x.options.map(o => ({ ...c, [x.key]: o.value }))).slice(0, 60); });
    for (const p of combos) {
      const c = buildCfg(m, p, {});
      if (!c.displays.includes("history")) continue;
      const h = buildCfg(m, { ...p, display: "history" }, {});
      assert.ok(!NOT_NUMBERS.includes(h.format), `${m.id} ${JSON.stringify(p)}: history offered for a ${h.format} value`);
      assert.ok(!isTemplate(h.path) && !Array.isArray(h.yFields), `${m.id} ${JSON.stringify(p)}: history would draw text or a list`);
      assert.equal(h.path, buildCfg(m, { ...p, display: "stat" }, {}).path, `${m.id} ${JSON.stringify(p)}: history must draw the same value as the big number`);
    }
  }
});

test("dropdowns and suggestions point at pickers that exist", () => {
  const PICKERS = $("PICKERS");
  for (const m of MODULES) for (const x of m.params) {
    for (const k of ["pick", "suggest"]) if (x[k]) { assert.equal(x.type, "text", `${m.id}.${x.key}: ${k} is for text params`); assert.equal(typeof PICKERS[x[k]], "function", `${m.id}.${x.key}: no picker “${x[k]}”`); }
    if (x.input) assert.ok(["date", "zones"].includes(x.input), `${m.id}.${x.key}: unknown input ${x.input}`);
  }
});
