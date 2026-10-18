#!/usr/bin/env node
/* Beyond Dashboard MCP server: stdio, newline-delimited JSON-RPC 2.0, no dependencies.
   Add to Claude Code:  claude mcp add beyond -- node /path/to/Beyond-Dashboard/mcp/server.js
   Tools build a board and answer with a share link; nothing on the user's device is touched until they open it. */
const tools = require("./tools");

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
        instructions: "Build Beyond Dashboard boards from the catalog. Use search_catalog and describe_module to pick widgets, preview_widget to check values, then build_board and give the user the link." });
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
