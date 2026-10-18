const test = require("node:test"), assert = require("node:assert/strict");
const { spawn } = require("node:child_process"), path = require("node:path");
const tools = require("../mcp/tools");
const decode = tools.get("decode"), hydrate = tools.get("hydrate");
const MODS = Object.fromEntries(tools.get("window.MODULES").map(m => [m.id, m])), BANK = Object.fromEntries(tools.get("window.BLUEPRINTS").map(b => [b.id, b]));

/* No network in tests: geocoding and the SL stop list are answered here. */
const realFetch = globalThis.fetch;
globalThis.fetch = async url => {
  url = String(url);
  if (url.includes("geocoding-api.open-meteo.com")) return Response.json(url.includes("language=sv") ? { results: [{ id: 1, name: "Göteborg", latitude: 57.70716, longitude: 11.96679, country_code: "SE", feature_code: "PPLA", population: 608462 }] } : { results: [{ id: 2, name: "Göteborgnuten", latitude: 78.1, longitude: 15.2, country_code: "SJ", feature_code: "MT" }] });
  if (url.includes("transport.integration.sl.se/v1/sites?")) return Response.json([{ id: 9117, name: "Odenplan", note: "" }, { id: 9192, name: "Slussen", note: "" }]);
  throw new Error(`unexpected fetch in test: ${url}`);
};
test.after(() => { globalThis.fetch = realFetch; });
const open = async link => hydrate(await decode(link), MODS, BANK);

test("search_catalog and describe_module find what Claude needs", () => {
  const ids = tools.searchCatalog({ query: "electricity" }).results.map(r => r.id);
  assert.ok(ids.includes("elpris") && ids.includes("el_cheap"));
  assert.ok(tools.searchCatalog({ category: "traffic" }).results.some(r => r.id === "sl"));
  const d = tools.describeModule({ id: "elpris" });
  assert.deepEqual(d.params.find(p => p.key === "zone").options, ["SE1", "SE2", "SE3", "SE4"]);
  assert.equal(tools.describeModule({ id: "bp_iss_velocity" }).kind, "blueprint");
  assert.throws(() => tools.describeModule({ id: "nope" }), /No module or blueprint/);
});

test("build_board gives a link that opens as the same board", async () => {
  const r = await tools.buildBoard({ title: "Göteborg", widgets: [
    { module: "elpris", params: { zone: "SE3", show: "day" } },
    { module: "forecast", params: { place: "Göteborg" }, w: 4 },
    { module: "sl", params: { stop: "Odenplan", mode: "BUS" } },
    { blueprint: "bp_iss_velocity" },
    { custom: { name: "Mine", url: "https://api.example.com/x", path: "a", display: "stat" } },
  ] });
  assert.match(r.link, /^https:\/\/rydenjesper\.github\.io\/Beyond-Dashboard\/#d=z/);
  const b = await open(r.link);
  assert.equal(b.title, "Göteborg");
  assert.deepEqual(b.widgets.map(w => w.mod || w.bp || "custom"), ["elpris", "forecast", "sl", "iss", "custom"], "presets become their module, as in the app");
  assert.deepEqual(b.widgets[1].params.place, { name: "Göteborg", lat: 57.7072, lon: 11.9668 }, "a place name is geocoded");
  assert.equal(b.widgets[1].w, 4);
  assert.deepEqual(b.widgets[2].params.stop, { value: "9117", label: "Odenplan" }, "an SL stop name is looked up");
  assert.ok(r.warnings.some(w => /api\.example\.com isn't in the catalog/.test(w)), "unknown domains are flagged");
  assert.deepEqual(b.allowed, [], "and never pre-approved");
});

test("bad input: clear errors, and keys never pass", async () => {
  await assert.rejects(tools.buildBoard({ widgets: [{ module: "nope" }] }), /no module called “nope”/);
  await assert.rejects(tools.buildBoard({ widgets: [] }), /at least one widget/);
  await assert.rejects(tools.buildBoard({ widgets: Array(41).fill({ blueprint: "bp_cat_fact" }) }), /40 or fewer/);
  const r = await tools.buildBoard({ widgets: [{ module: "stocks", params: { key: "SECRET123", symbol: "AAPL" } }, { module: "elpris", params: { zone: "SE9", color: "red" } }] });
  assert.ok(!r.link.includes("SECRET123") && !JSON.stringify(await decode(r.link)).includes("SECRET123"));
  assert.ok(r.warnings.some(w => /API keys can't be set/.test(w)));
  assert.ok(r.warnings.some(w => /"SE9" isn't a valid zone/.test(w)));
  assert.ok(r.warnings.some(w => /“color” isn't a parameter/.test(w)));
  const local = await tools.buildBoard({ widgets: [{ module: "todo", params: { title: "Groceries" } }], base_url: "http://localhost:8000/index.html" });
  assert.match(local.link, /^http:\/\/localhost:8000\/index\.html#d=/);
});

test("the server speaks MCP over stdio", async () => {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "mcp", "server.js")], { stdio: ["pipe", "pipe", "inherit"] });
  const lines = []; let buf = "";
  child.stdout.on("data", d => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const msgs = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "describe_module", arguments: { id: "metal" } } },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "describe_module", arguments: { id: "nope" } } },
    { jsonrpc: "2.0", id: 5, method: "nope" },
  ];
  child.stdin.end(msgs.map(m => JSON.stringify(m)).join("\n") + "\n");
  await new Promise(ok => child.on("exit", ok));
  const by = Object.fromEntries(lines.map(l => [l.id, l]));
  assert.equal(by[1].result.serverInfo.name, "beyond-dashboard");
  assert.equal(by[1].result.protocolVersion, "2025-06-18");
  assert.deepEqual(by[2].result.tools.map(t => t.name), ["search_catalog", "describe_module", "preview_widget", "build_board",
    "connect_dashboard", "dashboard_state", "add_widgets", "update_widget", "remove_widgets", "create_board", "rename_board", "show_board"]);
  assert.ok(by[2].result.tools.every(t => t.inputSchema?.type === "object" && t.description));
  assert.equal(JSON.parse(by[3].result.content[0].text).id, "metal");
  assert.equal(by[4].result.isError, true, "tool errors go back to the model");
  assert.equal(by[5].error.code, -32601);
  assert.equal(lines.length, 5, "notifications get no answer");
});
