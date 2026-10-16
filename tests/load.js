/* Loads the app's classic scripts into this Node process the same way the browser does:
   one shared global scope, in order. Returns a getter for any top-level name. */
const vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");
const ROOT = path.join(__dirname, "..");
globalThis.window = globalThis;   // blueprints.js writes window.MODULES etc.

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k),
    key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear() };
}
function load(...files) {
  for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), "utf8"), { filename: f });
  return name => vm.runInThisContext(name);
}
module.exports = { load, fakeStorage, ROOT };
