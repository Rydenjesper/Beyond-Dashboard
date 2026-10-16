/* Beyond Dashboard: a tiny CORS proxy for RSS/Atom feeds (Cloudflare Worker).
   GET https://your-worker.workers.dev/?url=https://example.com/feed.xml
   Only feeds pass (XML content types, https, GET), so it can't be used as an open proxy for anything else.
   Set ALLOWED_ORIGIN (Settings → Variables) to your dashboard's origin, e.g. https://you.github.io, to lock it to that site. */
export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = { "Access-Control-Allow-Origin": origin, "Vary": "Origin" };
    if (request.method === "OPTIONS") return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "GET" } });
    if (request.method !== "GET") return new Response("Only GET", { status: 405, headers: cors });
    if (origin !== "*" && request.headers.get("Origin") !== origin) return new Response("Not allowed", { status: 403, headers: cors });
    const target = new URL(request.url).searchParams.get("url");
    if (!target || !/^https:\/\//.test(target)) return new Response("Pass ?url=https://…", { status: 400, headers: cors });
    const res = await fetch(target, { headers: { "User-Agent": "BeyondDashboard-proxy", "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml" }, cf: { cacheTtl: 300 } });
    const type = res.headers.get("Content-Type") || "";
    if (!/xml|rss|atom/i.test(type)) return new Response("That URL isn't a feed", { status: 415, headers: cors });
    return new Response(res.body, { status: res.status, headers: { ...cors, "Content-Type": type, "Cache-Control": "public, max-age=300" } });
  },
};
