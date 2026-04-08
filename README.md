# Codex Usage Dashboard

Self-hosted web app for monitoring ChatGPT / Codex subscription account quotas.

## Features

- **Multi-account dashboard** — add/remove ChatGPT accounts via OAuth
- **Quota tracking** — 5h and weekly usage windows with progress bars and reset times
- **Subscription status** — plan type and expiry extracted from OAuth id_token (no Cloudflare issues)
- **History charts** — 24h / 7d / 30d usage trends per account (Recharts)
- **Two-tier auto-refresh**:
  - **Live** (client-side) — polls when the page is open (Off / 10s / 30s / 1m / 5m)
  - **Background** (server-side) — refreshes when no browser is connected (1m / 5m / 15m / 30m)
- **Auto token refresh** — OAuth tokens are refreshed before expiry

## Tech Stack

- **Backend:** Node.js (plain HTTP server, ESM), `undici` for proxied fetch
- **Frontend:** React 19, Vite 6, Tailwind CSS 4, TypeScript, Radix UI, Recharts, TanStack Query
- **Data:** JSON files in `data/` (no database needed)

## Setup

```bash
npm install
npx vite build   # build frontend
npm start         # start server
```

With custom port:

```bash
PORT=1455 npm start
```

Install deps, rebuild, and start in one command:

```bash
npm run start:setup
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

## Data Storage

- `data/accounts.json` — OAuth tokens and account state (gitignored)
- `data/settings.json` — refresh intervals (`liveInterval`, `backgroundInterval`)
- `data/history.json` — usage snapshots for history charts

## Structure

```
server.mjs          — backend: HTTP server, OAuth, API, auto-refresh
src/                — React frontend source
  components/       — AccountCard, QuotaBlock, RefreshPicker, TopBar, etc.
  pages/            — Dashboard, History
  lib/              — API client, hooks, utils, router
  types/            — TypeScript interfaces
dist/               — built frontend (served by server.mjs)
data/               — local storage (gitignored)
```
