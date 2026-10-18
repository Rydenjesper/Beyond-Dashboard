const test = require("node:test"), assert = require("node:assert/strict");
process.env.BEYOND_LIVE_PORT = "47391";   // never clash with a real session
const live = require("../mcp/live");
const BASE = "http://127.0.0.1:47391", ORIGIN = "http://localhost:8000";
const post = (path, body, origin = ORIGIN) => fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });
test.after(() => live.stop());

/* A stand-in for the dashboard: reads the event stream and answers each command. */
async function dashboard(token, answer) {
  const res = await fetch(`${BASE}/events?token=${token}`, { headers: { Origin: ORIGIN } });
  assert.equal(res.status, 200);
  const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "";
  (async () => {
    for (;;) {
      const { done, value } = await reader.read(); if (done) return;
      buf += dec.decode(value);
      let i; while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        const line = chunk.split("\n").find(l => l.startsWith("data: ")); if (!line) continue;
        const { id, op, args } = JSON.parse(line.slice(6));
        try { await post(`/reply?token=${token}`, { id, ok: true, result: await answer(op, args) }); }
        catch (e) { await post(`/reply?token=${token}`, { id, ok: false, error: e.message }); }
      }
    }
  })();
  return reader;
}

test("nothing listens before connect, and commands fail clearly", async () => {
  await assert.rejects(fetch(`${BASE}/pair`), "no server yet");
  await assert.rejects(live.send("state"), /isn't connected/);
});

test("pairing: only the right code, from the dashboard's origin, a limited number of times", async () => {
  const { code } = await live.connect();
  assert.match(code, /^\d{3} \d{3}$/);
  assert.equal((await post("/pair", { code }, "https://evil.test")).status, 403, "other sites are refused");
  assert.equal((await post("/pair", { code: "000 000" === code ? "111 111" : "000 000" })).status, 401, "wrong code");
  const ok = await post("/pair", { code });
  assert.equal(ok.status, 200);
  assert.match((await ok.json()).token, /^[0-9a-f]{48}$/);
  assert.equal((await post("/pair", { code })).status, 410, "a code works once");
  const { code: c2 } = await live.connect();
  for (let i = 0; i < 5; i++) await post("/pair", { code: "999 998" === c2 ? "999 997" : "999 998" });
  assert.equal((await post("/pair", { code: c2 })).status, 410, "five wrong guesses burn the code");
});

test("commands reach the dashboard and answers come back; no token, no stream", async () => {
  const { code } = await live.connect(), { token } = await (await post("/pair", { code })).json();
  assert.equal((await fetch(`${BASE}/events?token=wrong`, { headers: { Origin: ORIGIN } })).status, 401);
  const reader = await dashboard(token, (op, args) => { if (op === "boom") throw new Error("Not allowed"); return { op, args }; });
  await new Promise(r => setTimeout(r, 50));
  assert.equal(live.status().connected, true);
  assert.deepEqual(await live.send("add", { board: "b1", widgets: [1] }), { op: "add", args: { board: "b1", widgets: [1] } });
  await assert.rejects(live.send("boom"), /Not allowed/, "dashboard errors reach Claude");
  const pre = await fetch(`${BASE}/events`, { method: "OPTIONS", headers: { Origin: "https://rydenjesper.github.io", "Access-Control-Request-Private-Network": "true" } });
  assert.equal(pre.headers.get("access-control-allow-private-network"), "true", "Chrome's local-network preflight is answered");
  assert.equal(pre.headers.get("access-control-allow-origin"), "https://rydenjesper.github.io");
  await reader.cancel();
});
