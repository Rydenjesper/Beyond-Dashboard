# Beyond Dashboard: TODO

Uppgiftslista för vidareutveckling. Skriven för att lämnas till Claude Code.
Läs hela filen och `README.md` innan du börjar. Bocka av (`[x]`) när en punkt är klar och verifierad.

---

## 0. Kontext och regler (läs först)

**Vad projektet är:** en dashboard som körs helt i webbläsaren. Ingen backend, inget byggsteg. Hostas på GitHub Pages: https://rydenjesper.github.io/Beyond-Dashboard/

**Filer:**
- `index.html`: markup. `css/app.css`: all CSS. `js/`: klassiska scripts i laddordning `engine` (rena funktioner, laddas även i Node) → `app` (state, board, fetch) → `displays` → `bank` → `editor` → `share` → `welcome` → `boot`.
- `blueprints.js`: katalogen. `PLACES` (snabbval av platser), `MODULES` (konfigurerbara widgettyper med `params` + `build()`), `BLUEPRINTS` (färdiga widgets, antingen modul-preset `{mod, params}` eller rå API `{url, path, display, ...}`).
- `vendor/`: gridstack.js 12.4.2 (drag, resize, reflow). Rör inte.

**Motorn (finns redan, återanvänd):**
- Visningslägen: `stat`, `gauge`, `text`, `list`, `ticker`, `image`, `beacon`, `json`.
- Sökvägar: `a.b[0].c`, negativt index `[-1]`, `[now]` (posten i en tidsserie som täcker nu).
- Mallar: `{fält}` och filter `{fält|countdown}`, `|date`, `|time`, `|compact`, `|round`.
- URL-platshållare: `{YYYY} {MM} {DD} {SEASON} {rand:1-100}`.
- `scale` (multiplicera värdet), `format` (`time|date|duration|compact|wmo|countdown`).
- Delningslänkar: layouten komprimeras in i `#d=...`. Headers vars namn matchar `auth|key|token|secret|cookie|password|session` och nycklar i URL rensas bort.
- Lagring: `localStorage` under `beyond.dashboard.v2`, `beyond.home`, `beyond.interests`, `beyond.theme`, `beyond.onboarded`, `beyond.toured`.

**Hårda regler:**
1. **Inget byggsteg och ingen backend.** Det ska gå att öppna `index.html` direkt. Använd därför klassiska `<script>`-taggar, inte ES-moduler (de blockeras på `file://`).
2. **Varje nytt API ska testas från en riktig webbläsare innan det läggs in.** Kör `fetch(url)` i konsolen på en vanlig https-sida (t.ex. example.com). Får du ett svar fungerar CORS. `http://`-adresser fungerar aldrig på GitHub Pages.
3. **Bumpa cache-versionen** (`?v=5` → `?v=6` osv. på alla `<script>`/`<link>` i `index.html`, **och `VERSION` i `sw.js`**) vid varje release. Annars ser besökare gammal kod, och med service workern kan den ligga kvar tills versionen ändras.
4. **Nya moduler ska fungera i välkomstflödet** (`INTERESTS` + `recipes()` i `index.html`) om de passar ett intresse.
5. **Bryt inte gamla sparade boards.** Byter du lagringsformat: migrera från den gamla nyckeln, radera inte.
6. UI-texten är på engelska.
7. Testa på mobilbredd (400 px) och i både ljust och mörkt tema.

---

## 1. Infrastruktur som behövs för resten

- [x] **Delad fetch-cache.** Flera widgets mot samma URL (t.ex. ISS, Open-Meteo, elpris) ska dela ett anrop per uppdateringsintervall. Gör en `Map<url, {promise, at}>` i `fetchData()`. Minskar rate limiting rejält.
- [x] **Nyckelfält i moduler: param-typ `secret`.** Sparas separat i `localStorage` (`beyond.keys`), aldrig i boarden och aldrig i delningslänkar. Vid delning ska mottagaren se "Lägg till din egen nyckel" i widgeten i stället för ett fel. Behövs för Västtrafik, TMDB, OpenWeather, Alpha Vantage och egen NASA-nyckel. *(Klart: modulen `nasa_neo` är första användaren, med `optional: true` och DEMO_KEY som reserv.)*
- [x] **Export/import av allt** (boards, todos, nycklar valfritt) som JSON-fil. *(Klart: Share-dialogen → Backup. Tar med alla `beyond.*`-nycklar automatiskt, så nya lagringsnycklar för todos/boards följer med utan ändring.)* Viktigt när vi lägger till todos och flera dashboards, eftersom `localStorage` kan rensas av webbläsaren.
- [x] **Hälsokoll av katalogen i CI.** *(`scripts/health.js`, jobbet `health` i `ci.yml` kör 03:17 varje natt och manuellt. 429 räknas som "upptagen", inte trasig. Första körningen: 246 URL:er, 0 fel.)* GitHub Action som kör varje natt, anropar alla `url` i `blueprints.js` med headern `Origin: https://rydenjesper.github.io` och kontrollerar status 200 och att `Access-Control-Allow-Origin` finns i svaret. Skriv resultatet till `status.json` i repot. Visa en varningsikon i banken på widgets som failar.

---

## 2. Nya API:er (alla testade 2026-10-16, fungerar från webbläsare utan nyckel om inget annat anges)

Testad lista finns i Google Sheets: "API-lista: fungerar". Ta raderna markerade "Ja" som inte redan finns i Beyond.

### 2a. Ny kategori: Trafik
- [x] **SL-avgångar** (modul). Hållplatssök: `https://transport.integration.sl.se/v1/sites?expand=false` (6 500 hållplatser, cacha i `localStorage`). Avgångar: `https://transport.integration.sl.se/v1/sites/{id}/departures` → `departures[]` med `line.designation`, `destination`, `display` ("3 min"), `expected`, `deviations`. Parametrar: hållplats, filter på linje/transportslag, riktning. Display: lista "{line} {destination} {display}". *(Klart: modul `sl` med ny param-typ `search` (hållplatslistan cachas i `beyond.cache.sl_sites`). Inställda avgångar visar "cancelled". Ligger inte i välkomstflödet, eftersom närmaste hållplats skulle kräva hela listan där.)*
- [~] **Västtrafik** (modul, kräver egen nyckel). *(Skippad: Jesper vill bara ha API:er utan nycklar, 2026-10-16.)* OAuth client credentials: `POST https://ext-api.vasttrafik.se/token` (svarar med CORS). Därefter Planera Resa v4: `https://ext-api.vasttrafik.se/pr/v4/stop-areas/{gid}/departures`. Hållplatssök: `/pr/v4/locations/by-text?q=`. Spara token i minnet, förnya vid 401. **Ej verifierat hela vägen** eftersom vi inte hade någon nyckel. Testa först.
- [~] **ResRobot** (alternativ för hela Sverige, kräver gratis Trafiklab-nyckel *(Skippad: Jesper vill bara ha API:er utan nycklar, 2026-10-16.)*, svarar med CORS). `https://api.resrobot.se/v2.1/departureBoard?id={id}&format=json&accessId={key}`.
- [ ] **London Tube-status** finns redan som blueprint. Lägg den i Trafik.

### 2b. Radio och nyheter
- [x] **Sveriges Radio live** (modul, ny displaytyp `audio`). Kanaler: `https://api.sr.se/api/v2/channels?format=json&pagination=false` (52 kanaler, `liveaudio.url`, `image`). Spelas nu: `https://api.sr.se/api/v2/playlists/rightnow?channelid={id}&format=json` → `playlist.song.artist`, `.title`. Widget: kanalbild, play/paus-knapp, låt och artist (uppdatera var 30:e sekund). Uppspelning kräver klick (autoplay blockeras). Bara en kanal åt gången spelar. **Verifiera uppspelning på live-sidan.** *(Byggt som lokal widget `radio` med en delad `<audio>` för hela sidan. Ligger i intresset Sweden. Uppspelningen är verifierad av Jesper på live-sidan 2026-10-16.)*
- [x] **Ekot och SR-program som nyhetsflöde.** *(Ekot via SR:s Atom-flöde i modulen `rss`.)* `https://api.sr.se/api/v2/news?format=json` och SR:s RSS `https://api.sr.se/api/rss/program/{id}` (svarar med CORS).
- [x] **RSS-stöd i motorn.** *(`parseFeed` i `js/app.js`, `proxy/worker.js` med test, och en README-sektion. Proxyn sparas som en secret-param och följer aldrig med i länkar. Utan proxy säger widgeten varför.)* Om svaret är XML: parsa med `DOMParser` till `{items:[{title, link, pubDate, description}]}` för både RSS och Atom. Fungerar direkt för SR och New York Times. **De flesta andra flöden (SVT, GP, BBC, HN, The Verge) blockerar CORS.** Lägg till en valfri inställning "CORS-proxy-URL" (tom som standard) och en färdig Cloudflare Worker på ~20 rader i `proxy/worker.js` + instruktion i README. Utan proxy: visa ett tydligt fel som förklarar varför.
- [x] **Spaceflight News** finns redan. *(Meme-widget tillagd.)* **Online Meme** (`https://meme-api.com/gimme` → `url`, `title`, `subreddit`) som bildwidget.

### 2c. Ekonomi
- [x] **Metaller live:** `https://api.gold-api.com/price/{XAU|XAG|XPT|XPD|HG}` → `price` (USD). Modul med metallval och valuta (räkna om via Frankfurter). *(Modulen `metal`, kombinerad med open.er-api.com. Koppar (HG) är utelämnad, eftersom priset anges per pund.)*
- [x] **ECB:s styrränta:** `https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.MRR_FR.LEV?lastNObservations=1&format=jsondata` → `dataSets[0].series['0:0:0:0:0:0:0'].observations['0'][0]`.
- [x] **Eurostat** (modul): inflation (`prc_hicp_manr`), arbetslöshet (`une_rt_m`), per land. Format: JSON-stat, `value` + `dimension.time`. Bra för diagram (se 3).
- [x] **Coinpaprika och Blockchain.info** som extra kryptokällor.
- [x] **US Treasury** (amerikanska räntor), lågprio. *(Två färdiga widgets: nu och 2 år som diagram.)*
- [x] Alpha Vantage (olja, aktier, OMX) med egen nyckel via `secret`-param. Riksbankens API blockerar CORS och kräver proxy. *(Klart: modulen `stocks`, aktie eller olja, med secret-nyckel. Kvartspriset är verifierat med demo-nyckeln. Dagliga oljepriser kräver en riktig nyckel, och felmeddelandet från Alpha Vantage visas i widgeten.)*

### 2d. Sverige, energi och väder
- [x] **Svenska kraftnät:** `https://www.svk.se/services/controlroom/v2/situation?date={YYYY}-{MM}-{DD}&biddingArea=SE` → produktion och förbrukning per timme. Bra som diagram bredvid elpriset. *(Endpointen ger bara förbrukning, prognos mot utfall. Hittade ingen produktions-endpoint (`/production` svarar 500). Modulen `svk` ritar det som finns.)*
- [x] **SMHI-varningar:** `https://opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json`. Lista eller beacon (grönt om inga varningar för vald region).
- [x] **SMHI-prognos** som alternativ källa i väder-modulen: `https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/{lon}/lat/{lat}/data.json`.
- [x] **wttr.in** som extra väderkälla: `https://wttr.in/{stad}?format=j1`.

### 2e. Sport och spel
- [x] **ESPN live-resultat** *(Modulen `espn`. SHL finns inte hos ESPN.)* (modul, inofficiellt API): `https://site.api.espn.com/apis/site/v2/sports/{sport}/{liga}/scoreboard`. Ligor: `soccer/swe.1` (Allsvenskan), `soccer/eng.1`, `hockey/nhl`, `basketball/nba` m.fl. Visa "{hemmalag} {mål}–{mål} {bortalag} · {status}".
- [x] **Nästa F1-race** med nedräkning: `https://api.jolpi.ca/ergast/f1/current/next.json`.
- [~] **TheSportsDB** (gratisnyckel `3` i URL:en): tabeller och lagloggor. *(Skippad: kräver nyckel i URL:en.)*
- [x] **Fortnite-nyheter** (`https://fortnite-api.com/v2/news/br`), **Warframe** (`https://api.warframestat.us/pc/fissures`).

### 2f. Socialt och övrigt
- [x] **Bluesky följare:** `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor={handle}` → `followersCount`. Modul med handle-param. Stat med sparkline.
- [x] **Mastodon trender:** `https://mastodon.social/api/v1/trends/tags`.
- [x] **Wikipedia-sidvisningar** *(v1.2, modulen `wiki_views`.)* (hype-mätare): `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/{Artikel}/daily/{start}/{slut}`. Utmärkt för diagram.
- [x] **NASA EONET** (pågående bränder, stormar, vulkaner): `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=20`.
- [x] **Solutbrott:** `https://services.swpc.noaa.gov/json/goes/primary/xray-flares-latest.json`.
- [x] Citat/skämt/bilder från sheetet: Breaking Bad, Game of Thrones, AnimeChan, Geek Jokes, Rick and Morty, Cataas, Picsum, DiceBear, RoboHash. *(Geek Jokes, Rick and Morty, Cataas och Picsum är tillagda. Breaking Bad och GoT svarade 429, AnimeChan 404 och Robohash inte alls, så de är skippade. DiceBear ger bara SVG-bilder, inte JSON som bildwidgeten behöver.)*

---

## 3. Diagram (ny displaytyp `chart`)

Målet: data som är en tidsserie ska kunna visas som diagram, inte bara som ett tal.

- [x] **Motor:** ny displaytyp `chart` *(Klart. Fälten heter `xField`/`yFields`, inte `x`/`y`, eftersom custom-widgets lagrar inställningarna bredvid sin gridposition. Olika enheter ritas som paneler över en gemensam x-axel, aldrig två y-skalor i samma panel.)* med undertyperna `line`, `area`, `bar`. Konfig: `series` (sökväg till array), `x` (fält eller index), `y` (fält, flera tillåtna), `xFormat` (`time|date|hour`). Rita med inline SVG (som gauge och sparkline gör i dag) för att slippa beroenden. Om det blir för komplext: vendora uPlot (MIT, ~50 KB) i `vendor/`.
- [x] Axlar med enheter, max 5 etiketter per axel, markör för "nu" på tidsserier, tooltip på hover/touch, följer temat.
- [x] **Diagram som ska finnas från start:** *(Alla 7: Kraftnät (förbrukning) och Eurostat tillkom i 2c/2d. Tidigare 5 av 7: elpris ("Show: Whole day"), `forecast`, `coin_chart`, `quakes` som chart och `wiki_views`. Kraftnät och Eurostat görs med 2c/2d.)*
  - Elpris idag, 96 kvartar som staplar med markör på nu, billigaste timmen markerad. (Elpris-modulen: lägg till "Visa: Nu / Hela dagen".)
  - Väderprognos 48 h från Open-Meteo `hourly=temperature_2m,precipitation` (linje + staplar).
  - Kryptopris senaste 7/30 dagarna: `https://api.coingecko.com/api/v3/coins/{id}/market_chart?vs_currency=usd&days=7`.
  - Svenska kraftnät förbrukning och produktion idag.
  - Jordbävningar per timme senaste dygnet (räkna från USGS-flödet).
  - Eurostat inflation per månad för valt land.
  - Wikipedia-sidvisningar för en artikel, 30 dagar.
- [x] **Historik för alla `stat`-widgets:** *(`beyond.history.v1`, visningsläget "History" erbjuds för alla stat-widgets.)* spara sparkline-historiken i `localStorage` (max 200 punkter per widget) så att den överlever omladdning, och låt användaren växla en stat-widget till linjediagram.
- [x] Custom API-editorn ska kunna välja `chart` när den valda sökvägen är en array av objekt med tal.

---

## 3b. Kombinerade widgets (flera API:er i en widget)

Målet: en widget kan hämta från flera källor och räkna fram eller kombinera ett värde. Exempel: "Guld i kr/gram" = guldpris (USD/oz) × USD→SEK ÷ 31,1035.

**Motor:**
- [x] Ny widgetform med `sources`: `{ sources: { gold: {url, path}, fx: {url, path} }, value: "gold * fx / 31.1035", display, unit, ... }`. Varje källa hämtas via den delade cachen (punkt 1), parallellt.
- [x] `value` är ett **säkert uttryck, inte `eval`**. Skriv en liten parser (tal, källnamn, `+ - * / ( )`, jämförelser `< > <= >= == !=`, `and/or/not`, och en vitlista med funktioner: `min max abs round avg sum distance(lat1, lon1, lat2, lon2) if(villkor, a, b)`). Okända namn ger ett tydligt fel i widgeten.
- [x] Mallar ska kunna referera alla källor: `{gold} · {fx|round}`, och fält inom en källa: `{iss.latitude}`.
- [x] Om en källa failar: visa vilken källa det gäller ("ISS-källan svarar inte") i stället för ett generellt fel.
- [x] Beacon-läget ska kunna använda ett villkorsuttryck: `ok: "kp >= 4 and clouds < 40 and night"`. *(Fälten heter `okIf`/`warnIf`, plus `calc` för namngivna mellansteg och `words` för beacon-texterna.)*
- [x] Custom API-editorn får ett läge "Kombinera källor": lägg till källa (URL + fältväljaren som redan finns), ge den ett kort namn, skriv uttrycket, se förhandsvisning live.
- [x] Delningslänkar fungerar som vanligt. Nycklar i någon källa rensas på samma sätt som i dag.

**Färdiga exempel att lägga i banken.** Alla källor är testade och fungerar från webbläsaren: *(Alla åtta finns som moduler med plats-param, så de utgår från hemorten. Valutakurs: open.er-api.com, eftersom frankfurter.app svarar 301 utan CORS.)*
- [x] **Guld i kr/gram:** `api.gold-api.com/price/XAU` (`price`) × Frankfurter USD→SEK ÷ 31,1035. Samma för silver (`XAG`).
- [x] **Kan jag se norrsken ikväll?** NOAA Kp-index (`services.swpc.noaa.gov/json/planetary_k_index_1m.json`, `[-1].estimated_kp`) + Open-Meteo molnighet och `is_day` för hemorten. Beacon: grönt om Kp ≥ 4, moln < 40 % och mörkt; gult om två av tre stämmer; annars rött. Texten förklarar varför ("Kp 2, för lågt").
- [x] **Hur långt bort är ISS från dig?** `api.wheretheiss.at/v1/satellites/25544` + hemortens koordinater → `distance()` i km. Stat med sparkline.
- [x] **Hemma jämfört med Sydpolen:** Open-Meteo-temperatur för hemorten och för Sydpolen → "Det är 58 °C varmare i Göteborg än på Sydpolen."
- [x] **Är elen billig just nu?** Elpris för nuvarande kvart jämfört med dagens snitt för samma elområde (en källa, men räknad): "18 % billigare än snittet idag", med grön/gul/röd färg.
- [x] **Bitcoin i kronor med marknadshumör:** Coinbase BTC-USD × USD→SEK + Fear & Greed (`api.alternative.me/fng/`) → "742 000 kr · Greed (63)".
- [x] **Paraply till bussen?** SL-avgångar för vald hållplats + Open-Meteo nederbörd nästa timme → "Buss 4 om 6 min · ta paraply". Kräver SL-modulen från 2a.
- [x] **Morgonbrief (textkort):** väder hemma + nästa röda dag + nästa raketuppskjutning + elpris nu i en och samma widget.

---

## 4. Egna widgets utan API (lokal data)

Allt sparas lokalt. **Innehållet ska inte följa med i delningslänkar** (bara att widgeten finns, tom), eftersom det är personligt.
*(Byggt som moduler med `local: "todo"` osv. i `blueprints.js`, ritas av `js/local.js`. Innehållet ligger i `beyond.local.v1` per widget-id.)*

- [x] **Todo-lista:** lägg till, bocka av, ta bort, dra för att sortera, rensa klara. Flera listor (en per widget, med namn).
- [x] **Anteckning:** fritext med enkel markdown (rubrik, fet, lista).
- [x] **Pomodoro-timer:** 25/5 min (konfigurerbart), start/paus/nollställ, räknare för avklarade pass idag, ljud vid slut (kräver ett första klick), visar tid kvar i flikens titel när den går.
- [x] **Klocka och världsklockor:** valfria tidszoner via `Intl`.
- [x] **Nedräkning till datum:** "Semester om 23 dagar".
- [x] **Månfas:** räkna lokalt (ingen API behövs).
- [x] **Årets/dagens framsteg:** "78 % av 2026 har gått" som gauge.
- [x] Lägg dem i en ny kategori "Personal" i banken och som intresse "Productivity" i välkomstflödet.

---

## 5. Flera dashboards

- [x] Datamodell: `beyond.boards.v1 = { active: id, boards: [{id, title, icon?, widgets}] }`. Migrera automatiskt från `beyond.dashboard.v2` till första boarden.
- [x] Byte av board via flikar i verktygsfältet (desktop) och meny (mobil). Kortkommandon `1`–`9`. *(Flikarna visas från två boards. På mobil (≤720 px) göms de och Boards-knappen öppnar listan.)*
- [x] Skapa ny (tom eller från välkomstflödet), byt namn, duplicera, radera (med ångra), ändra ordning.
- [x] Delningslänken delar den aktiva boarden. Att öppna en delad länk ska erbjuda "Lägg till som ny board" i stället för att ersätta.
- [x] Varje board kan ha egen hemort (påverkar standardplats i nya moduler).

---

## 6. Väggskärmsläge (kiosk)

- [x] Knapp som går till helskärm, döljer verktygsfält och widgetknappar och låser layouten (inget drag). *(`js/kiosk.js`. Håller också skärmen vaken med Wake Lock där det stöds. Solberäkningen ligger i engine och är testad.)*
- [x] Automatiskt mörkt tema mellan solnedgång och soluppgång för hemorten.
- [x] Valfri automatisk växling mellan boards var N:e minut.
- [x] `?kiosk=1&board={id}` i URL:en så att en iPad eller TV kan starta direkt i läget. Använd `?`, inte `#`, eftersom `#d=` redan används för delning.

---

## 6b. Säkerhet i delningslänkar

En delad board kan innehålla egna API-adresser (Custom API och kombinerade widgets). När mottagaren öppnar länken anropar deras webbläsare de adresserna direkt, och avsändaren kan då se mottagarens IP-adress eller följa upp när länken öppnas.

- [x] När en delad länk öppnas: lista alla domäner som **inte** finns i katalogen (`blueprints.js`) innan något hämtas. Mottagaren väljer "Ladda alla", "Bara katalogens källor" eller "Avbryt". Widgets från katalogen laddas direkt som i dag.
- [x] Widgets från okända domäner som inte godkänts visar "Inte laddad: {domän}" med en knapp för att godkänna just den.
- [x] Godkända domäner sparas per board, så att frågan inte kommer tillbaka.
- [x] Bildwidgets: ladda bara bilder via `https:` och sätt `referrerpolicy="no-referrer"` på `<img>`.
- [x] Granska att all text från API:er går genom `esc()` innan den hamnar i `innerHTML` (mallar, listor, bildtexter, felmeddelanden). Lägg till ett test som skickar `<img src=x onerror=alert(1)>` genom varje displaytyp.
- [x] Delningslänken ska aldrig innehålla innehållet i todo-listor, anteckningar eller nycklar (se 1 och 4). Lägg till test för det. *(Testat i `share.test.js`.)*
- [x] Begränsa delningslänkens storlek (t.ex. 16 KB avkodat) och validera strukturen vid import, så att en trasig eller manipulerad länk inte kraschar appen.

---

## 6c. Tester

Inget byggsteg, inga testramverk som kräver kompilering. Kör med Node 20+ (`node --test`).

- [x] Flytta de rena funktionerna (`pick`, `pickNow`, `tmpl`, `resolve`, `fmt`, `countdown`, `fillPlaceholders`, `buildCfg`, `encode`/`decode` för delningslänkar och uttrycksparsern från 3b) till `js/engine.js` *(klart utom uttrycksparsern, som inte finns än. Även `hydrate`, `shareable`, `catalogHosts` ligger där. Visningstyperna ligger i `js/displays.js`, också utan DOM vid laddning. `tests/load.js` laddar scripten i Node i samma ordning som webbläsaren.)* så att de kan laddas både i webbläsaren och i Node. Exportera via `if (typeof module !== "undefined") module.exports = {...}`.
- [x] `tests/engine.test.js`: sökvägar (inklusive `[-1]` och `[now]`), mallar med filter, formatering, platshållare, `scale`.
- [x] `tests/share.test.js`: kodning och avkodning tur och retur, att nycklar och secret-headers rensas, att todo-innehåll aldrig följer med, att trasiga länkar avvisas.
- [x] `tests/expr.test.js`: uttrycksparsern. Giltiga uttryck, operatorprioritet, okända namn ger fel, och att försök som `constructor`, `__proto__` och `this` inte går att köra.
- [x] `tests/catalog.test.js`: varje modul i `blueprints.js` bygger en giltig konfig för sina standardparametrar och för varje val i varje `choice`-param. Varje blueprint har `id`, `name`, `desc`, `category` och antingen `mod` eller `url`.
- [x] `tests/migration.test.js`: `beyond.dashboard.v2` migreras korrekt till flera dashboards utan dataförlust.
- [x] GitHub Action som kör `node --test` på varje push och pull request, i samma workflow som hälsokollen i punkt 1. *(`.github/workflows/ci.yml`. Hälsokollen läggs till där i v1.3.)*
- [x] `tests/displays.test.js`: XSS-payload genom varje displaytyp, och att bilder bara visas via https.

---

## 6d. Installerbar app (PWA)

- [x] `manifest.webmanifest`: namn, ikoner (192 och 512 px, maskable), `display: "standalone"`, temafärger för ljust och mörkt.
- [x] `sw.js` (service worker): cacha appskalet (`index.html`, `js/`, `css/`, `blueprints.js`, `vendor/`) så att appen startar offline. Cachenamnet ska följa versionsnumret från regel 3 så att en ny release ersätter den gamla cachen.
- [x] Spara senaste lyckade svar per widget (redan i minnet i `rt`) även i IndexedDB, och visa det med märkningen "Offline, data från 14:32" när nätet saknas.
- [x] API-svar ska **inte** cachas av service workern (de ska alltid vara färska när det finns nät).
- [ ] Testa installation på iPad (Safari, "Lägg till på hemskärmen") och Android (Chrome), och att väggskärmsläget från 6 fungerar i installerat läge. *(Kräver riktiga enheter: Jesper testar.)*
- [x] Service workers fungerar inte på `file://`. Appen ska fortfarande fungera där, bara utan offline-stöd.

---

## 7. Städning

- [x] `index.html` är ~1 400 rader. Dela upp i flera klassiska scripts (`js/engine.js`, `js/displays.js`, `js/bank.js`, `js/editor.js`, `js/welcome.js`, `js/share.js`) och `css/app.css`. Behåll laddordningen. Inga ES-moduler (se regel 1).
- [x] Uppdatera README: nya funktioner, hur man lägger till moduler med `secret`-param och `chart`, och proxy-instruktionen. *(v1.1-delen klar: boards, lokala widgets, backup, säkerhet, param-typerna, tester. `chart` och proxy kvar.)*
- [x] Lägg till en GIF överst i README som visar drag och reflow, modulinställning och delning. *(`docs/demo.gif`, 5,5 MB. Krymp gärna med gifsicle om det behövs.)*

---

## Milstolpar

Gör en milstolpe i taget. Släpp den (bumpa versionen, pusha, testa live på GitHub Pages) innan nästa påbörjas.

### v1.1: Vardagsverktyget
Mål: något man har uppe varje dag.
- 7 (städning): dela upp `index.html` i `js/` och `css/` **först**, eftersom resten bygger på det.
- 1: delad fetch-cache, `secret`-param, export/import.
- 6b: säkerhet i delningslänkar.
- 6c: testerna för motor, delning och katalog (resten läggs till i takt med v1.2).
- 5: flera dashboards, inklusive migrering och `migration.test.js`.
- 4: todo-lista, anteckning, pomodoro, klocka.
- 2a: SL-avgångar. 2b: Sveriges Radio live.

### v1.2: Data som berättar något
Mål: diagram och smarta widgets.
- 3: displaytypen `chart` och de sju startdiagrammen.
- 3b: kombinerade widgets, uttrycksparsern (med `expr.test.js`) och de åtta exemplen.
- 2c: ekonomi (metaller, ECB, Eurostat).
- 2d: Svenska kraftnät, SMHI.

### v1.3: Bredd och väggen
Mål: fler källor och ett läge för väggskärmar.
- 2b: RSS-stöd och proxy. 2e och 2f: sport, socialt, övrigt.
- 2a: Västtrafik och ResRobot (kräver nycklar för att testa).
- 1: hälsokoll av katalogen i CI.
- 6: väggskärmsläge. 6d: PWA.
- 4: resten av de lokala widgetarna (nedräkning, månfas, årets framsteg).
- 7: README och GIF.
