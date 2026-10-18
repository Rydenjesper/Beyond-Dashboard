# Security

## Reporting a vulnerability

Please don't open a public issue. Report it privately through GitHub: **Security → Report a vulnerability** on this repository. You'll get an answer within a few days.

## What matters most here

Beyond Dashboard has no server, so the sensitive parts are in the browser:

- **Share links.** A link must never carry API keys, auth headers, credentials in URL parameters, or the content of to-do lists and notes. Opening a link must never load an unknown domain without the user's approval, and a malformed link must not break the app.
- **Rendering API data.** Text from APIs must never become HTML (XSS).
- **The expression language** in combined widgets must not reach anything outside its sandbox.
- **The live link** (`mcp/live.js`) listens on 127.0.0.1 only, answers only the dashboard's origins, and needs a one-time pairing code and a token.
- **The RSS proxy** (`proxy/worker.js`) must only pass feeds.

Each of these has tests in `tests/`. A report that comes with a failing test case is the fastest to fix.
