/* Beyond Dashboard service worker: keeps the app shell so it starts offline.
   API responses are never cached here; widgets keep their own last answer in IndexedDB.
   VERSION follows the ?v= cache-buster in index.html: bump both on every release. */
const VERSION = "v12";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png",
  `css/app.css?${VERSION.replace("v", "v=")}`, `blueprints.js?${VERSION.replace("v", "v=")}`,
  `vendor/gridstack-all.js?${VERSION.replace("v", "v=")}`, `vendor/gridstack.min.css?${VERSION.replace("v", "v=")}`,
  ...["engine", "displays", "lookups", "local", "app", "bank", "editor", "share", "boards", "kiosk", "live", "welcome", "boot"].map(n => `js/${n}.js?${VERSION.replace("v", "v=")}`)];
const CACHE = `beyond-${VERSION}`;

self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("beyond-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;   // APIs and fonts go straight to the network
  if (e.request.mode === "navigate") {   // the page: fresh when online, cached when not
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put("index.html", copy)); return r; })
      .catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));   // versioned files never change
});
