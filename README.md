# BEYOND_DASHBOARD

A modular dashboard for the internet's weirdest live data. Pick a module, choose what to show and where (UV index in the Sahara, waves at Point Nemo, your own city's pollen), drag it anywhere on the board, connect your own endpoints and share the whole layout as a link.

No backend, no build step, no account. Open `index.html`.

## Run it

Open `index.html` in a browser. That's it.

To host it: push the folder to GitHub and turn on GitHub Pages.

## What it does

- **Two-step setup**: first visit asks where home is and what you're into, then builds a personal board (your city's weather, your Swedish elområde, launches if you like space) and runs a five-tip tour. Rebuild any time from the widget bank; replay the tour with the ? button.

- **Modules**: 19 configurable widget types. Weather, air quality, ocean and sun work for any place on Earth (search or pick an absurd preset). Swedish electricity spot prices per zone, Swedish police events per county, rocket launch countdowns, chess ratings, F1 standings, public holidays, crypto, exchange rates, GitHub repos, npm packages, 14 status pages, earthquakes, Wikipedia and Hacker News each have their own options.
- **Ready-made widgets**: 80 one-click widgets, from South Pole temperature to Critical Cat Facts. All key-less and tested to work from a browser (CORS).
- **Free-form board**: drag a widget by its header and the others move out of the way. Drag the corner to resize (1–6 columns, 1–4 rows). Layout adapts to 4 and 2 columns on smaller screens.
- **8 display modes**: big number with sparkline, gauge, text, list, ticker, image, status light, raw JSON.
- **Connect your own API**: paste an endpoint, press Fetch, click the value you want in the response. Supports custom headers, `{templates}` that combine fields, and URL placeholders like `{YYYY}-{MM}-{DD}` and `{rand:1-100}`.
- **Share links**: the full layout is compressed into the URL. No server stores anything. API keys and auth headers are stripped before sharing.

Your layout is saved in your browser (localStorage). Your keys never leave it.

## Add a module or blueprint

Everything lives in `blueprints.js`. A module declares its parameters and builds the request:

```js
{ id: "npm", name: "npm downloads", category: "dev", desc: "How many times a package was downloaded.",
  params: [
    { key: "pkg", label: "Package", type: "text", default: "react" },
    { key: "period", label: "Over the last", type: "choice", default: "last-week", options: [
      { value: "last-day", label: "Day" }, { value: "last-week", label: "Week" } ] },
  ],
  displays: ["stat"],
  build: (p, s) => ({ name: `${p.pkg} / ${s.period.label}`, url: `https://api.npmjs.org/downloads/point/${p.period}/${p.pkg}`, path: "downloads" }) },
```

Parameter types: `choice`, `text`, `place`.

Paths support `[now]` (the entry in a time-sliced array that covers the current moment, e.g. 15-minute electricity prices) and templates support filters: `{net|countdown}`, `{date|date}`, `{time|time}`, `{n|compact}`. A blueprint is either a module preset or a raw API:

```js
{ id: "bp_sahara_uv", name: "Sahara UV index", desc: "Solar radiation intensity in the middle of the desert.", category: "weather",
  url: "https://api.open-meteo.com/v1/forecast?latitude=23.4&longitude=12.0&current=uv_index",
  path: "current.uv_index", display: "gauge", min: 0, max: 12, unit: "UVI", refresh: 900 },
```

Rules for the bank:
1. No API key required.
2. It must answer requests from a browser. Test by running `fetch("<url>")` in your browser's console on any website.
3. Refresh no faster than the API's fair use (60 seconds or more for most).

All fields are documented at the top of `blueprints.js`.

Drag-and-drop is powered by [gridstack.js](https://gridstackjs.com) (MIT), vendored in `vendor/`.

## Roadmap

- [ ] CI job that checks every blueprint still responds
- [ ] Community layout gallery
- [ ] MCP server: let Claude add and arrange widgets from chat

## License

MIT
