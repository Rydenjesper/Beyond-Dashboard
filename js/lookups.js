"use strict";
/* Lookup lists for "search" params (SL stops, SR channels): fetched once, kept in beyond.cache.* for a week. */
const lists = {};
function cachedList(key, url, map, days = 7) {
  if (lists[key]) return lists[key];
  const saved = store.get(`beyond.cache.${key}`, null);
  if (saved && Date.now() - saved.at < days * 86400e3 && Array.isArray(saved.items)) return lists[key] = Promise.resolve(saved.items);
  return lists[key] = fetchData({ url }).then(d => { const items = map(d); store.set(`beyond.cache.${key}`, { at: Date.now(), items }); return items; })
    .catch(e => { delete lists[key]; if (saved?.items) return saved.items; throw e; });
}
const fold = s => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function rank(items, q, n = 8) {
  q = fold(q.trim()); if (!q) return [];
  const score = it => { const t = fold(it.label); return t === q ? 0 : t.startsWith(q) ? 1 : t.split(/[\s-]+/).some(w => w.startsWith(q)) ? 2 : t.includes(q) ? 3 : 9; };
  return items.map(it => [score(it), it]).filter(([s]) => s < 9).sort((a, b) => a[0] - b[0] || a[1].label.length - b[1].label.length).slice(0, n).map(([, it]) => it);
}
const SL_SITES = () => cachedList("sl_sites", "https://transport.integration.sl.se/v1/sites?expand=false",
  d => d.map(s => ({ value: String(s.id), label: s.name, sub: s.note || "" })));
const SR_CHANNELS = () => cachedList("sr_channels", "https://api.sr.se/api/v2/channels?format=json&pagination=false",
  d => d.channels.map(c => ({ value: String(c.id), label: c.name, sub: c.channeltype || "", image: c.image, stream: c.liveaudio?.url })), 3);
const SEARCHERS = {
  sl_sites: async q => rank(await SL_SITES(), q),
  sr_channels: async q => rank(await SR_CHANNELS(), q, 12),
};
