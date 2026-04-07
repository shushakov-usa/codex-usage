# Codex Usage Dashboard

Self-hosted web app for monitoring ChatGPT / Codex subscription accounts.

Features:
- Dynamic OAuth account slots (add/remove)
- Login via ChatGPT OAuth
- Auto-refresh access tokens (every 4 hours)
- Usage data from `https://chatgpt.com/backend-api/wham/usage`
- All accounts on a single dashboard

## Setup

```bash
npm install
npm start
```

With custom port:

```bash
PORT=1455 npm start
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `1455` | Server port |
| `HOST` | `127.0.0.1` | Bind address |
| `OPENAI_PROXY` | _(unset)_ | HTTP proxy for OpenAI requests (takes priority) |
| `https_proxy` / `http_proxy` | _(unset)_ | Standard env proxy (used when `OPENAI_PROXY` is not set) |

### Proxy

OpenAI API requests (`auth.openai.com`, `chatgpt.com`) are routed through the proxy.
Priority: `OPENAI_PROXY` → `https_proxy` → `http_proxy`.

Uses `undici.fetch` with `ProxyAgent` (global `fetch` in Node 25 does not support
third-party dispatchers due to undici version mismatch).

## OAuth & Remote Access

OAuth redirect URI is bound to `http://localhost:$PORT/auth/callback` (Codex OAuth client restriction).

When the dashboard runs on a remote server behind a domain, the localhost redirect won't reach
the browser. Use the manual callback URL paste feature: after OAuth authorization, copy the URL
from the browser address bar and paste it into the input field on the dashboard page.

## Notes

- Tokens are stored locally in `data/accounts.json`.
- The token file is in `.gitignore`.

## Structure

- `server.mjs` — backend, OAuth callback, API
- `public/` — web UI
- `data/accounts.json` — local account storage
