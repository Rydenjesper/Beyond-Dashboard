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

  Display types: stat | gauge | text | list | ticker | image | beacon | json
  Option fields a module choice can carry:
    unit, prefix, decimals, min, max, format (time|date|duration|compact|wmo), ok, warn,
    displays: which display types make sense, first one is the default

  Local widgets (no API): a module whose build() returns { local: "todo" | "note" | "pomodoro" | "clock" | "radio" }.
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
    ],
    displays: ["gauge", "stat"],
    build: p => ({ name: `Electricity ${p.zone}${p.vat === "inc" ? " incl. VAT" : ""}`, url: `https://www.elprisetjustnu.se/api/v1/prices/{YYYY}/{MM}-{DD}_${p.zone}.json`,
      path: "[now].SEK_per_kWh", unit: "öre/kWh", decimals: 1, min: 0, max: 300, refresh: 900 }) },

  { id: "polisen", name: "Swedish police", category: "sweden",
    desc: "The latest police events, for all of Sweden or one county or town.",
    params: [
      { key: "place", label: "County or town", type: "text", default: "Stockholm", placeholder: "Leave empty for all of Sweden" },
    ],
    displays: ["list", "ticker"],
    build: p => ({ name: p.place ? `Police · ${p.place}` : "Police · all of Sweden",
      url: `https://polisen.se/api/events${p.place ? `?locationname=${encodeURIComponent(p.place)}` : ""}`, path: "", item: "{name} — {summary}", refresh: 600 }) },

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
    ],
    build: (p, s) => ({ name: `${s.metric.label} · ${p.place.name}`, url: meteo("api.open-meteo.com/v1/forecast", p, p.metric), path: `current.${p.metric}` }) },

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
  { id: "clock", name: "Clock", category: "personal", desc: "Your time, plus any other time zones you care about.",
    params: [
      { key: "zones", label: "Other time zones", type: "text", default: "America/New_York, Asia/Tokyo", placeholder: "Europe/London, America/Los_Angeles" },
      { key: "h12", label: "Format", type: "choice", default: "24", options: [{ value: "24", label: "24-hour" }, { value: "12", label: "12-hour" }] },
    ],
    displays: ["local"], build: p => ({ name: "Clock", local: "clock", zones: String(p.zones || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 8), h12: p.h12 === "12", size: [2, 2] }) },

  { id: "sl", name: "SL departures", category: "sweden",
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
        ...(display === "text" ? { path: "{departures[0].line} {departures[0].dest} · {departures[0].when}" } : { path: "departures", item: "{line} {dest} · {when}{warn}" }) };
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
    displays: ["list", "stat"],
    build: (p, s, display) => ({
      name: `${s.mag.label === "All" ? "All" : s.mag.label} quakes · ${s.period.label.toLowerCase()}`,
      url: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${p.mag}_${p.period}.geojson`,
      path: display === "stat" ? "metadata.count" : "features", item: "M{properties.mag} · {properties.place}", unit: display === "stat" ? "quakes" : undefined, refresh: 600 }) },

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
  { id: "bp_btc_height", name: "Bitcoin block height", desc: "Blocks mined since 2009.", category: "money",
    url: "https://mempool.space/api/blocks/tip/height", path: "", display: "stat", decimals: 0, refresh: 120 },
  { id: "bp_fear_greed", name: "Crypto fear & greed", desc: "Market mood from 0 (panic) to 100 (euphoria).", category: "money",
    url: "https://api.alternative.me/fng/", path: "data[0].value", display: "gauge", min: 0, max: 100, decimals: 0, refresh: 3600 },
  { id: "bp_wiki_mostread", name: "Most read on Wikipedia", desc: "Today's most-read English articles.", category: "knowledge",
    url: "https://api.wikimedia.org/feed/v1/wikipedia/en/featured/{YYYY}/{MM}/{DD}", path: "mostread.articles", item: "{normalizedtitle} · {views} views", display: "list", refresh: 21600 },
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
  { id: "bp_tube", name: "London Tube status", desc: "Service status for every Underground line.", category: "dev",
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
