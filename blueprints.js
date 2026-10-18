/*
  BEYOND_DASHBOARD — catalog
  ==========================
  Three things live here:

  1. PLACES      Quick-pick locations for any module with a "place" parameter.
  2. MODULES     Configurable widget types. The user picks *what* and *where*,
                 the module builds the API request.
  3. BLUEPRINTS  Ready-made widgets. Either a module with preset parameters
                 ({ mod, params }) or a raw API ({ url, path, display, ... }).

  Every API here is free, needs no key, and answers browser requests (CORS).

  Display types: stat | gauge | text | list | ticker | image | beacon | json | chart | history
    chart: path → array of points; xField: time/label field; yFields: field, or [{ y, label, unit, kind: line|area|bar, panel }];
           chart: line|area|bar; xFormat: hour|time|date|day|month; mark: min|max. Different units → separate panels.
    history: the widget's own recorded values over time (offered for every stat).
  Option fields a module choice can carry:
    unit, prefix, decimals, min, max, format (time|date|duration|compact|wmo), ok, warn,
    displays: which display types make sense, first one is the default

  Combined widgets: build() returns sources instead of url:
    { sources: { gold: { url, path }, fx: { url, path } }, calc: { kg: "gold * 32.15" }, value: "kg * fx",
      okIf, warnIf (beacon color), words: { ok, warn, bad } }. Expressions: js/engine.js (evalExpr), no eval.

  Local widgets (no API): a module whose build() returns { local: "todo" | "note" | "pomodoro" | "clock" | "radio" | "countdown" | "moon" | "progress" }.
    They are drawn by js/local.js and keep their content in beyond.local.v1, outside the board.

  Parameter types: choice | text | place | secret | search
    search: pick from a list fetched once (js/lookups.js SEARCHERS). Value: { value, label }.
    secret: an API key. Stored in the browser (beyond.keys), never in the board or share links.
            { key, label, type: "secret", optional?, help?: "https://where-to-get-one", store?: "shared-id" }
            Without a key the widget asks for one instead of calling the API (unless optional).
*/

(function () {
window.PLACES = [
  { name: "Stockholm", lat: 59.33, lon: 18.07, note: "Sweden" },
  { name: "South Pole", lat: -89.99, lon: 0, note: "Antarctica" },
  { name: "Sahara", lat: 23.4, lon: 12.0, note: "Niger/Libya border" },
  { name: "Mount Everest", lat: 27.988, lon: 86.925, note: "8,849 m" },
  { name: "Death Valley", lat: 36.46, lon: -116.87, note: "Hottest on record" },
  { name: "Oymyakon", lat: 63.46, lon: 142.79, note: "Coldest village" },
  { name: "Mawsynram", lat: 25.3, lon: 91.58, note: "Wettest place" },
  { name: "Atacama", lat: -24.5, lon: -69.25, note: "Driest desert" },
  { name: "Tromsø", lat: 69.65, lon: 18.96, note: "Aurora capital" },
  { name: "Svalbard", lat: 78.22, lon: 15.65, note: "Polar night" },
  { name: "Point Nemo", lat: -48.88, lon: -123.39, note: "Most remote ocean" },
  { name: "Nazaré", lat: 39.6, lon: -9.15, note: "Giant waves" },
];
const P = Object.fromEntries(window.PLACES.map(p => [p.name, p]));

const NUM = ["stat", "gauge"];
const meteo = (base, p, v) => `https://${base}?latitude=${p.place.lat}&longitude=${p.place.lon}&current=${v}`;

window.MODULES = [
  // ── SWEDEN ───────────────────────────────────────────────
  { id: "elpris", name: "Electricity price now", category: "sweden",
    desc: "Spot price for electricity in your bidding zone, updated every 15 minutes.",
    params: [
      { key: "zone", label: "Bidding zone", type: "choice", default: "SE3", options: [
        { value: "SE1", label: "SE1 Luleå" }, { value: "SE2", label: "SE2 Sundsvall" },
        { value: "SE3", label: "SE3 Stockholm" }, { value: "SE4", label: "SE4 Malmö" },
      ] },
      { key: "vat", label: "VAT", type: "choice", default: "ex", options: [
        { value: "ex", label: "Excl. VAT", scale: 100 }, { value: "inc", label: "Incl. VAT (25%)", scale: 125 },
      ] },
      { key: "show", label: "Show", type: "choice", default: "now", options: [
        { value: "now", label: "Now", displays: ["gauge", "stat"] }, { value: "day", label: "Whole day", displays: ["chart"] } ] },
    ],
    build: p => ({ name: `Electricity ${p.zone}${p.show === "day" ? " today" : ""}${p.vat === "inc" ? " incl. VAT" : ""}`, url: `https://www.elprisetjustnu.se/api/v1/prices/{YYYY}/{MM}-{DD}_${p.zone}.json`,
      unit: "öre/kWh", decimals: 1, min: 0, max: 300, refresh: 900,
      ...(p.show === "day" ? { path: "", xField: "time_start", yFields: "SEK_per_kWh", chart: "bar", xFormat: "hour", mark: "min", size: [3, 2] } : { path: "[now].SEK_per_kWh" }) }) },

  { id: "polisen", name: "Swedish police", category: "sweden",
    desc: "The latest police events, for all of Sweden or one county or town.",
    params: [
      { key: "place", label: "County or town", type: "text", default: "Stockholm", placeholder: "Leave empty for all of Sweden" },
    ],
    displays: ["list", "ticker"],
    build: p => ({ name: p.place ? `Police · ${p.place}` : "Police · all of Sweden",
      url: `https://polisen.se/api/events${p.place ? `?locationname=${encodeURIComponent(p.place)}` : ""}`, refresh: 600,
      transform: d => (Array.isArray(d) ? d : []).map(e => ({ when: String(e.datetime || "").replace(" ", "T").replace(" ", ""), what: e.type, where: String(e.name || "").split(",").pop().trim(), summary: e.summary })),
      path: "", item: "{when|countdown} · {what}, {where}: {summary}" }) },

  // ── WEATHER ──────────────────────────────────────────────
  { id: "weather", name: "Weather", category: "weather",
    desc: "Any weather reading, anywhere on Earth. Pick the metric and the place.",
    params: [
      { key: "metric", label: "Show", type: "choice", default: "temperature_2m", options: [
        { value: "temperature_2m", label: "Temperature", unit: "°C", decimals: 1, min: -40, max: 45, displays: NUM },
        { value: "apparent_temperature", label: "Feels like", unit: "°C", decimals: 1, min: -40, max: 45, displays: NUM },
        { value: "weather_code", label: "Conditions", format: "wmo", displays: ["text"] },
        { value: "wind_speed_10m", label: "Wind", unit: "km/h", decimals: 0, min: 0, max: 120, displays: NUM },
        { value: "wind_gusts_10m", label: "Gusts", unit: "km/h", decimals: 0, min: 0, max: 150, displays: NUM },
        { value: "relative_humidity_2m", label: "Humidity", unit: "%", decimals: 0, min: 0, max: 100, displays: ["gauge", "stat"] },
        { value: "uv_index", label: "UV index", unit: "UVI", decimals: 1, min: 0, max: 12, displays: ["gauge", "stat"] },
        { value: "cloud_cover", label: "Cloud cover", unit: "%", decimals: 0, min: 0, max: 100, displays: ["gauge", "stat"] },
        { value: "precipitation", label: "Precipitation", unit: "mm", decimals: 1, min: 0, max: 20, displays: NUM },
        { value: "snow_depth", label: "Snow depth", unit: "m", decimals: 2, min: 0, max: 3, displays: NUM },
        { value: "surface_pressure", label: "Air pressure", unit: "hPa", decimals: 0, min: 950, max: 1050, displays: NUM },
        { value: "dew_point_2m", label: "Dew point", unit: "°C", decimals: 1, min: -40, max: 30, displays: NUM },
        { value: "is_day", label: "Daylight", ok: [1], displays: ["beacon"] },
      ] },
      { key: "place", label: "Where", type: "place", default: P["Stockholm"] },
      { key: "src", label: "Source", type: "choice", default: "meteo", options: [
        { value: "meteo", label: "Open-Meteo" }, { value: "smhi", label: "SMHI (Nordics)" }, { value: "wttr", label: "wttr.in" } ] },
    ],
    build: (p, s) => {
      const name = `${s.metric.label} · ${p.place.name}`;
      /* SMHI and wttr.in only know some metrics; anything else stays on Open-Meteo. */
      const smhi = { temperature_2m: ["air_temperature"], wind_speed_10m: ["wind_speed", 3.6], wind_gusts_10m: ["wind_speed_of_gust", 3.6], relative_humidity_2m: ["relative_humidity"],
        precipitation: ["precipitation_amount_mean"], surface_pressure: ["air_pressure_at_mean_sea_level"] }[p.metric];
      const wttr = { temperature_2m: "temp_C", apparent_temperature: "FeelsLikeC", wind_speed_10m: "windspeedKmph", relative_humidity_2m: "humidity", cloud_cover: "cloudcover",
        precipitation: "precipMM", surface_pressure: "pressure", uv_index: "uvIndex" }[p.metric];
      if (p.src === "smhi" && smhi) return { name: `${name} · SMHI`, refresh: 1800, ...(smhi[1] ? { scale: smhi[1] } : {}),
        url: `https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${(+p.place.lon).toFixed(4)}/lat/${(+p.place.lat).toFixed(4)}/data.json`,
        transform: d => ({ now: (d.timeSeries || []).find(x => Date.parse(x.time) >= Date.now() - 30 * 60e3)?.data }), path: `now.${smhi[0]}` };
      if (p.src === "wttr" && wttr) return { name: `${name} · wttr.in`, refresh: 1800,
        url: `https://wttr.in/${(+p.place.lat).toFixed(3)},${(+p.place.lon).toFixed(3)}?format=j1`, path: `current_condition[0].${wttr}` };
      return { name, url: meteo("api.open-meteo.com/v1/forecast", p, p.metric), path: `current.${p.metric}` };
    } },

  { id: "air", name: "Air quality", category: "earth",
    desc: "Pollution, smog and pollen for any location.",
    params: [
      { key: "metric", label: "Show", type: "choice", default: "european_aqi", options: [
        { value: "european_aqi", label: "European AQI", unit: "AQI", decimals: 0, min: 0, max: 100, displays: ["gauge", "stat"] },
        { value: "us_aqi", label: "US AQI", unit: "AQI", decimals: 0, min: 0, max: 300, displays: ["gauge", "stat"] },
        { value: "pm2_5", label: "PM2.5", unit: "µg/m³", decimals: 0, min: 0, max: 250, displays: NUM },
        { value: "pm10", label: "PM10", unit: "µg/m³", decimals: 0, min: 0, max: 300, displays: NUM },
        { value: "ozone", label: "Ozone", unit: "µg/m³", decimals: 0, min: 0, max: 240, displays: NUM },
        { value: "birch_pollen", label: "Birch pollen (EU)", unit: "grains/m³", decimals: 0, min: 0, max: 500, displays: NUM },
        { value: "grass_pollen", label: "Grass pollen (EU)", unit: "grains/m³", decimals: 0, min: 0, max: 200, displays: NUM },
      ] },
      { key: "place", label: "Where", type: "place", default: P["Stockholm"] },
    ],
    build: (p, s) => ({ name: `${s.metric.label} · ${p.place.name}`, url: meteo("air-quality-api.open-meteo.com/v1/air-quality", p, p.metric), path: `current.${p.metric}` }) },

  { id: "ocean", name: "Ocean", category: "weather",
    desc: "Waves and sea temperature. Pick a spot at sea or on the coast.",
    params: [
      { key: "metric", label: "Show", type: "choice", default: "wave_height", options: [
        { value: "wave_height", label: "Wave height", unit: "m", decimals: 1, min: 0, max: 12, displays: ["gauge", "stat"] },
        { value: "swell_wave_height", label: "Swell", unit: "m", decimals: 1, min: 0, max: 10, displays: ["gauge", "stat"] },
        { value: "wave_period", label: "Wave period", unit: "s", decimals: 1, min: 0, max: 20, displays: NUM },
        { value: "sea_surface_temperature", label: "Sea temperature", unit: "°C", decimals: 1, min: -2, max: 32, displays: NUM },
      ] },
      { key: "place", label: "Where", type: "place", default: P["Point Nemo"] },
    ],
    build: (p, s) => ({ name: `${s.metric.label} · ${p.place.name}`, url: meteo("marine-api.open-meteo.com/v1/marine", p, p.metric), path: `current.${p.metric}` }) },

  { id: "sun", name: "Sun", category: "weather",
    desc: "Sunrise, sunset and hours of daylight anywhere.",
    params: [
      { key: "metric", label: "Show", type: "choice", default: "day_length", options: [
        { value: "sunrise", label: "Sunrise", format: "time", displays: ["stat"] },
        { value: "sunset", label: "Sunset", format: "time", displays: ["stat"] },
        { value: "solar_noon", label: "Solar noon", format: "time", displays: ["stat"] },
        { value: "day_length", label: "Daylight", format: "duration", displays: ["stat"] },
      ] },
      { key: "place", label: "Where", type: "place", default: P["Stockholm"] },
    ],
    build: (p, s) => ({ name: `${s.metric.label} · ${p.place.name}`, url: `https://api.sunrise-sunset.org/json?lat=${p.place.lat}&lng=${p.place.lon}&formatted=0`, path: `results.${p.metric}` }) },

  // ── SPACE ────────────────────────────────────────────────
  { id: "iss", name: "Space station", category: "space",
    desc: "Live telemetry from the ISS.",
    params: [
      { key: "metric", label: "Show", type: "choice", default: "velocity", options: [
        { value: "velocity", label: "Speed", unit: "km/h", decimals: 0, min: 27000, max: 28000, displays: NUM },
        { value: "altitude", label: "Altitude", unit: "km", decimals: 1, min: 370, max: 460, displays: ["gauge", "stat"] },
        { value: "visibility", label: "In sunlight?", ok: ["daylight"], displays: ["beacon"] },
        { value: "latitude", label: "Latitude", unit: "°", decimals: 2, min: -52, max: 52, displays: NUM },
        { value: "longitude", label: "Longitude", unit: "°", decimals: 2, min: -180, max: 180, displays: NUM },
      ] },
    ],
    build: (p, s) => ({ name: `ISS ${s.metric.label.toLowerCase()}`, url: "https://api.wheretheiss.at/v1/satellites/25544", path: p.metric, refresh: 15 }) },

  // ── MONEY ────────────────────────────────────────────────
  { id: "crypto", name: "Crypto price", category: "money",
    desc: "Spot price for any coin Coinbase lists.",
    params: [
      { key: "coin", label: "Coin", type: "text", default: "BTC", placeholder: "BTC, ETH, SOL, DOGE…", upper: true },
      { key: "fiat", label: "In", type: "choice", default: "USD", options: [
        { value: "USD", label: "USD", prefix: "$" }, { value: "EUR", label: "EUR", prefix: "€" },
        { value: "SEK", label: "SEK", unit: "kr" }, { value: "GBP", label: "GBP", prefix: "£" },
      ] },
    ],
    displays: ["stat"],
    build: p => ({ name: `${p.coin} in ${p.fiat}`, url: `https://api.coinbase.com/v2/prices/${encodeURIComponent(p.coin)}-${p.fiat}/spot`, path: "data.amount", refresh: 60 }) },

  { id: "fx", name: "Exchange rate", category: "money",
    desc: "What one unit of a currency buys in another.",
    params: [
      { key: "from", label: "From", type: "text", default: "EUR", placeholder: "EUR", upper: true },
      { key: "to", label: "To", type: "text", default: "SEK", placeholder: "SEK", upper: true },
    ],
    displays: ["stat"],
    build: p => ({ name: `${p.from} → ${p.to}`, url: `https://open.er-api.com/v6/latest/${encodeURIComponent(p.from)}`, path: `rates.${p.to}`, unit: p.to, decimals: 3, refresh: 3600 }) },

  // ── DEV ──────────────────────────────────────────────────
  { id: "status", name: "Service status", category: "dev",
    desc: "Green, yellow or red for the services your day depends on.",
    params: [
      { key: "service", label: "Service", type: "choice", default: "www.githubstatus.com", options: [
        { value: "www.githubstatus.com", label: "GitHub" }, { value: "status.claude.com", label: "Claude" },
        { value: "status.openai.com", label: "OpenAI" }, { value: "www.cloudflarestatus.com", label: "Cloudflare" },
        { value: "www.vercel-status.com", label: "Vercel" }, { value: "www.netlifystatus.com", label: "Netlify" },
        { value: "status.render.com", label: "Render" }, { value: "status.digitalocean.com", label: "DigitalOcean" },
        { value: "status.npmjs.org", label: "npm" }, { value: "status.figma.com", label: "Figma" },
        { value: "status.atlassian.com", label: "Atlassian" }, { value: "status.dropbox.com", label: "Dropbox" },
        { value: "status.twilio.com", label: "Twilio" }, { value: "www.redditstatus.com", label: "Reddit" },
      ] },
    ],
    displays: ["beacon"],
    build: (p, s) => ({ name: `${s.service.label} status`, url: `https://${p.service}/api/v2/status.json`, path: "status.indicator", ok: ["none"], warn: ["minor"], refresh: 120 }) },

  /* ── Personal: no API. Content lives on this device (beyond.local.v1) and never in share links. */
  { id: "forecast", name: "Weather forecast", category: "weather",
    desc: "The next one or two days, hour by hour, for any place.",
    params: [
      { key: "show", label: "Show", type: "choice", default: "temp", options: [
        { value: "temp", label: "Temperature and rain" }, { value: "wind", label: "Wind and gusts" } ] },
      { key: "hours", label: "Next", type: "choice", default: "48", options: [{ value: "24", label: "24 hours" }, { value: "48", label: "48 hours" }] },
      { key: "place", label: "Where", type: "place", default: P["Stockholm"] },
    ],
    displays: ["chart"],
    build: p => ({ name: `${p.show === "temp" ? "Forecast" : "Wind"} · ${p.place.name}`, size: [4, 2], refresh: 1800, decimals: 1,
      url: `https://api.open-meteo.com/v1/forecast?latitude=${p.place.lat}&longitude=${p.place.lon}&hourly=${p.show === "temp" ? "temperature_2m,precipitation" : "wind_speed_10m,wind_gusts_10m"}&forecast_hours=${p.hours}&timezone=auto`,
      transform: d => ({ hours: (d.hourly?.time || []).map((t, i) => ({ t, a: d.hourly[p.show === "temp" ? "temperature_2m" : "wind_speed_10m"][i], b: d.hourly[p.show === "temp" ? "precipitation" : "wind_gusts_10m"][i] })) }),
      path: "hours", xField: "t", xFormat: "hour",
      yFields: p.show === "temp" ? [{ y: "a", label: "Temperature", unit: "°C" }, { y: "b", label: "Rain", unit: "mm", kind: "bar", panel: 1 }]
        : [{ y: "a", label: "Wind", unit: "km/h" }, { y: "b", label: "Gusts", unit: "km/h" }] }) },

  { id: "coin_chart", name: "Crypto chart", category: "money",
    desc: "A coin's price over the last day, week, month or quarter (CoinGecko).",
    params: [
      { key: "coin", label: "Coin", type: "choice", default: "bitcoin", options: [
        { value: "bitcoin", label: "Bitcoin" }, { value: "ethereum", label: "Ethereum" }, { value: "solana", label: "Solana" },
        { value: "ripple", label: "XRP" }, { value: "dogecoin", label: "Dogecoin" }, { value: "cardano", label: "Cardano" } ] },
      { key: "days", label: "Over the last", type: "choice", default: "7", options: [
        { value: "1", label: "Day" }, { value: "7", label: "Week" }, { value: "30", label: "Month" }, { value: "90", label: "Quarter" } ] },
      { key: "fiat", label: "In", type: "choice", default: "usd", options: [{ value: "usd", label: "USD" }, { value: "eur", label: "EUR" }, { value: "sek", label: "SEK" }] },
    ],
    displays: ["chart"],
    build: (p, s) => ({ name: `${s.coin.label} · ${s.days.label.toLowerCase()}`, size: [3, 2], refresh: 900,
      url: `https://api.coingecko.com/api/v3/coins/${p.coin}/market_chart?vs_currency=${p.fiat}&days=${p.days}`,
      transform: d => ({ prices: (d.prices || []).map(([t, v]) => ({ t, v })) }),
      path: "prices", xField: "t", yFields: [{ y: "v", label: s.coin.label, unit: p.fiat.toUpperCase() }], chart: "line", mark: "max" }) },

  { id: "wiki_views", name: "Wikipedia page views", category: "knowledge",
    desc: "How many people read an article each day: a hype meter for anything.",
    params: [
      { key: "article", label: "Article", type: "text", default: "Taylor Swift", placeholder: "Exact article title" },
      { key: "lang", label: "Wikipedia", type: "choice", default: "en", options: [
        { value: "en", label: "English" }, { value: "sv", label: "Svenska" }, { value: "de", label: "Deutsch" }, { value: "fr", label: "Français" } ] },
      { key: "days", label: "Over the last", type: "choice", default: "30", options: [{ value: "30", label: "30 days" }, { value: "90", label: "90 days" }] },
    ],
    displays: ["chart"],
    build: p => ({ name: `${p.article} · views`, size: [3, 2], refresh: 21600,
      url: `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${p.lang}.wikipedia/all-access/user/${encodeURIComponent(p.article.trim().replace(/ /g, "_"))}/daily/{ymd:-${p.days}}/{ymd:-1}`,
      path: "items", xField: "timestamp", yFields: [{ y: "views", label: "Views", unit: "" }], chart: "area", mark: "max", xFormat: "date" }) },

  /* ── News, sport, social */
  { id: "rss", name: "News feed (RSS)", category: "knowledge",
    desc: "Headlines from any RSS or Atom feed. Ekot and the New York Times work as is; most other sites need your own proxy.",
    params: [
      { key: "feed", label: "Feed", type: "choice", default: "https://api.sr.se/api/rss/program/83", options: [
        { value: "https://api.sr.se/api/rss/program/83", label: "Ekot" },
        { value: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", label: "NYT front page" },
        { value: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", label: "NYT world" },
        { value: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", label: "NYT tech" },
        { value: "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml", label: "NYT science" },
        { value: "custom", label: "Other feed" } ] },
      { key: "url", label: "Feed URL (for Other feed)", type: "text", default: "", placeholder: "https://example.com/feed.xml" },
      { key: "proxy", label: "CORS proxy", type: "secret", optional: true, store: "cors_proxy", placeholder: "https://your-proxy.workers.dev", help: "https://github.com/Rydenjesper/Beyond-Dashboard#rss-feeds-and-the-proxy" },
    ],
    displays: ["list", "ticker", "text"],
    build: (p, s, display) => {
      const feed = p.feed === "custom" ? (/^https:\/\//.test(p.url.trim()) ? p.url.trim() : "https://api.sr.se/api/rss/program/83") : p.feed;
      const url = p.proxy && /^https:\/\//.test(p.proxy) ? `${p.proxy.replace(/\/+$/, "")}/?url=${encodeURIComponent(feed)}` : feed;
      return { name: p.feed === "custom" ? host(feed) || "News" : s.feed.label, url, refresh: 900, proxyHint: true,
        ...(display === "text" ? { path: "items[0].title" } : { path: "items", item: "{title}" }) };
    } },

  { id: "espn", name: "Live scores", category: "sport",
    desc: "Today's matches and results from ESPN: Allsvenskan, Premier League, Champions League, NHL, NBA, NFL and more.",
    params: [{ key: "league", label: "League", type: "choice", default: "soccer/swe.1", options: [
      ["soccer/swe.1", "Allsvenskan"], ["soccer/eng.1", "Premier League"], ["soccer/esp.1", "La Liga"], ["soccer/ger.1", "Bundesliga"], ["soccer/ita.1", "Serie A"],
      ["soccer/uefa.champions", "Champions League"], ["hockey/nhl", "NHL"], ["basketball/nba", "NBA"], ["football/nfl", "NFL"]].map(([value, label]) => ({ value, label })) }],
    displays: ["list", "ticker"],
    build: (p, s) => ({ name: s.league.label, url: `https://site.api.espn.com/apis/site/v2/sports/${p.league}/scoreboard`, refresh: 120,
      transform: d => ({ games: (d.events || []).map(e => { const c = e.competitions?.[0] || {}, t = side => c.competitors?.find(x => x.homeAway === side) || {}, h = t("home"), a = t("away"), st = e.status?.type || {};
        return { line: st.state === "pre" ? `${h.team?.shortDisplayName} – ${a.team?.shortDisplayName}` : `${h.team?.shortDisplayName} ${h.score}–${a.score} ${a.team?.shortDisplayName}`,
          status: st.state === "pre" ? fmt(e.date, { format: "time" }) : st.shortDetail || "" }; }) }),
      path: "games", item: "{line} · {status}" }) },

  { id: "bluesky", name: "Bluesky followers", category: "fun",
    desc: "Follower count for any Bluesky account, with its history over time.",
    params: [{ key: "handle", label: "Handle", type: "text", default: "bsky.app", placeholder: "name.bsky.social" }],
    displays: ["stat"],
    build: p => { const h = p.handle.trim().replace(/^@/, "");
      return { name: `@${h}`, url: `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(h)}`, path: "followersCount", format: "compact", unit: "followers", refresh: 1800 }; } },

  /* ── Economy */
  { id: "ecb", name: "ECB interest rate", category: "money",
    desc: "The European Central Bank's key rates, now or over the last two years.",
    params: [
      { key: "rate", label: "Rate", type: "choice", default: "DFR", options: [
        { value: "DFR", label: "Deposit facility" }, { value: "MRR_FR", label: "Main refinancing" }, { value: "MLFR", label: "Marginal lending" } ] },
      { key: "show", label: "Show", type: "choice", default: "now", options: [
        { value: "now", label: "Now", displays: ["stat"] }, { value: "chart", label: "Two years", displays: ["chart"] } ] },
    ],
    build: (p, s) => ({ name: `ECB ${s.rate.label.toLowerCase()} rate`, unit: "%", decimals: 2, refresh: 21600,
      url: `https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.${p.rate}.LEV?${p.show === "now" ? "lastNObservations=1" : "startPeriod={date:-730}"}&format=jsondata`,
      transform: d => { const obs = Object.values(d.dataSets?.[0]?.series || {})[0]?.observations || {}, days = d.structure?.dimensions?.observation?.[0]?.values || [];
        const pts = Object.entries(obs).map(([i, v]) => ({ t: days[+i]?.id, v: v[0] })).filter(x => x.t && x.v != null);
        return { points: pts.filter((x, i) => i % 7 === 0 || i === pts.length - 1 || x.v !== pts[i - 1]?.v) }; },   // weekly, plus every change
      ...(p.show === "now" ? { path: "points[-1].v" } : { path: "points", xField: "t", yFields: [{ y: "v", label: "Rate", unit: "%" }], chart: "line", size: [3, 2] }) }) },

  { id: "eurostat", name: "Inflation and unemployment", category: "money",
    desc: "Eurostat figures for any EU country: annual inflation (HICP) or the unemployment rate, monthly.",
    params: [
      { key: "what", label: "Show", type: "choice", default: "infl", options: [{ value: "infl", label: "Inflation" }, { value: "unemp", label: "Unemployment" }] },
      { key: "geo", label: "Country", type: "choice", default: "SE", options: [
        ["EU27_2020", "EU"], ["EA20", "Euro area"], ["SE", "Sweden"], ["DK", "Denmark"], ["FI", "Finland"], ["DE", "Germany"], ["FR", "France"],
        ["ES", "Spain"], ["IT", "Italy"], ["NL", "Netherlands"], ["PL", "Poland"], ["NO", "Norway"]].map(([value, label]) => ({ value, label })) },
      { key: "show", label: "As", type: "choice", default: "chart", options: [
        { value: "chart", label: "Last two years", displays: ["chart"] }, { value: "now", label: "Latest", displays: ["stat"] } ] },
    ],
    build: (p, s) => ({ name: `${p.what === "infl" ? "Inflation" : "Unemployment"} · ${s.geo.label}`, unit: "%", decimals: 1, refresh: 43200,
      url: `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${p.what === "infl" ? "prc_hicp_manr?coicop=CP00" : "une_rt_m?s_adj=SA&age=TOTAL&sex=T&unit=PC_ACT"}&geo=${p.geo === "EA20" ? (p.what === "infl" ? "EA" : "EA21") : p.geo}&lastTimePeriod=24`,
      transform: d => ({ points: Object.entries(d.dimension?.time?.category?.index || {}).sort((a, b) => a[1] - b[1]).map(([t, i]) => ({ t: `${t}-01`, v: d.value?.[i] })).filter(x => x.v != null) }),
      ...(p.show === "now" ? { path: "points[-1].v" } : { path: "points", xField: "t", yFields: [{ y: "v", label: p.what === "infl" ? "Inflation" : "Unemployment", unit: "%" }], chart: p.what === "infl" ? "bar" : "line", xFormat: "month", size: [3, 2] }) }) },

  { id: "stocks", name: "Stocks and oil", category: "money",
    desc: "Share prices and oil from Alpha Vantage. Needs your own free key (25 calls a day, so it refreshes hourly).",
    params: [
      { key: "what", label: "Show", type: "choice", default: "quote", options: [{ value: "quote", label: "A stock" }, { value: "WTI", label: "Oil (WTI)" }, { value: "BRENT", label: "Oil (Brent)" }] },
      { key: "symbol", label: "Ticker", type: "text", default: "IBM", placeholder: "AAPL, MSFT, VOLV-B.ST…", upper: true },
      { key: "key", label: "Alpha Vantage key", type: "secret", help: "https://www.alphavantage.co/support/#api-key", store: "alphavantage" },
    ],
    displays: ["stat"],
    build: p => { const av = d => { if (d.Information || d.Note || d["Error Message"]) throw new Error(`Alpha Vantage: ${d.Information || d.Note || d["Error Message"]}`); return d; };
      return p.what === "quote"
      ? { name: p.symbol, url: `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(p.symbol)}&apikey=${encodeURIComponent(p.key)}`, refresh: 3600, decimals: 2,
          transform: d => ({ price: av(d)["Global Quote"]?.["05. price"] }), path: "price" }
      : { name: `Oil · ${p.what}`, url: `https://www.alphavantage.co/query?function=${p.what}&interval=daily&apikey=${encodeURIComponent(p.key)}`, refresh: 3600, decimals: 2, unit: "$/bbl",
          transform: av, path: "data[0].value" }; } },

  /* ── Sweden: energy and warnings */
  { id: "svk", name: "Sweden's electricity use", category: "sweden",
    desc: "National consumption today from Svenska kraftnät: the forecast against what actually happened, hour by hour.",
    params: [{ key: "area", label: "Area", type: "choice", default: "SE", options: [
      { value: "SE", label: "All of Sweden" }, { value: "SE1", label: "SE1" }, { value: "SE2", label: "SE2" }, { value: "SE3", label: "SE3" }, { value: "SE4", label: "SE4" } ] }],
    displays: ["chart"],
    build: (p, s) => ({ name: `Electricity use · ${s.area.label}`, size: [4, 2], refresh: 900, decimals: 0,
      url: `https://www.svk.se/services/controlroom/v2/situation?date={YYYY}-{MM}-{DD}&biddingArea=${p.area}`,
      transform: d => { const by = id => Object.fromEntries((d.Data || []).find(x => x.id === id)?.data.map(o => [o.x, o.y]) || []), plan = by("planned"), real = by("result");
        return { hours: [...new Set([...Object.keys(plan), ...Object.keys(real)])].map(Number).sort((a, b) => a - b).map(t => ({ t, plan: plan[t], real: real[t] })) }; },
      path: "hours", xField: "t", xFormat: "hour", yFields: [{ y: "real", label: "Actual", unit: "MW" }, { y: "plan", label: "Forecast", unit: "MW" }] }) },

  { id: "smhi_warn", name: "SMHI weather warnings", category: "sweden",
    desc: "Active warnings from SMHI for your county: wind, rain, snow, fire risk, high water. Green when there are none.",
    params: [
      { key: "county", label: "County", type: "choice", default: "all", options: [{ value: "all", label: "All of Sweden" }, ...["Stockholms", "Uppsala", "Södermanlands", "Östergötlands", "Jönköpings", "Kronobergs", "Kalmar", "Gotlands", "Blekinge", "Skåne", "Hallands", "Västra Götalands", "Värmlands", "Örebro", "Västmanlands", "Dalarnas", "Gävleborgs", "Västernorrlands", "Jämtlands", "Västerbottens", "Norrbottens"].map(n => ({ value: `${n} län`, label: n.replace(/s$/, "").replace(/^Skåne$/, "Skåne") }))] },
      { key: "show", label: "Show", type: "choice", default: "light", options: [{ value: "light", label: "Status light", displays: ["beacon"] }, { value: "list", label: "List", displays: ["list"] }] },
    ],
    build: (p, s) => {
      const LV = { MESSAGE: 1, YELLOW: 2, ORANGE: 3, RED: 4 };
      const transform = d => ({ items: (Array.isArray(d) ? d : []).flatMap(w => (w.warningAreas || [])
        .filter(a => p.county === "all" || (a.affectedAreas || []).some(x => x.sv === p.county) || a.areaName?.sv === p.county)
        .map(a => ({ level: a.warningLevel?.en || "", n: LV[a.warningLevel?.code] || 0, event: a.eventDescription?.en || w.event?.en || "", area: a.areaName?.sv || "" })))
        .sort((a, b) => b.n - a.n) });
      const name = `SMHI warnings · ${s.county.label}`, url = "https://opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json";
      return p.show === "list" ? { name, url, transform, path: "items", item: "{level} · {event} · {area}", refresh: 900 }
        : { name, refresh: 900, sources: { w: { url, path: "items", transform } },
            calc: { worst: "max(0, w[*].n)", many: "count(w[*].n)" },
            okIf: "worst <= 1", warnIf: "worst == 2",
            value: `if(many == 0, "No warnings", if(worst <= 1, many + " notice" + if(many == 1, "", "s"), w[0].level + ": " + w[0].event))`,
            words: { ok: "No warnings", warn: "Yellow warning", bad: "Warning" } };
    } },

  /* ── Combined: several sources, one answer. Sources load in parallel through the shared cache. */
  { id: "metal", name: "Gold and silver", category: "money",
    desc: "Live metal prices in your currency, per gram, ounce or kilo. Combines gold-api.com with today's exchange rate.",
    params: [
      { key: "metal", label: "Metal", type: "choice", default: "XAU", options: [
        { value: "XAU", label: "Gold" }, { value: "XAG", label: "Silver" }, { value: "XPT", label: "Platinum" }, { value: "XPD", label: "Palladium" } ] },
      { key: "cur", label: "In", type: "choice", default: "SEK", options: [
        { value: "SEK", label: "SEK", unit: "kr" }, { value: "EUR", label: "EUR", prefix: "€" }, { value: "USD", label: "USD", prefix: "$" }, { value: "NOK", label: "NOK", unit: "kr" } ] },
      { key: "per", label: "Per", type: "choice", default: "g", options: [
        { value: "g", label: "Gram" }, { value: "oz", label: "Troy ounce" }, { value: "kg", label: "Kilo" } ] },
    ],
    displays: ["stat"],
    build: (p, s) => ({ name: `${s.metal.label} · ${p.cur}/${p.per}`, refresh: 600,
      sources: { m: { url: `https://api.gold-api.com/price/${p.metal}`, path: "price" }, fx: { url: "https://open.er-api.com/v6/latest/USD", path: `rates.${p.cur}` } },
      value: `m * fx${{ g: " / 31.1035", oz: "", kg: " * 32.1507" }[p.per]}` }) },

  { id: "aurora", name: "Northern lights tonight?", category: "space",
    desc: "Green when the aurora is strong enough, the sky is clear and it's dark where you are. Kp from NOAA, clouds from Open-Meteo.",
    params: [{ key: "place", label: "Where", type: "place", default: P["Tromsø"] }],
    displays: ["beacon"],
    build: p => ({ name: `Aurora · ${p.place.name}`, refresh: 600,
      sources: { kp: { url: "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json", path: "[-1].estimated_kp" },
        sky: { url: `https://api.open-meteo.com/v1/forecast?latitude=${p.place.lat}&longitude=${p.place.lon}&current=cloud_cover,is_day`, path: "current" } },
      calc: { clouds: "sky.cloud_cover", dark: "sky.is_day == 0", strong: "kp >= 4" },
      okIf: "strong and clouds < 40 and dark", warnIf: "strong + (clouds < 40) + dark >= 2",
      value: `if(not strong, "Kp " + round(kp, 1) + ", too low", if(clouds >= 40, round(clouds) + "% cloud cover", if(not dark, "Kp " + round(kp, 1) + ", but it's still light", "Kp " + round(kp, 1) + ", clear and dark")))`,
      words: { ok: "Look up!", warn: "Maybe", bad: "Not now" } }) },

  { id: "iss_far", name: "How far is the ISS?", category: "space",
    desc: "The space station's distance from you, along the ground, right now.",
    params: [{ key: "place", label: "From", type: "place", default: P["Stockholm"] }],
    displays: ["stat", "history"],
    build: p => ({ name: `ISS from ${p.place.name}`, refresh: 30, unit: "km", decimals: 0,
      sources: { iss: { url: "https://api.wheretheiss.at/v1/satellites/25544", path: "" } },
      value: `distance(iss.latitude, iss.longitude, ${+p.place.lat}, ${+p.place.lon})` }) },

  { id: "vs_pole", name: "Home vs the South Pole", category: "weather",
    desc: "How much warmer (it's always warmer) your place is than the South Pole right now.",
    params: [{ key: "place", label: "Where", type: "place", default: P["Stockholm"] }],
    displays: ["text"],
    build: p => { const name = String(p.place.name).replace(/["\\]/g, "");
      return { name: `${name} vs the South Pole`, refresh: 1800,
        sources: { here: { url: `https://api.open-meteo.com/v1/forecast?latitude=${p.place.lat}&longitude=${p.place.lon}&current=temperature_2m`, path: "current.temperature_2m" },
          pole: { url: "https://api.open-meteo.com/v1/forecast?latitude=-89.99&longitude=0&current=temperature_2m", path: "current.temperature_2m" } },
        value: `"It's " + round(abs(here - pole)) + " °C " + if(here >= pole, "warmer", "colder") + " in ${name} than at the South Pole."` }; } },

  { id: "el_cheap", name: "Is electricity cheap now?", category: "sweden",
    desc: "This quarter-hour's price against today's average in your zone. Green when it's at least 10% cheaper.",
    params: [{ key: "zone", label: "Bidding zone", type: "choice", default: "SE3", options: [
      { value: "SE1", label: "SE1 Luleå" }, { value: "SE2", label: "SE2 Sundsvall" }, { value: "SE3", label: "SE3 Stockholm" }, { value: "SE4", label: "SE4 Malmö" } ] }],
    displays: ["beacon"],
    build: p => ({ name: `Cheap power? ${p.zone}`, refresh: 300,
      sources: { p: { url: `https://www.elprisetjustnu.se/api/v1/prices/{YYYY}/{MM}-{DD}_${p.zone}.json`, path: "" } },
      calc: { now: "p[now].SEK_per_kWh * 100", avg: "avg(p[*].SEK_per_kWh) * 100", diff: "(1 - now / avg) * 100" },
      okIf: "diff >= 10", warnIf: "diff > -10",
      value: `if(diff >= 0, round(diff) + "% cheaper", round(-diff) + "% pricier") + " than today's average · " + round(now, 1) + " öre/kWh"`,
      words: { ok: "Cheap now", warn: "Average", bad: "Expensive now" } }) },

  { id: "btc_mood", name: "Bitcoin and market mood", category: "money",
    desc: "Bitcoin's price in your currency next to the Fear & Greed index.",
    params: [{ key: "cur", label: "In", type: "choice", default: "SEK", options: [
      { value: "SEK", label: "SEK" }, { value: "EUR", label: "EUR" }, { value: "USD", label: "USD" } ] }],
    displays: ["text"],
    build: p => ({ name: `Bitcoin · ${p.cur} and mood`, refresh: 120,
      sources: { b: { url: `https://api.coinbase.com/v2/prices/BTC-${p.cur}/spot`, path: "data.amount" }, f: { url: "https://api.alternative.me/fng/", path: "data[0]" } },
      value: `format(b, 0) + " ${p.cur} · " + f.value_classification + " (" + f.value + ")"` }) },

  { id: "umbrella", name: "Umbrella for the bus?", category: "traffic",
    desc: "Your next SL departure and whether it will rain in the next hour.",
    params: [
      { key: "stop", label: "Stop", type: "search", search: "sl_sites", default: { value: "9192", label: "Slussen" }, placeholder: "Search a stop…" },
      { key: "line", label: "Line", type: "text", default: "", placeholder: "Any line, or e.g. 4" },
      { key: "place", label: "Rain where", type: "place", default: P["Stockholm"] },
    ],
    displays: ["text"],
    build: p => ({ name: `${p.stop.label}: umbrella?`, refresh: 60,
      sources: { d: { url: `https://transport.integration.sl.se/v1/sites/${encodeURIComponent(p.stop.value)}/departures?forecast=60${/^\w{1,6}$/.test(p.line.trim()) ? `&line=${p.line.trim()}` : ""}`, path: "departures[0]" },
        rain: { url: `https://api.open-meteo.com/v1/forecast?latitude=${p.place.lat}&longitude=${p.place.lon}&minutely_15=precipitation&forecast_minutely_15=4`, path: "minutely_15.precipitation" } },
      value: `d.line.designation + " " + d.destination + " " + if(d.display == "Nu", "now", if(d.state == "CANCELLED", "cancelled", d.display)) + " · " + if(sum(rain) > 0.2, "take an umbrella", "no umbrella needed")` }) },

  { id: "brief", name: "Morning brief", category: "knowledge",
    desc: "Weather at home, the next public holiday, the next rocket launch and the electricity price, in one card.",
    params: [
      { key: "place", label: "Home", type: "place", default: P["Stockholm"] },
      { key: "zone", label: "Electricity zone", type: "choice", default: "SE3", options: [
        { value: "none", label: "Skip" }, { value: "SE1", label: "SE1" }, { value: "SE2", label: "SE2" }, { value: "SE3", label: "SE3" }, { value: "SE4", label: "SE4" } ] },
      { key: "country", label: "Holidays in", type: "text", default: "SE", placeholder: "SE, NO, DE…", upper: true },
    ],
    displays: ["text"],
    build: p => { const cc = /^[A-Z]{2}$/.test(p.country) ? p.country : "SE";
      return { name: "Morning brief", refresh: 1800, size: [4, 1],
        sources: { w: { url: `https://api.open-meteo.com/v1/forecast?latitude=${p.place.lat}&longitude=${p.place.lon}&current=temperature_2m,weather_code`, path: "current" },
          h: { url: `https://date.nager.at/api/v3/NextPublicHolidays/${cc}`, path: "[0]" },
          l: { url: "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=10&mode=list&hide_recent_previous=true", path: "results[0]" },
          ...(p.zone !== "none" ? { e: { url: `https://www.elprisetjustnu.se/api/v1/prices/{YYYY}/{MM}-{DD}_${p.zone}.json`, path: "[now].SEK_per_kWh" } } : {}) },
        value: `round(w.temperature_2m) + "° and " + weather(w.weather_code) + " · " + h.localName + " " + countdown(h.date) + " · " + l.name + " " + countdown(l.net)${p.zone !== "none" ? ` + " · power " + round(e * 100) + " öre"` : ""}` }; } },

  { id: "todo", name: "To-do list", category: "personal", desc: "Add, tick off, drag to reorder. Each list keeps its own tasks.",
    params: [{ key: "title", label: "List name", type: "text", default: "To do", placeholder: "Groceries, This week…" }],
    displays: ["local"], build: p => ({ name: p.title || "To do", local: "todo", size: [2, 2] }) },
  { id: "note", name: "Note", category: "personal", desc: "A scratchpad with simple formatting: # heading, **bold**, - lists.",
    params: [{ key: "title", label: "Name", type: "text", default: "Note" }],
    displays: ["local"], build: p => ({ name: p.title || "Note", local: "note", size: [2, 2] }) },
  { id: "pomodoro", name: "Pomodoro timer", category: "personal", desc: "Focus and break intervals with a chime. Shows the time left in the tab title.",
    params: [
      { key: "work", label: "Focus", type: "choice", default: "25", options: ["15", "20", "25", "30", "45", "50"].map(v => ({ value: v, label: `${v} min` })) },
      { key: "brk", label: "Break", type: "choice", default: "5", options: ["3", "5", "10", "15"].map(v => ({ value: v, label: `${v} min` })) },
    ],
    displays: ["local"], build: p => ({ name: "Pomodoro", local: "pomodoro", work: +p.work, brk: +p.brk, size: [2, 2] }) },
  { id: "countdown", name: "Countdown", category: "personal", desc: "Days left until something you're looking forward to.",
    params: [
      { key: "title", label: "Until", type: "text", default: "Christmas Eve", placeholder: "Vacation, launch day…" },
      { key: "date", label: "Date", type: "text", default: "12-24", placeholder: "2026-07-01, or 12-24 for every year" },
    ],
    displays: ["local"], build: p => ({ name: p.title || "Countdown", local: "countdown", date: String(p.date || "").trim(), size: [2, 1] }) },
  { id: "moon", name: "Moon phase", category: "personal", desc: "Tonight's moon, worked out on your device. No API needed.",
    params: [], displays: ["local"], build: () => ({ name: "Moon", local: "moon", size: [2, 1] }) },
  { id: "progress", name: "Time passing", category: "personal", desc: "How much of the year, month, week or day has gone.",
    params: [{ key: "of", label: "Of the", type: "choice", default: "year", options: [
      { value: "year", label: "Year" }, { value: "month", label: "Month" }, { value: "week", label: "Week" }, { value: "day", label: "Day" } ] }],
    displays: ["local"], build: (p, s) => ({ name: `${s.of.label} so far`, local: "progress", of: p.of, size: [2, 2] }) },
  { id: "clock", name: "Clock", category: "personal", desc: "Your time, plus any other time zones you care about.",
    params: [
      { key: "zones", label: "Other time zones", type: "text", default: "America/New_York, Asia/Tokyo", placeholder: "Europe/London, America/Los_Angeles" },
      { key: "h12", label: "Format", type: "choice", default: "24", options: [{ value: "24", label: "24-hour" }, { value: "12", label: "12-hour" }] },
    ],
    displays: ["local"], build: p => ({ name: "Clock", local: "clock", zones: String(p.zones || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 8), h12: p.h12 === "12", size: [2, 2] }) },

  { id: "sl", name: "SL departures", category: "traffic",
    desc: "Live departures from any SL stop in Stockholm: metro, bus, commuter train, tram and boat.",
    params: [
      { key: "stop", label: "Stop", type: "search", search: "sl_sites", default: { value: "9192", label: "Slussen" }, placeholder: "Search a stop…" },
      { key: "mode", label: "Only", type: "choice", default: "all", options: [
        { value: "all", label: "Everything" }, { value: "METRO", label: "Metro" }, { value: "BUS", label: "Bus" }, { value: "TRAIN", label: "Train" },
        { value: "TRAM", label: "Tram" }, { value: "SHIP", label: "Boat" } ] },
      { key: "line", label: "Line", type: "text", default: "", placeholder: "Any line, or e.g. 17" },
      { key: "dir", label: "Direction", type: "choice", default: "all", options: [{ value: "all", label: "Both" }, { value: "1", label: "1" }, { value: "2", label: "2" }] },
    ],
    displays: ["list", "ticker", "text"],
    build: (p, s, display) => {
      const q = [p.mode !== "all" && `transport=${p.mode}`, /^\w{1,6}$/.test(p.line.trim()) && `line=${p.line.trim()}`, p.dir !== "all" && `direction=${p.dir}`, "forecast=60"].filter(Boolean).join("&");
      return { name: `${p.stop.label}${p.line.trim() ? ` · ${p.line.trim()}` : p.mode !== "all" ? ` · ${s.mode.label.toLowerCase()}` : ""}`,
        url: `https://transport.integration.sl.se/v1/sites/${encodeURIComponent(p.stop.value)}/departures?${q}`, refresh: 60,
        transform: d => ({ departures: (d.departures || []).map(x => ({ line: x.line?.designation || "", dest: x.destination || "",
          when: x.state === "CANCELLED" ? "cancelled" : x.display === "Nu" ? "now" : x.display, warn: x.deviations?.length ? " ⚠" : "" })) }),
        ...(display === "text" ? { path: "departures", template: "{0.line} {0.dest} · {0.when}" } : { path: "departures", item: "{line} {dest} · {when}{warn}" }), empty: "No departures in the next hour" };
    } },
  { id: "radio", name: "Sveriges Radio live", category: "sweden", desc: "Listen to any of SR's 52 channels, with the song that's playing now.",
    params: [{ key: "channel", label: "Channel", type: "search", search: "sr_channels", default: { value: "164", label: "P3" }, placeholder: "P1, P2, P4 Göteborg…" }],
    displays: ["local"], build: p => ({ name: p.channel.label, local: "radio", channel: p.channel.value, size: [2, 1] }) },

  { id: "nasa_neo", name: "Near-Earth asteroids", category: "space",
    desc: "Asteroids passing Earth today, from NASA. Add your own free key if the shared demo key runs out.",
    params: [
      { key: "show", label: "Show", type: "choice", default: "count", options: [
        { value: "count", label: "How many", displays: ["stat"] },
        { value: "list", label: "List", displays: ["list"] },
      ] },
      { key: "key", label: "NASA API key", type: "secret", optional: true, placeholder: "Uses DEMO_KEY if empty", help: "https://api.nasa.gov/" },
    ],
    build: (p, s) => ({ name: "Asteroids passing today",
      url: `https://api.nasa.gov/neo/rest/v1/feed?start_date={YYYY}-{MM}-{DD}&end_date={YYYY}-{MM}-{DD}&api_key=${encodeURIComponent(p.key || "DEMO_KEY")}`,
      ...(p.show === "count" ? { path: "element_count", unit: "rocks" }
        : { path: "near_earth_objects.{YYYY}-{MM}-{DD}", item: "{name} · {close_approach_data[0].miss_distance.lunar|round} × Moon distance" }),
      refresh: 3600 }) },

  { id: "github", name: "GitHub repo", category: "dev",
    desc: "Stars, forks or issues for any public repository.",
    params: [
      { key: "repo", label: "Repository", type: "text", default: "anthropics/claude-code", placeholder: "owner/repo" },
      { key: "metric", label: "Show", type: "choice", default: "stargazers_count", options: [
        { value: "stargazers_count", label: "Stars", unit: "★" }, { value: "forks_count", label: "Forks" },
        { value: "open_issues_count", label: "Open issues" }, { value: "subscribers_count", label: "Watchers" },
      ] },
    ],
    displays: ["stat"],
    build: (p, s) => ({ name: `${p.repo} · ${s.metric.label.toLowerCase()}`, url: `https://api.github.com/repos/${p.repo}`, path: p.metric, format: "compact", refresh: 3600 }) },

  { id: "npm", name: "npm downloads", category: "dev",
    desc: "How many times a package was downloaded.",
    params: [
      { key: "pkg", label: "Package", type: "text", default: "react", placeholder: "react" },
      { key: "period", label: "Over the last", type: "choice", default: "last-week", options: [
        { value: "last-day", label: "Day" }, { value: "last-week", label: "Week" }, { value: "last-month", label: "Month" },
      ] },
    ],
    displays: ["stat"],
    build: (p, s) => ({ name: `${p.pkg} / ${s.period.label.toLowerCase()}`, url: `https://api.npmjs.org/downloads/point/${p.period}/${p.pkg}`, path: "downloads", format: "compact", refresh: 21600 }) },

  { id: "hn", name: "Hacker News", category: "dev",
    desc: "Headlines from the orange site.",
    params: [
      { key: "feed", label: "Feed", type: "choice", default: "front_page", options: [
        { value: "front_page", label: "Front page" }, { value: "show_hn", label: "Show HN" }, { value: "ask_hn", label: "Ask HN" },
      ] },
    ],
    displays: ["list", "ticker"],
    build: (p, s) => ({ name: `HN ${s.feed.label.toLowerCase()}`, url: `https://hn.algolia.com/api/v1/search?tags=${p.feed}`, path: "hits", item: "{points}▲ {title}", refresh: 600 }) },

  // ── EARTH ────────────────────────────────────────────────
  { id: "quakes", name: "Earthquakes", category: "earth",
    desc: "USGS earthquake feed. Count them or list them.",
    params: [
      { key: "mag", label: "Magnitude", type: "choice", default: "4.5", options: [
        { value: "all", label: "All" }, { value: "2.5", label: "2.5+" }, { value: "4.5", label: "4.5+" }, { value: "significant", label: "Major" },
      ] },
      { key: "period", label: "Over the last", type: "choice", default: "day", options: [
        { value: "hour", label: "Hour" }, { value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" },
      ] },
    ],
    displays: ["list", "stat", "chart"],
    build: (p, s, display) => ({
      name: `${s.mag.label === "All" ? "All" : s.mag.label} quakes · ${s.period.label.toLowerCase()}`,
      url: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${p.mag}_${p.period}.geojson`,
      path: display === "stat" ? "metadata.count" : "features", item: "M{properties.mag} · {properties.place}", unit: display === "stat" ? "quakes" : undefined, refresh: 600,
      ...(display === "chart" ? { path: "buckets", xField: "t", yFields: [{ y: "n", label: "Quakes", unit: "" }], chart: "bar", size: [3, 2],
        transform: d => { const size = ["hour", "day"].includes(p.period) ? (p.period === "hour" ? 300e3 : 3600e3) : 86400e3, end = Math.ceil(Date.now() / size) * size,
          n = { hour: 12, day: 24, week: 7, month: 30 }[p.period], buckets = Array.from({ length: n }, (_, i) => ({ t: end - (n - i) * size, n: 0 }));
          (d.features || []).forEach(f => { const i = Math.floor((f.properties.time - (end - n * size)) / size); if (buckets[i]) buckets[i].n++; });
          return { buckets }; } } : {}) }) },

  // ── LAUNCHES ─────────────────────────────────────────────
  { id: "launches", name: "Rocket launches", category: "space",
    desc: "Countdown to the next orbital launch, from any provider. (Free tier: 15 calls an hour, so it refreshes slowly.)",
    params: [
      { key: "provider", label: "Provider", type: "choice", default: "", options: [
        { value: "", label: "Anyone" }, { value: "SpaceX", label: "SpaceX" }, { value: "Rocket Lab", label: "Rocket Lab" },
        { value: "United Launch Alliance", label: "ULA" }, { value: "Blue Origin", label: "Blue Origin" }, { value: "Arianespace", label: "Arianespace" },
        { value: "China Aerospace Science and Technology Corporation", label: "China (CASC)" },
      ] },
      { key: "show", label: "Show", type: "choice", default: "countdown", options: [
        { value: "countdown", label: "Countdown", displays: ["stat"] },
        { value: "next", label: "Next mission", displays: ["text"] },
        { value: "upcoming", label: "Upcoming", displays: ["list", "ticker"] },
      ] },
    ],
    build: (p, s) => {
      const who = p.provider ? s.provider.label : "";
      const url = `https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=10&mode=list&hide_recent_previous=true${p.provider ? `&lsp__name=${encodeURIComponent(p.provider)}` : ""}`;
      if (p.show === "countdown") return { name: `Next ${who} launch`.replace("  ", " "), url, path: "results[0].net", format: "countdown", refresh: 1800 };
      if (p.show === "next") return { name: `Next ${who} launch`.replace("  ", " "), url, path: "{results[0].name} · {results[0].net|countdown}", refresh: 1800 };
      return { name: `Upcoming ${who} launches`.replace("  ", " "), url, path: "results", item: "{net|countdown} · {name}", refresh: 1800 };
    } },

  // ── SPORT ────────────────────────────────────────────────
  { id: "chess", name: "Chess rating", category: "sport",
    desc: "Live rating for any player on chess.com or Lichess.",
    params: [
      { key: "site", label: "Site", type: "choice", default: "chesscom", options: [ { value: "chesscom", label: "chess.com" }, { value: "lichess", label: "Lichess" } ] },
      { key: "user", label: "Username", type: "text", default: "magnuscarlsen", placeholder: "magnuscarlsen" },
      { key: "speed", label: "Time control", type: "choice", default: "blitz", options: [
        { value: "bullet", label: "Bullet" }, { value: "blitz", label: "Blitz" }, { value: "rapid", label: "Rapid" },
      ] },
    ],
    displays: ["stat"],
    build: (p, s) => p.site === "lichess"
      ? { name: `${p.user} · ${s.speed.label.toLowerCase()} (Lichess)`, url: `https://lichess.org/api/user/${encodeURIComponent(p.user)}`, path: `perfs.${p.speed}.rating`, decimals: 0, refresh: 600 }
      : { name: `${p.user} · ${s.speed.label.toLowerCase()}`, url: `https://api.chess.com/pub/player/${encodeURIComponent(p.user.toLowerCase())}/stats`, path: `chess_${p.speed}.last.rating`, decimals: 0, refresh: 600 } },

  { id: "f1", name: "Formula 1", category: "sport",
    desc: "Current championship standings.",
    params: [
      { key: "table", label: "Standings", type: "choice", default: "driver", options: [ { value: "driver", label: "Drivers" }, { value: "constructor", label: "Constructors" } ] },
    ],
    displays: ["list", "ticker"],
    build: p => p.table === "driver"
      ? { name: "F1 drivers", url: "https://api.jolpi.ca/ergast/f1/current/driverStandings.json", path: "MRData.StandingsTable.StandingsLists[0].DriverStandings", item: "{position}. {Driver.givenName} {Driver.familyName} · {points} p", refresh: 21600 }
      : { name: "F1 constructors", url: "https://api.jolpi.ca/ergast/f1/current/constructorStandings.json", path: "MRData.StandingsTable.StandingsLists[0].ConstructorStandings", item: "{position}. {Constructor.name} · {points} p", refresh: 21600 } },

  // ── KNOWLEDGE ────────────────────────────────────────────
  { id: "holidays", name: "Public holidays", category: "knowledge",
    desc: "The next public holidays in any country.",
    params: [
      { key: "country", label: "Country code", type: "text", default: "SE", placeholder: "SE, NO, US, DE…", upper: true },
      { key: "show", label: "Show", type: "choice", default: "next", options: [
        { value: "next", label: "Next one", displays: ["text"] }, { value: "list", label: "Coming up", displays: ["list"] },
      ] },
    ],
    build: p => p.show === "next"
      ? { name: `Next holiday (${p.country})`, url: `https://date.nager.at/api/v3/NextPublicHolidays/${p.country}`, path: "{[0].localName} · {[0].date|countdown}", refresh: 21600 }
      : { name: `Holidays (${p.country})`, url: `https://date.nager.at/api/v3/NextPublicHolidays/${p.country}`, path: "", item: "{date|date} · {localName}", refresh: 21600 } },

  { id: "wiki", name: "Wikipedia", category: "knowledge",
    desc: "On this day, or a random article, in your language.",
    params: [
      { key: "feed", label: "Show", type: "choice", default: "onthisday", options: [
        { value: "onthisday", label: "On this day", displays: ["list", "ticker"] },
        { value: "random", label: "Random article", displays: ["text"] },
      ] },
      { key: "lang", label: "Language", type: "choice", default: "en", options: [
        { value: "en", label: "English" }, { value: "sv", label: "Svenska" }, { value: "de", label: "Deutsch" }, { value: "fr", label: "Français" },
      ] },
    ],
    build: (p, s) => p.feed === "onthisday"
      ? { name: `On this day (${p.lang})`, url: `https://api.wikimedia.org/feed/v1/wikipedia/${p.lang}/onthisday/selected/{MM}/{DD}`, path: "selected", item: "{year} · {text}", refresh: 21600 }
      : { name: `Random Wikipedia (${p.lang})`, url: `https://${p.lang}.wikipedia.org/api/rest_v1/page/random/summary`, path: "{title}: {extract}", refresh: 600 } },
];

/* ── Ready-made widgets ───────────────────────────────────── */
const M = (id, name, desc, mod, params) => ({ id, name, desc, mod, params });
window.BLUEPRINTS = [
  // Module presets: absurd places and useful defaults. Users can reconfigure these.
  M("bp_southpole_temp", "South Pole temperature", "Air temperature at 90° south.", "weather", { metric: "temperature_2m", place: P["South Pole"] }),
  M("bp_sahara_uv", "Sahara UV index", "Solar radiation intensity in the middle of the desert.", "weather", { metric: "uv_index", place: P["Sahara"], display: "gauge" }),
  M("bp_everest_wind", "Wind on Everest", "Wind speed at the summit coordinates.", "weather", { metric: "wind_speed_10m", place: P["Mount Everest"] }),
  M("bp_deathvalley_temp", "Death Valley temperature", "Furnace Creek, the hottest place on record.", "weather", { metric: "temperature_2m", place: P["Death Valley"] }),
  M("bp_oymyakon_temp", "Oymyakon temperature", "The coldest permanently inhabited village.", "weather", { metric: "temperature_2m", place: P["Oymyakon"] }),
  M("bp_mawsynram_rain", "Rain in Mawsynram", "Precipitation in the wettest place on Earth.", "weather", { metric: "precipitation", place: P["Mawsynram"] }),
  M("bp_atacama_humidity", "Atacama humidity", "Humidity in the driest non-polar desert.", "weather", { metric: "relative_humidity_2m", place: P["Atacama"] }),
  M("bp_tromso_clouds", "Clouds over Tromsø", "Cloud cover above the aurora capital. Lower is better.", "weather", { metric: "cloud_cover", place: P["Tromsø"] }),
  M("bp_svalbard_daylight", "Daylight in Svalbard", "Day length in Longyearbyen. Zero during polar night.", "sun", { metric: "day_length", place: P["Svalbard"] }),
  M("bp_point_nemo_waves", "Waves at Point Nemo", "Wave height at the most remote spot in any ocean.", "ocean", { metric: "wave_height", place: P["Point Nemo"] }),
  M("bp_nazare_waves", "Nazaré swell", "Home of the biggest surfed waves on the planet.", "ocean", { metric: "swell_wave_height", place: P["Nazaré"] }),
  M("bp_iss_velocity", "ISS velocity", "How fast the space station is moving right now.", "iss", { metric: "velocity" }),
  M("bp_iss_sunlight", "ISS in sunlight?", "Daylight or Earth's shadow.", "iss", { metric: "visibility" }),
  M("bp_btc", "Bitcoin", "BTC spot price.", "crypto", { coin: "BTC", fiat: "USD" }),
  M("bp_doge", "Dogecoin", "Much price. Very volatile.", "crypto", { coin: "DOGE", fiat: "USD" }),
  M("bp_github_status", "GitHub status", "Is GitHub having a moment?", "status", { service: "www.githubstatus.com" }),
  M("bp_claude_status", "Claude status", "Anthropic's public status page.", "status", { service: "status.claude.com" }),
  M("bp_cloudflare_status", "Cloudflare status", "When this is red, half the internet is too.", "status", { service: "www.cloudflarestatus.com" }),
  M("bp_hn_front", "Hacker News", "What the orange site is arguing about.", "hn", { feed: "front_page" }),
  M("bp_hn_ticker", "HN ticker", "Front-page headlines as a scrolling marquee.", "hn", { feed: "front_page", display: "ticker" }),
  M("bp_quakes_big", "Significant quakes", "Magnitude 4.5+ in the last 24 hours.", "quakes", { mag: "4.5", period: "day" }),
  M("bp_quakes_count", "Earthquakes today", "Every quake USGS recorded in the last day.", "quakes", { mag: "all", period: "day", display: "stat" }),
  M("bp_left_pad", "left-pad downloads", "Still going strong after breaking the internet in 2016.", "npm", { pkg: "left-pad", period: "last-week" }),
  M("bp_is_odd", "is-odd downloads", "People who need a package to check if a number is odd.", "npm", { pkg: "is-odd", period: "last-week" }),
  M("bp_on_this_day", "On this day", "Events that happened on today's date.", "wiki", { feed: "onthisday", lang: "en" }),
  M("bp_delhi_pm25", "Delhi PM2.5", "Fine particulate matter over New Delhi.", "air", { metric: "pm2_5", place: { name: "New Delhi", lat: 28.61, lon: 77.21 } }),
  M("bp_elpris_se3", "Electricity SE3", "Spot price right now in Stockholm's bidding zone.", "elpris", { zone: "SE3", vat: "ex" }),
  M("bp_elpris_se4", "Electricity SE4", "Southern Sweden, usually the most expensive zone.", "elpris", { zone: "SE4", vat: "ex" }),
  M("bp_polisen_sthlm", "Police in Stockholm", "Latest police events in Stockholm county.", "polisen", { place: "Stockholm" }),
  M("bp_polisen_all", "Police ticker", "Every police event in Sweden as a scrolling ticker.", "polisen", { place: "", display: "ticker" }),
  M("bp_next_launch", "Next rocket launch", "Countdown to the next orbital launch anywhere on Earth.", "launches", { provider: "", show: "countdown" }),
  M("bp_next_spacex", "Next SpaceX launch", "Mission name and countdown.", "launches", { provider: "SpaceX", show: "next" }),
  M("bp_launches", "Launch schedule", "The next ten launches worldwide.", "launches", { provider: "", show: "upcoming" }),
  M("bp_magnus_blitz", "Magnus Carlsen, blitz", "The world's best player's chess.com blitz rating.", "chess", { site: "chesscom", user: "magnuscarlsen", speed: "blitz" }),
  M("bp_magnus_lichess", "Magnus on Lichess", "Bullet rating of DrNykterstein, Magnus's Lichess account.", "chess", { site: "lichess", user: "DrNykterstein", speed: "bullet" }),
  M("bp_f1_drivers", "F1 drivers' championship", "Current standings.", "f1", { table: "driver" }),
  M("bp_holiday_se", "Next Swedish holiday", "The next Swedish public holiday and how long until it.", "holidays", { country: "SE", show: "next" }),

  // Raw APIs: one fixed source each.
  { id: "bp_people_in_space", name: "Humans in space", desc: "Number of people off-planet at this moment.", category: "space",
    url: "https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json", path: "number", display: "stat", unit: "people", refresh: 3600 },
  { id: "bp_kp_index", name: "Aurora Kp index", desc: "Geomagnetic activity. 5+ means auroras far south.", category: "space",
    url: "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json", path: "[-1].estimated_kp", display: "gauge", min: 0, max: 9, decimals: 1, refresh: 300 },
  { id: "bp_solar_wind", name: "Solar wind speed", desc: "Speed of the plasma stream hitting Earth's magnetosphere.", category: "space",
    url: "https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json", path: "[0].proton_speed", display: "stat", unit: "km/s", decimals: 0, refresh: 300 },
  { id: "bp_neo_today", name: "Asteroids passing today", desc: "Near-Earth objects NASA is tracking for today.", category: "space",
    url: "https://api.nasa.gov/neo/rest/v1/feed?start_date={YYYY}-{MM}-{DD}&end_date={YYYY}-{MM}-{DD}&api_key=DEMO_KEY", path: "element_count", display: "stat", unit: "rocks", refresh: 3600 },
  { id: "bp_uk_carbon", name: "UK grid carbon", desc: "Carbon intensity of Britain's electricity right now.", category: "earth",
    url: "https://api.carbonintensity.org.uk/intensity", path: "data[0].intensity.forecast", display: "gauge", min: 0, max: 400, unit: "gCO₂/kWh", decimals: 0, refresh: 1800 },
  { id: "bp_btc_fees", name: "Bitcoin fee, next block", desc: "Fee needed to get into the next block.", category: "money",
    url: "https://mempool.space/api/v1/fees/recommended", path: "fastestFee", display: "stat", unit: "sat/vB", refresh: 60 },
  { id: "bp_btc_paprika", name: "Bitcoin (Coinpaprika)", desc: "Price from Coinpaprika, a second opinion next to Coinbase.", category: "money",
    url: "https://api.coinpaprika.com/v1/tickers/btc-bitcoin", path: "quotes.USD.price", display: "stat", prefix: "$", decimals: 0, refresh: 300 },
  { id: "bp_btc_sek_bci", name: "Bitcoin in SEK (Blockchain.com)", desc: "The last trade price in kronor from Blockchain.com.", category: "money",
    url: "https://blockchain.info/ticker", path: "SEK.last", display: "stat", unit: "kr", decimals: 0, refresh: 300 },
  { id: "bp_us_tbill", name: "US Treasury bill rate", desc: "Average interest the US government pays on its short-term debt.", category: "money",
    url: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?sort=-record_date&page%5Bsize%5D=1&filter=security_desc:eq:Treasury%20Bills",
    path: "data[0].avg_interest_rate_amt", display: "stat", unit: "%", decimals: 2, refresh: 43200 },
  { id: "bp_us_tbill_chart", name: "US Treasury bill rate, 2 years", desc: "Monthly average rate on US Treasury bills.", category: "money",
    url: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?sort=-record_date&page%5Bsize%5D=24&filter=security_desc:eq:Treasury%20Bills",
    path: "data", xField: "record_date", yFields: [{ y: "avg_interest_rate_amt", label: "Rate", unit: "%" }], chart: "line", xFormat: "month", decimals: 2, display: "chart", refresh: 43200 },
  { id: "bp_meme", name: "Random meme", desc: "A fresh meme from Reddit's meme subreddits.", category: "images",
    url: "https://meme-api.com/gimme", path: "url", caption: "title", display: "image", refresh: 600 },
  { id: "bp_f1_next", name: "Next F1 race", desc: "Countdown to the next Formula 1 Grand Prix.", category: "sport",
    url: "https://api.jolpi.ca/ergast/f1/current/next.json", display: "text", refresh: 21600,
    transform: d => { const r = d.MRData?.RaceTable?.Races?.[0] || {}; return { name: r.raceName, place: r.Circuit?.Location?.locality, when: `${r.date}T${r.time || "12:00:00Z"}` }; },
    path: "{name}, {place} · {when|countdown}" },
  { id: "bp_fortnite", name: "Fortnite news", desc: "What's new in Battle Royale right now.", category: "fun",
    url: "https://fortnite-api.com/v2/news/br", path: "data.motds", item: "{title}", display: "list", refresh: 3600 },
  { id: "bp_warframe", name: "Warframe void fissures", desc: "Open fissures on PC and when they close.", category: "fun",
    url: "https://api.warframestat.us/pc/fissures", transform: d => (Array.isArray(d) ? d : []).filter(f => Date.parse(f.expiry) > Date.now()).sort((a, b) => Date.parse(a.expiry) - Date.parse(b.expiry)),
    path: "", item: "{tier} {missionType} · {node} · closes {expiry|countdown}", display: "list", refresh: 300 },
  { id: "bp_mastodon_trends", name: "Trending on Mastodon", desc: "Hashtags people on mastodon.social are using today.", category: "fun",
    url: "https://mastodon.social/api/v1/trends/tags", path: "", item: "#{name} · {history[0].accounts} people", display: "list", refresh: 1800 },
  { id: "bp_eonet", name: "Natural events now", desc: "Wildfires, storms and volcanoes NASA is tracking right now.", category: "earth",
    url: "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=20", path: "events", item: "{title} · {categories[0].title}", display: "list", refresh: 3600 },
  { id: "bp_solar_flare", name: "Solar X-ray flare", desc: "The Sun's current X-ray class: A and B are calm, M and X are flares.", category: "space",
    url: "https://services.swpc.noaa.gov/json/goes/primary/xray-flares-latest.json", path: "[0].current_class", display: "text", refresh: 600 },
  { id: "bp_geek_joke", name: "Geek joke", desc: "Programmer humor, of a sort.", category: "fun",
    url: "https://geek-jokes.sameerkumar.website/api?format=json", path: "joke", display: "text", refresh: 600 },
  { id: "bp_rick_morty", name: "Rick and Morty character", desc: "A random character from the multiverse.", category: "images",
    url: "https://rickandmortyapi.com/api/character/{rand:1-826}", path: "image", caption: "name", display: "image", refresh: 900 },
  { id: "bp_cataas", name: "Cat as a service", desc: "A random cat photo.", category: "images",
    url: "https://cataas.com/cat?json=true", path: "url", display: "image", refresh: 900 },
  { id: "bp_picsum", name: "Random photo", desc: "A random photograph from Lorem Picsum.", category: "images",
    url: "https://picsum.photos/v2/list?page={rand:1-100}&limit=1", path: "https://picsum.photos/id/{[0].id}/800/500", caption: "[0].author", display: "image", refresh: 900 },
  { id: "bp_btc_height", name: "Bitcoin block height", desc: "Blocks mined since 2009.", category: "money",
    url: "https://mempool.space/api/blocks/tip/height", path: "", display: "stat", decimals: 0, refresh: 120 },
  { id: "bp_fear_greed", name: "Crypto fear & greed", desc: "Market mood from 0 (panic) to 100 (euphoria).", category: "money",
    url: "https://api.alternative.me/fng/", path: "data[0].value", display: "gauge", min: 0, max: 100, decimals: 0, refresh: 3600 },
  { id: "bp_wiki_mostread", name: "Most read on Wikipedia", desc: "The most-read English articles on the latest full day Wikimedia has counted.", category: "knowledge",
    url: "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/{dpath:-3}",   // the counts land about two days late
    transform: d => (d.items?.[0]?.articles || []).filter(a => a.article !== "Main_Page" && !a.article.includes(":")).map(a => ({ title: a.article.replace(/_/g, " "), views: a.views })),
    path: "", item: "{title} · {views|compact} views", display: "list", refresh: 21600 },
  { id: "bp_useless_fact", name: "Useless fact", desc: "Facts nobody asked for.", category: "knowledge",
    url: "https://uselessfacts.jsph.pl/api/v2/facts/random?language=en", path: "text", display: "text", refresh: 300 },
  { id: "bp_agify", name: "How old is 'Claude'?", desc: "Agify guesses an age from a first name. It's very sure.", category: "knowledge",
    url: "https://api.agify.io?name=claude", path: "age", display: "stat", unit: "years", refresh: 86400 },
  { id: "bp_my_ip", name: "Your public IP", desc: "The address the internet sees you as.", category: "dev",
    url: "https://api.ipify.org?format=json", path: "ip", display: "text", refresh: 3600 },
  { id: "bp_corp_bs", name: "Corporate BS generator", desc: "Synergize your mission-critical paradigms.", category: "fun",
    url: "https://corporatebs-generator.sameerkumar.website/", path: "phrase", display: "text", refresh: 300 },
  { id: "bp_cat_fact", name: "Critical cat fact", desc: "Mission-critical feline intelligence.", category: "fun",
    url: "https://catfact.ninja/fact", path: "fact", display: "text", refresh: 300 },
  { id: "bp_meow_fact", name: "Meow fact", desc: "A second, independent source of cat facts. Redundancy matters.", category: "fun",
    url: "https://meowfacts.herokuapp.com/", path: "data[0]", display: "text", refresh: 300 },
  { id: "bp_chuck", name: "Chuck Norris fact", desc: "Verified by Chuck Norris.", category: "fun",
    url: "https://api.chucknorris.io/jokes/random", path: "value", display: "text", refresh: 300 },
  { id: "bp_kanye", name: "Kanye says", desc: "A random Kanye West quote.", category: "fun",
    url: "https://api.kanye.rest/", path: "“{quote}” — Kanye", display: "text", refresh: 300 },
  { id: "bp_advice", name: "Unsolicited advice", desc: "Advice slip of the moment.", category: "fun",
    url: "https://api.adviceslip.com/advice", path: "slip.advice", display: "text", refresh: 300 },
  { id: "bp_dad_joke", name: "Dad joke", desc: "Groan-grade humour on a timer.", category: "fun",
    url: "https://icanhazdadjoke.com/", headers: { Accept: "application/json" }, path: "joke", display: "text", refresh: 300 },
  { id: "bp_prog_joke", name: "Programming joke", desc: "Setup and punchline for engineers.", category: "fun",
    url: "https://official-joke-api.appspot.com/jokes/programming/random", path: "{[0].setup} — {[0].punchline}", display: "text", refresh: 300 },
  { id: "bp_random_person", name: "Someone, somewhere", desc: "A random (fake) person from randomuser.me.", category: "fun",
    url: "https://randomuser.me/api/", path: "{results[0].name.first} {results[0].name.last}, {results[0].location.city}", display: "text", refresh: 300 },
  { id: "bp_wiki_potd", name: "Wikimedia picture of the day", desc: "Today's featured photo from Wikimedia Commons.", category: "images",
    url: "https://api.wikimedia.org/feed/v1/wikipedia/en/featured/{YYYY}/{MM}/{DD}", path: "image.thumbnail.source", caption: "image.title", display: "image", refresh: 21600 },
  { id: "bp_dog", name: "Random dog", desc: "A fresh dog every few minutes.", category: "images",
    url: "https://dog.ceo/api/breeds/image/random", path: "message", display: "image", refresh: 300 },
  { id: "bp_fox", name: "Random fox", desc: "Foxes. On demand.", category: "images",
    url: "https://randomfox.ca/floof/", path: "image", display: "image", refresh: 300 },
  { id: "bp_cat", name: "Random cat", desc: "One cat photo from The Cat API.", category: "images",
    url: "https://api.thecatapi.com/v1/images/search", path: "[0].url", display: "image", refresh: 300 },
  { id: "bp_pokemon", name: "Wild Pokémon appeared", desc: "A random Pokémon's official artwork.", category: "images",
    url: "https://pokeapi.co/api/v2/pokemon/{rand:1-1025}", path: "sprites.other.official-artwork.front_default", caption: "name", display: "image", refresh: 300 },
  { id: "bp_art", name: "Random artwork", desc: "A random piece from the Art Institute of Chicago's collection.", category: "images",
    url: "https://api.artic.edu/api/v1/artworks?limit=1&page={rand:1-9000}&fields=title,image_id,artist_title",
    path: "https://www.artic.edu/iiif/2/{data[0].image_id}/full/843,/0/default.jpg", caption: "data[0].title", display: "image", refresh: 600 },

  // Space, earth and water
  { id: "bp_space_news", name: "Spaceflight news", desc: "Latest headlines from space news sites.", category: "space",
    url: "https://api.spaceflightnewsapi.net/v4/articles/?limit=10", path: "results", item: "{title} ({news_site})", display: "list", refresh: 1800 },
  { id: "bp_volcanoes", name: "Restless US volcanoes", desc: "US volcanoes currently above normal alert level.", category: "earth",
    url: "https://volcanoes.usgs.gov/vsc/api/volcanoApi/elevated", path: "", item: "{vName} · {alertLevel} / {colorCode}", display: "list", refresh: 3600 },
  { id: "bp_nyc_tide", name: "Water level at The Battery, NYC", desc: "Live tide gauge at the southern tip of Manhattan.", category: "earth",
    url: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=8518750&product=water_level&date=latest&datum=MLLW&units=metric&time_zone=gmt&format=json",
    path: "data[0].v", display: "stat", unit: "m", decimals: 2, refresh: 600 },
  { id: "bp_potomac", name: "Potomac River flow", desc: "How much water is passing Washington DC every second.", category: "earth",
    url: "https://waterservices.usgs.gov/nwis/iv/?format=json&sites=01646500&parameterCd=00060",
    path: "value.timeSeries[0].values[0].value[-1].value", display: "stat", unit: "ft³/s", format: "compact", refresh: 900 },

  // Sweden
  { id: "bp_riksdagen", name: "Nya motioner i riksdagen", desc: "The latest motions filed in the Swedish parliament.", category: "sweden",
    url: "https://data.riksdagen.se/dokumentlista/?sok=&doktyp=mot&utformat=json&sz=15&sort=datum&sortorder=desc",
    path: "dokumentlista.dokument", item: "{titel}", display: "list", refresh: 3600 },
  { id: "bp_tv_se", name: "TV tonight in Sweden", desc: "Today's schedule on Swedish TV, via TVmaze.", category: "sweden",
    url: "https://api.tvmaze.com/schedule?country=SE", path: "", item: "{airtime} · {show.name}", display: "list", refresh: 3600 },

  // Sport and culture
  { id: "bp_bundesliga", name: "Bundesliga table", desc: "Current German league standings.", category: "sport",
    url: "https://api.openligadb.de/getbltable/bl1/{SEASON}", path: "", item: "{teamName} · {points} p", display: "list", refresh: 3600 },
  { id: "bp_trending_books", name: "Trending books", desc: "What people are reading today on Open Library.", category: "knowledge",
    url: "https://openlibrary.org/trending/daily.json?limit=15", path: "works", item: "{title} — {author_name[0]}", display: "list", refresh: 3600 },
  { id: "bp_trivia", name: "Trivia", desc: "A random quiz question, answer included.", category: "fun",
    url: "https://opentdb.com/api.php?amount=1", path: "{results[0].question} → {results[0].correct_answer}", display: "text", refresh: 300 },
  { id: "bp_quote", name: "Quote of the moment", desc: "A random quote from DummyJSON.", category: "fun",
    url: "https://dummyjson.com/quotes/random", path: "“{quote}” — {author}", display: "text", refresh: 300 },
  { id: "bp_dev_joke", name: "Dev joke", desc: "One-liner programming jokes from JokeAPI.", category: "fun",
    url: "https://v2.jokeapi.dev/joke/Programming?type=single&safe-mode", path: "joke", display: "text", refresh: 300 },

  // Dev and money
  { id: "bp_tube", name: "London Tube status", desc: "Service status for every Underground line.", category: "traffic",
    url: "https://api.tfl.gov.uk/Line/Mode/tube/Status", path: "", item: "{name}: {lineStatuses[0].statusSeverityDescription}", display: "list", refresh: 300 },
  { id: "bp_gh_firehose", name: "GitHub firehose", desc: "Public events happening on GitHub right now. (60 calls/hour without a token.)", category: "dev",
    url: "https://api.github.com/events?per_page=20", path: "", item: "{actor.login} · {type} · {repo.name}", display: "ticker", refresh: 300 },
  { id: "bp_devto", name: "Top on dev.to", desc: "Today's most-liked posts on dev.to.", category: "dev",
    url: "https://dev.to/api/articles?top=1&per_page=10", path: "", item: "{title} · {positive_reactions_count}♥", display: "list", refresh: 3600 },
  { id: "bp_trending_coins", name: "Trending coins", desc: "Most-searched coins on CoinGecko right now.", category: "money",
    url: "https://api.coingecko.com/api/v3/search/trending", path: "coins", item: "{item.name} ({item.symbol})", display: "list", refresh: 1800 },

  { id: "bp_iss_raw", name: "ISS telemetry (raw)", desc: "Full JSON from the ISS tracker, for the nerds.", category: "space",
    url: "https://api.wheretheiss.at/v1/satellites/25544", path: "", display: "json", refresh: 15 },
];
})();
