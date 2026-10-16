const test = require("node:test"), assert = require("node:assert/strict");
const { load } = require("./load");
const $ = load("js/engine.js");
const migrateBoards = $("migrateBoards");

const v2 = { title: "Göteborg control room", allowed: ["api.example.com"], widgets: [
  { id: "w1", mod: "weather", params: { metric: "temperature_2m" }, x: 0, y: 0, w: 2, h: 1 },
  { id: "w2", bp: "bp_cat_fact", x: 2, y: 0, w: 4, h: 1 },
  { id: "w3", name: "Mine", url: "https://api.example.com/x", path: "a", display: "stat", x: 0, y: 1, w: 2, h: 1 },
] };

test("a v2 board becomes the first and active board, with nothing lost", () => {
  const before = JSON.parse(JSON.stringify(v2));
  const m = migrateBoards(null, v2);
  assert.equal(m.boards.length, 1);
  assert.equal(m.active, m.boards[0].id);
  const { id, ...rest } = m.boards[0];
  assert.deepEqual(rest, v2);
  assert.deepEqual(v2, before, "the old board object isn't modified");
});

test("existing boards win over the old key", () => {
  const saved = { active: "b2", boards: [{ id: "b1", title: "A", widgets: [] }, { id: "b2", title: "B", widgets: [{ id: "x", bp: "bp_dog" }] }] };
  assert.deepEqual(migrateBoards(saved, v2), saved);
});

test("nothing saved means no boards (first visit)", () => {
  assert.equal(migrateBoards(null, null), null);
  assert.equal(migrateBoards({ boards: [] }, null), null);
  assert.equal(migrateBoards(null, { title: "no widgets" }), null);
});

test("damaged saves are repaired, not thrown away", () => {
  const m = migrateBoards({ active: "gone", boards: [null, { title: 5, widgets: "x" }, { id: "a", widgets: [] }, { id: "a", title: "dup", widgets: [] }] }, null);
  assert.equal(m.boards.length, 3);
  assert.equal(m.active, m.boards[0].id, "unknown active falls back to the first board");
  assert.equal(m.boards[0].title, "Control Room");
  assert.deepEqual(m.boards[0].widgets, []);
  assert.equal(new Set(m.boards.map(b => b.id)).size, 3, "duplicate ids are renamed");
});

test("an empty boards list falls back to the old key", () => {
  const m = migrateBoards({ active: "x", boards: [] }, v2);
  assert.equal(m.boards[0].title, v2.title);
  assert.equal(m.boards[0].widgets.length, 3);
});
