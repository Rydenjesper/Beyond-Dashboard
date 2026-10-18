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

/* Pickers: the lists behind dropdowns and suggestions in the module settings.
   pick: "name" on a text param → a dropdown (only listed values). suggest: "name" → suggestions, typing anything still works.
   Each returns [{ value, label }]; q is what's typed so far, p the widget's other params. Values stay plain text,
   so saved widgets and share links are unchanged. */
const names = type => { try { const d = new Intl.DisplayNames(["en"], { type }); return c => { try { return d.of(c) || c; } catch { return c; } }; } catch { return c => c; } };
const COINS = [["BTC", "Bitcoin"], ["ETH", "Ethereum"], ["SOL", "Solana"], ["XRP", "XRP"], ["DOGE", "Dogecoin"], ["ADA", "Cardano"], ["AVAX", "Avalanche"], ["DOT", "Polkadot"],
  ["LINK", "Chainlink"], ["LTC", "Litecoin"], ["BCH", "Bitcoin Cash"], ["SHIB", "Shiba Inu"], ["XLM", "Stellar"], ["ATOM", "Cosmos"], ["UNI", "Uniswap"], ["ETC", "Ethereum Classic"],
  ["NEAR", "NEAR"], ["APT", "Aptos"], ["ARB", "Arbitrum"], ["USDC", "USD Coin"]];
const COUNTIES = ["Stockholms", "Uppsala", "Södermanlands", "Östergötlands", "Jönköpings", "Kronobergs", "Kalmar", "Gotlands", "Blekinge", "Skåne", "Hallands", "Västra Götalands",
  "Värmlands", "Örebro", "Västmanlands", "Dalarnas", "Gävleborgs", "Västernorrlands", "Jämtlands", "Västerbottens", "Norrbottens"].map(n => `${n} län`);
const TOWNS = ["Stockholm", "Göteborg", "Malmö", "Uppsala", "Västerås", "Örebro", "Linköping", "Helsingborg", "Jönköping", "Norrköping", "Lund", "Umeå", "Gävle", "Borås",
  "Södertälje", "Eskilstuna", "Halmstad", "Växjö", "Karlstad", "Sundsvall", "Luleå", "Östersund", "Kalmar", "Visby", "Kiruna"];
const MODE_NAMES = { METRO: "Metro", BUS: "Bus", TRAIN: "Train", TRAM: "Tram", SHIP: "Boat", FERRY: "Boat" };
const PICKERS = {
  currencies: async () => { const nm = names("currency"); return cachedList("currencies", "https://open.er-api.com/v6/latest/USD", d => Object.keys(d.rates || {}).sort())
    .then(cs => cs.map(c => ({ value: c, label: `${c} – ${nm(c)}` }))); },
  countries: async () => cachedList("holiday_countries", "https://date.nager.at/api/v3/AvailableCountries", d => d.map(c => ({ value: c.countryCode, label: c.name }))),
  coins: async () => COINS.map(([value, name]) => ({ value, label: `${value} – ${name}` })),
  police: async () => [...TOWNS, ...COUNTIES].map(v => ({ value: v, label: v })),
  timezones: async () => (Intl.supportedValuesOf?.("timeZone") || []).map(z => ({ value: z, label: `${z.split("/").pop().replace(/_/g, " ")} (${z})` })),
  /* the lines that actually leave from the chosen stop in the next hour */
  sl_lines: async (q, p) => {
    if (!p?.stop?.value) return [];
    const d = await globalThis.fetchData({ url: `https://transport.integration.sl.se/v1/sites/${encodeURIComponent(p.stop.value)}/departures?forecast=60` });
    const seen = new Map();
    (d.departures || []).forEach(x => { const l = x.line?.designation; if (l && !seen.has(l)) seen.set(l, `${l} · ${MODE_NAMES[x.line.transport_mode] || ""} to ${x.destination}`.replace(" ·  to", " · to")); });
    return [...seen].sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true })).map(([value, label]) => ({ value, label }));
  },
  /* Wikipedia's own title search, for the article you mean */
  wiki_titles: async (q, p) => {
    if (!q || q.trim().length < 2) return [];
    const lang = /^[a-z]{2,3}$/.test(p?.lang) ? p.lang : "en";
    const d = await globalThis.fetchData({ url: `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q.trim())}&limit=8&namespace=0&format=json&origin=*` });
    return (d[1] || []).map(t => ({ value: t, label: t }));
  },
};
