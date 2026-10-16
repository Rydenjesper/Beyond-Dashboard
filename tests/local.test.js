const test = require("node:test"), assert = require("node:assert/strict");
const { load } = require("./load");
globalThis.document = { title: "x", querySelectorAll: () => [] };   // local.js only touches the DOM when widgets mount
globalThis.Audio = class { addEventListener() {} };
const $ = load("js/engine.js", "js/displays.js", "js/lookups.js", "js/local.js");
clearInterval($("LOCAL_TICK"));
const moonPhase = $("moonPhase"), nextDate = $("nextDate"), periodProgress = $("periodProgress"), miniMarkdown = $("miniMarkdown");

test("moon phase matches known dates", () => {
  assert.equal(moonPhase(Date.UTC(2024, 3, 8, 18, 21)).name, "New moon", "8 April 2024 (the eclipse)");
  assert.equal(moonPhase(Date.UTC(2024, 8, 18, 2, 34)).name, "Full moon", "18 September 2024");
  const q = moonPhase(Date.UTC(2025, 0, 6, 23, 56));
  assert.equal(q.name, "First quarter"); assert.ok(Math.abs(q.lit - .5) < .05);
});

test("countdown dates: fixed, yearly, and rollover", () => {
  const now = new Date(2026, 9, 16, 12);
  assert.deepEqual(nextDate("2026-12-24", now), new Date(2026, 11, 24));
  assert.deepEqual(nextDate("12-24", now), new Date(2026, 11, 24));
  assert.deepEqual(nextDate("01-01", now), new Date(2027, 0, 1), "already passed this year → next year");
  assert.deepEqual(nextDate("10-16", now), new Date(2026, 9, 16), "today counts as today");
  assert.equal(nextDate("soon", now), null);
});

test("time passing", () => {
  assert.equal(periodProgress("day", new Date(2026, 9, 16, 12)), 50);
  assert.ok(Math.abs(periodProgress("year", new Date(2026, 6, 2, 12)) - 50) < .5);
  assert.equal(periodProgress("week", new Date(2026, 9, 12, 0)), 0, "weeks start on Monday");
});

test("notes: markdown can't inject HTML", () => {
  const h = miniMarkdown("# Hi\n**b** <img src=x onerror=alert(1)>\n- one");
  assert.ok(!h.includes("<img"));
  assert.match(h, /<p class="md-h1">Hi<\/p>/); assert.match(h, /<b>b<\/b>/); assert.match(h, /<li>one<\/li>/);
});
