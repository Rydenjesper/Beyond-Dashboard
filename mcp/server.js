#!/usr/bin/env node
/* Beyond Dashboard MCP server: stdio, newline-delimited JSON-RPC 2.0, no dependencies.
   Add to Claude Code:  claude mcp add beyond -- node /path/to/Beyond-Dashboard/mcp/server.js
   Tools build a board and answer with a share link; nothing on the user's device is touched until they open it. */
const tools = require("./tools"), live = require("./live");

const widgetSpec = {
  type: "object",
  description: "One widget: { module, params, title?, w?, h? }, { blueprint, w?, h? } or { custom: { url, path, display, ... } }. w is 1–6 columns, h 1–4 rows; leave them out for the default size.",
  properties: {
    module: { type: "string", description: "Module id from search_catalog, e.g. \"weather\", \"elpris\", \"sl\"." },
    params: { type: "object", description: "Module params (see describe_module). Places and SL stops/SR channels can be plain names: { \"place\": \"Göteborg\" }, { \"stop\": \"Odenplan\" }. Add \"display\" to pick a view." },
    title: { type: "string", description: "Optional name shown on the widget." },
    blueprint: { type: "string", description: "Ready-made widget id from search_catalog, e.g. \"bp_iss_velocity\"." },
    custom: { type: "object", description: "Your own API: { name, url (https), path, display, unit?, item? }, or a combined widget with { sources: { a: { url, path } }, value: \"a * 2\" }." },
    w: { type: "integer", minimum: 1, maximum: 6 }, h: { type: "integer", minimum: 1, maximum: 4 },
  },
};
const TOOLS = [
  { name: "search_catalog", run: tools.searchCatalog,
    description: "Find widgets in the Beyond Dashboard catalog: configurable modules (weather anywhere, Swedish electricity prices, SL departures, charts, combined widgets…) and ready-made ones. Search by words and/or category. Returns ids to use in build_board.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Words to match, e.g. \"electricity\", \"aurora\", \"crypto\"." }, category: { type: "string", description: "Optional category, e.g. sweden, weather, space, money, traffic, personal." } } } },
  { name: "describe_module", run: tools.describeModule,
    description: "Show a module's parameters (with choices and defaults), its display options and default size, before using it in build_board.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "preview_widget", run: tools.previewWidget,
    description: "Fetch a widget's live value right now, to check it works and see what it will show. Also reports if an API blocks browsers (CORS), which would make it fail in the dashboard.",
    inputSchema: widgetSpec },
  { name: "build_board", run: tools.buildBoard,
    description: "Build a dashboard and get a share link. The user opens it and chooses “Add as new board”; their existing boards are never changed. API keys can't be set here.",
    inputSchema: { type: "object", properties: {
      title: { type: "string", description: "Board name." },
      widgets: { type: "array", items: widgetSpec, minItems: 1, maxItems: 40 },
      base_url: { type: "string", description: "Optional dashboard address; defaults to the public site. Use http://localhost:PORT/index.html for a local copy." },
    }, required: ["widgets"] } },
];

/* ── Live link: edit the boards in an open dashboard tab ── */
const boardRef = { type: "string", description: "Board id or title; leave out for the board the user is looking at." };
async function liveAdd({ board, widgets }) {
  const warnings = [], { widgets: ws, summary } = await tools.specsToWidgets(widgets, warnings);
  return { ...(await live.send("add", { board, widgets: ws })), added: summary, warnings };
}
async function liveUpdate({ board, widget, params, title, display, w, h, x, y }) {
  const state = await live.send("state"), b = state.boards.find(x => board ? x.id === board || x.title.toLowerCase() === String(board).toLowerCase() : x.active);
  const target = b?.widgets.find(x => x.id === widget);
  if (!target) throw new Error(`No widget “${widget}” on ${b ? `“${b.title}”` : "that board"}. Use dashboard_state for ids.`);
  const warnings = [], changes = { title, display, w, h, x, y };
  if (params) {
    if (!target.module) throw new Error("Only module widgets have params; for others change title, display or size.");
    changes.params = await tools.resolveParams(tools.MOD[target.module], params, warnings, target.name);
  }
  return { ...(await live.send("update", { board: b.id, widget, changes })), warnings };
}
const LIVE_TOOLS = [
  { name: "connect_dashboard", run: () => live.connect().then(r => ({ ...r, how: r.connected ? "Already connected; a new code was made in case the user wants to reconnect." : `Ask the user to click the Claude button at the top of their dashboard and enter ${r.code}. Then call dashboard_state.` })),
    description: "Start a live link to the user's open Beyond Dashboard so you can see and edit their boards. Gives a one-time code for the user to enter in the dashboard (Claude button). Only works while this session runs.",
    inputSchema: { type: "object", properties: {} } },
  { name: "dashboard_state", run: () => live.send("state"),
    description: "List the user's boards and widgets (ids, modules, params, sizes, positions) in the connected dashboard. Personal content like to-do items and notes is never included.",
    inputSchema: { type: "object", properties: {} } },
  { name: "add_widgets", run: liveAdd,
    description: "Add widgets to a board in the connected dashboard. Same widget format as build_board. The user sees them appear and can undo.",
    inputSchema: { type: "object", properties: { board: boardRef, widgets: { type: "array", items: widgetSpec, minItems: 1, maxItems: 40 } }, required: ["widgets"] } },
  { name: "update_widget", run: liveUpdate,
    description: "Change one widget: its params (module widgets), title, display, size (w 1–6, h 1–4) or position (x 0–5, y). Get widget ids from dashboard_state.",
    inputSchema: { type: "object", properties: { board: boardRef, widget: { type: "string" }, params: { type: "object" }, title: { type: "string" }, display: { type: "string" },
      w: { type: "integer", minimum: 1, maximum: 6 }, h: { type: "integer", minimum: 1, maximum: 4 }, x: { type: "integer", minimum: 0, maximum: 5 }, y: { type: "integer", minimum: 0 } }, required: ["widget"] } },
  { name: "remove_widgets", run: args => live.send("remove", args),
    description: "Remove widgets from a board in the connected dashboard (the user can undo).",
    inputSchema: { type: "object", properties: { board: boardRef, widgets: { type: "array", items: { type: "string" }, minItems: 1 } }, required: ["widgets"] } },
  { name: "create_board", run: async ({ title, widgets }) => { const warnings = [], ws = widgets?.length ? (await tools.specsToWidgets(widgets, warnings)).widgets : []; return { ...(await live.send("create", { title, widgets: ws })), warnings }; },
    description: "Create a new board in the connected dashboard, optionally with widgets, and show it.",
    inputSchema: { type: "object", properties: { title: { type: "string" }, widgets: { type: "array", items: widgetSpec, maxItems: 40 } }, required: ["title"] } },
  { name: "rename_board", run: args => live.send("rename", args),
    description: "Rename a board in the connected dashboard.",
    inputSchema: { type: "object", properties: { board: boardRef, title: { type: "string" } }, required: ["title"] } },
  { name: "show_board", run: args => live.send("show", args),
    description: "Switch the connected dashboard to a board.",
    inputSchema: { type: "object", properties: { board: boardRef }, required: ["board"] } },
];
TOOLS.push(...LIVE_TOOLS);

const send = msg => process.stdout.write(JSON.stringify(msg) + "\n");
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return;   // notifications (initialized, cancelled) need no answer
  switch (method) {
    case "initialize":
      return reply(id, { protocolVersion: params?.protocolVersion || "2025-06-18", capabilities: { tools: {} },
        serverInfo: { name: "beyond-dashboard", version: "1.0.0" },
        instructions: "Build Beyond Dashboard boards from the catalog. Use search_catalog and describe_module to pick widgets and preview_widget to check values. To make a new board, build_board gives a share link. To see or edit the user's existing boards, call connect_dashboard, have the user enter the code, then use dashboard_state, add_widgets, update_widget, remove_widgets, create_board, rename_board and show_board." });
    case "ping": return reply(id, {});
    case "tools/list": return reply(id, { tools: TOOLS.map(({ run, ...t }) => t) });
    case "tools/call": {
      const tool = TOOLS.find(t => t.name === params?.name);
      if (!tool) return fail(id, -32602, `Unknown tool: ${params?.name}`);
      try { return reply(id, { content: [{ type: "text", text: JSON.stringify(await tool.run(params.arguments || {}), null, 2) }] }); }
      catch (e) { return reply(id, { content: [{ type: "text", text: e.message }], isError: true }); }   // tool errors go back to the model, not the protocol
    }
    default: return fail(id, -32601, `Method not found: ${method}`);
  }
}

let buf = "", closing = false;
const pending = new Set();   // calls still running when stdin closes get to finish
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); continue; }
    const p = handle(msg).catch(e => msg.id !== undefined && fail(msg.id, -32603, e.message))
      .finally(() => { pending.delete(p); if (closing && !pending.size) process.exit(0); });
    pending.add(p);
  }
});
process.stdin.on("end", () => { closing = true; if (!pending.size) process.exit(0); });
