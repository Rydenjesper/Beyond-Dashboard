# Contributing to Beyond Dashboard

Thanks for wanting to help. The most useful contribution is usually a new widget: an API with live data that works without a key. This guide gets you from clone to pull request.

## The project in one minute

- **No backend, no build step.** `index.html` loads classic `<script>` files from `js/`. You can open it straight from disk. Please keep it that way: no frameworks, no bundler, no ES modules (they don't load from `file://`).
- **The catalog is data.** Every widget lives in [`blueprints.js`](blueprints.js): *modules* (configurable widgets) and *blueprints* (ready-made ones).
- **The engine is pure.** [`js/engine.js`](js/engine.js) and [`js/displays.js`](js/displays.js) touch no DOM when they load, so the tests run them in Node.

| Path | What's there |
|------|--------------|
| `blueprints.js` | Places, modules, ready-made widgets. Start here. |
| `js/engine.js` | Paths, templates, formatting, share links, validation, the expression language |
| `js/displays.js` | Display types: number, gauge, list, chart… (config + value → HTML) |
| `js/lookups.js` | Lists behind dropdowns and searches (SL stops, currencies, place search) |
| `js/local.js` | Widgets without an API: to-do, note, pomodoro, clock… |
| `js/app.js` … `js/boot.js` | The app: state, fetching, bank, editor, boards, sharing, wall display |
| `mcp/` | The MCP server that lets Claude build and edit boards |
| `tests/` | `node --test`, no dependencies |
| `scripts/` | The nightly API health check and the display audit |

## Run it

```sh
git clone https://github.com/Rydenjesper/Beyond-Dashboard.git
cd Beyond-Dashboard
python3 -m http.server 8000      # or any static server; opening index.html directly works too
```

Open <http://localhost:8000>. The service worker stays off on localhost, so your edits show up on reload.

You need Node 20 or newer for the tests. There is nothing to install:

```sh
npm test                         # same as: node --test --test-timeout=30000
```

## Add a widget

### 1. Check the API works from a browser

Open any https page (for example example.com), open the browser console and run:

```js
fetch("https://api.example.com/whatever").then(r => r.json()).then(console.log)
```

If you see data, CORS is fine. If you see a CORS error, the API can't be used directly (see "RSS feeds and the proxy" in the README for feeds). `http://` APIs never work on the live site.

### 2. Add it to `blueprints.js`

A ready-made widget is one object in `window.BLUEPRINTS`:

```js
{ id: "bp_people_in_space", name: "Humans in space", desc: "Number of people off-planet at this moment.", category: "space",
  url: "https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json",
  path: "number", display: "stat", unit: "people", refresh: 3600 },
```

A module adds parameters the user picks in the settings. See the comment at the top of `blueprints.js` for every field, parameter type (`choice`, `text`, `place`, `search`, `secret`), display type and how charts and combined widgets are described.

### 3. Pick a fair refresh

Use the slowest interval that still feels live: 60 s for departures, 15 min for weather and prices, hours for statistics. Free APIs stay free when nobody hammers them.

### 4. Check it

```sh
npm test                         # the catalog test builds every module and blueprint
npm run audit                    # renders every widget against live data and lists anything that looks wrong
npm run health                   # calls every URL the way GitHub Pages would (CORS and status)
```

Then open the app and add your widget from the bank.

## Rules for the catalog

1. **No API key.** Widgets that need one use a `secret` parameter and say so in their description. The key stays in the user's browser.
2. **It must answer browser requests (CORS).**
3. **Respect fair use** with the refresh interval.
4. **English UI text.** Data can be in any language.
5. **Fit the welcome flow** when it suits an interest: add it to `recipes()` in `js/welcome.js`.

## Changing code

- Match the code around you: plain functions, short comments that explain *why*, no new dependencies.
- Anything user-visible must work at 400 px wide and in both themes.
- Text from APIs goes through `esc()` before it reaches `innerHTML`. The display test sends `<img src=x onerror=…>` through every display type.
- Never break saved boards. If storage changes, migrate from the old key and keep it (see `migrateBoards` in `js/engine.js`).
- Share links must never carry keys, auth headers or personal content. `tests/share.test.js` checks this. Add a case if you touch sharing.
- Releases bump `?v=` on every script and stylesheet in `index.html` **and** `VERSION` in `sw.js`. Maintainers do this when merging, so you don't need to.

## Pull requests

- One widget or one change per pull request.
- `npm test` passes.
- Say how you tested it (browser, width, theme), and for new APIs, that the `fetch()` check worked.

## Reporting problems

- **A widget stopped working?** Open an issue with the widget's name. The nightly health check may already show it in [`status.json`](status.json).
- **Want a new widget?** Use the "Suggest an API" issue form.
- **Security issue?** Please don't open a public issue. See [SECURITY.md](SECURITY.md).

`TODO.md` holds the maintainer's working notes (in Swedish). It isn't a to-do list for contributors, but it explains why things are the way they are.
