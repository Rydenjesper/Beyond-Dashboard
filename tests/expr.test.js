const test = require("node:test"), assert = require("node:assert/strict");
const { load } = require("./load");
const $ = load("js/engine.js");
const ev = $("evalExpr"), pick = $("pick");

test("arithmetic and precedence", () => {
  assert.equal(ev("1 + 2 * 3", {}), 7);
  assert.equal(ev("(1 + 2) * 3", {}), 9);
  assert.equal(ev("10 / 4 - 1", {}), 1.5);
  assert.equal(ev("-2 * -3", {}), 6);
  assert.equal(ev("7 % 4", {}), 3);
  assert.equal(ev("2 + 3 > 4 and 1 < 2", {}), true);
  assert.equal(ev("not 1 > 2 or false", {}), true);
  assert.equal(ev("1.5e3 + 1", {}), 1501);
});

test("sources, paths and string values", () => {
  const env = { gold: "2400.5", fx: 10.5, iss: { latitude: 12.5 }, p: [{ v: 1 }, { v: 3 }] };
  assert.equal(ev("gold * fx / 31.1035", env), 2400.5 * 10.5 / 31.1035);
  assert.equal(ev("iss.latitude", env), 12.5);
  assert.equal(ev("p[-1].v", env), 3);
  assert.equal(ev("avg(p[*].v)", env), 2);
  assert.equal(ev(`"Kp " + round(fx) + ", too low"`, env), "Kp 11, too low");
  assert.equal(ev(`fx == "10.5"`, env), true);
  assert.equal(ev(`gold + 1`, env), 2401.5, "a numeric string next to a number adds");
  assert.equal(ev(`"409" + " " + "Duvnäs"`, env), "409 Duvnäs", "strings join, spaces kept");
});

test("functions", () => {
  assert.equal(ev("min(3, 1, 2) + max(4, 5)", {}), 6);
  assert.equal(ev("round(3.14159, 2)", {}), 3.14);
  assert.equal(ev("if(2 > 1, \"yes\", \"no\")", {}), "yes");
  assert.equal(ev("sum(1, 2, 3) + abs(-1)", {}), 7);
  assert.ok(Math.abs(ev("distance(59.33, 18.07, 57.71, 11.97)", {}) - 397) < 3, "Stockholm–Göteborg is about 397 km");
  assert.equal(ev("(true + true + false) >= 2", {}), true, "booleans count as 1 and 0");
});

test("unknown names and functions are clear errors", () => {
  assert.throws(() => ev("gold * 2", {}), /Unknown name “gold”/);
  assert.throws(() => ev("eval(1)", {}), /Unknown function “eval”/);
  assert.throws(() => ev("1 +", {}), /ends too early/);
  assert.throws(() => ev("1 2", {}), /Unexpected/);
  assert.throws(() => ev("2 ^ 3", {}), /Can't read/);
});

test("no way out of the sandbox", () => {
  const env = { a: { b: 1 }, s: "x" };
  for (const bad of ["constructor", "a.constructor", "a.__proto__", "a.constructor.constructor", "s.constructor", "__proto__", "this", "globalThis", "process", "a[\"b\"]", "toString()", "hasOwnProperty"])
    assert.throws(() => ev(bad, env), undefined, `${bad} should not evaluate`);
  assert.equal(ev("a.toString", env), undefined, "functions found by a path are never returned");
  assert.throws(() => ev("x".repeat(600), {}), /too long/);
});
