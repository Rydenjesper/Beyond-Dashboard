const test = require("node:test"), assert = require("node:assert/strict");
const { load } = require("./load");
const $ = load("js/engine.js", "blueprints.js");
const buildCfg = $("buildCfg"), resolve = $("resolve"), tmpl = $("tmpl"), sanitizeParams = $("sanitizeParams");
const SL = $("window.MODULES").find(m => m.id === "sl");

const sample = { departures: [
  { line: { designation: "17" }, destination: "Alvik", display: "Nu", state: "ATSTOP", deviations: [] },
  { line: { designation: "18" }, destination: "Farsta strand", display: "17:10", state: "CANCELLED" },
  { line: { designation: "19" }, destination: "Hagsätra", display: "4 min", state: "EXPECTED", deviations: [{ text: "Delays" }] },
] };

test("SL: departures read naturally, cancelled ones say so", () => {
  const c = buildCfg(SL, {});
  assert.deepEqual(resolve(c, sample).map(it => tmpl(c.item, it)), ["17 Alvik · now", "18 Farsta strand · cancelled", "19 Hagsätra · 4 min ⚠"]);
  assert.equal(resolve(buildCfg(SL, { display: "text" }), sample), "17 Alvik · now");
});

test("SL: filters become query parameters, junk in the line field is ignored", () => {
  assert.match(buildCfg(SL, { mode: "METRO", line: "17", dir: "1" }).url, /\/sites\/9192\/departures\?transport=METRO&line=17&direction=1&forecast=60$/);
  assert.match(buildCfg(SL, { line: "17&x=1" }).url, /\?forecast=60$/);
  assert.match(buildCfg(SL, { stop: { value: "../../evil", label: "x" } }).url, /^https:\/\/transport\.integration\.sl\.se\/v1\/sites\/\.\.%2F\.\.%2Fevil\//);
});

test("search params from a link keep only value and label", () => {
  assert.deepEqual(sanitizeParams(SL, { stop: { value: 1234, label: "Odenplan", evil: "<x>" } }).stop, { value: "1234", label: "Odenplan" });
  assert.equal(sanitizeParams(SL, { stop: { value: {}, label: "x" } }).stop, undefined);
});
