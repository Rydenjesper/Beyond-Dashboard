const test = require("node:test"), assert = require("node:assert/strict");
const { load } = require("./load");
const $ = load("js/engine.js");
const sunTimes = $("sunTimes"), isNight = $("isNight");
const hm = ms => { const d = new Date(ms); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const near = (ms, h, m, where) => assert.ok(Math.abs(hm(ms) - (h * 60 + m)) <= 5, `${where}: got ${new Date(ms).toISOString().slice(11, 16)} UTC, expected about ${h}:${String(m).padStart(2, "0")}`);

test("sunrise and sunset, within a few minutes", () => {
  const sthlm = sunTimes(59.33, 18.07, Date.UTC(2026, 5, 21, 12));
  near(sthlm.rise, 1, 31, "Stockholm midsummer sunrise"); near(sthlm.set, 20, 8, "Stockholm midsummer sunset");
  const gw = sunTimes(51.48, 0, Date.UTC(2026, 2, 20, 12));
  near(gw.rise, 6, 3, "Greenwich equinox sunrise"); near(gw.set, 18, 13, "Greenwich equinox sunset");
});

test("midnight sun and polar night", () => {
  assert.equal(sunTimes(69.65, 18.96, Date.UTC(2026, 5, 21, 12)).polar, "day");
  assert.equal(sunTimes(69.65, 18.96, Date.UTC(2026, 11, 21, 12)).polar, "night");
  assert.equal(isNight(69.65, 18.96, Date.UTC(2026, 5, 21, 0)), false, "Tromsø at midnight in June is light");
  assert.equal(isNight(59.33, 18.07, Date.UTC(2026, 11, 21, 20)), true, "Stockholm 21:00 in December is dark");
  assert.equal(isNight(59.33, 18.07, Date.UTC(2026, 11, 21, 11)), false, "Stockholm midday in December is light");
});
