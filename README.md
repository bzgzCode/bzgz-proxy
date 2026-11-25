# Bzgz Proxy

A Telegram bot + Mini App that lets anyone deploy personal **Telegram WEB proxies** on **their own Cloudflare account** — free tier, no VPS, no server to maintain.

**English** · [فارسی](README.fa.md)

## Features

- **One-tap proxies** — users paste a Cloudflare API token once; the bot deploys a proxy worker to *their* account. The token is used for a single API call and **never stored**.
- **Bot + Mini App** in English, Russian and Persian.
- **Many proxies per user** (one per family member), rename, update, delete, usage charts.
- **Health monitoring** — owners get a Telegram message when a proxy goes down.
- **Forced channel join** (public or private channels), lockable with `/lock on|off`, enforced in the bot *and* in the Mini App API.
- **Proxy controls** in the Mini App: status, pause/resume, new link, update, rename, delete.
- **Fixed server location** (Auto / Europe / USA / Asia) and **updates that keep every user's settings**.
- **Share by name** — a friend types `saman` (+ optional password) in the bot and uses your proxy without a token; **usage page** on each proxy's own link; **manual, opt-in updates** with an in-app notice; ping test.
- **Support tickets**, admin panel, ban/unban, broadcast.
- **Proxy core v5** — per-deployment decoy website (Persian), keyed `/health`, constant-time checks, hedged upstream dial, lane retry (no session drops), per-IP and global lane caps, optional country allow-list.

## How it works

```
Telegram app ──HTTPS/WebSocket──▶ user's Cloudflare Worker (core) ──WebSocket──▶ Telegram DCs
                                         ▲ usage reports
Bot / Mini App (this repo's worker + D1) ┘ deploys and monitors the proxies
```

Two kinds of workers are involved:

| Worker | Where it runs | Code |
|---|---|---|
| **Bot** (manager) | your Cloudflare account, with a D1 database | `src/worker.js`, `src/app.html` |
| **Proxy core** | each *user's* own Cloudflare account | `src/core.html` (deployed by the bot) |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start

Requirements: Node.js 18+, a Cloudflare account, a bot token from [@BotFather](https://t.me/BotFather), your numeric Telegram id.

```bash
git clone https://github.com/<you>/bzgz-proxy && cd bzgz-proxy
npm install
npx wrangler d1 create bzgz-proxy      # copy database_id into wrangler.toml
npm run db:init
# set OWNER_ID in wrangler.toml, then:
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WH_SECRET      # any long random string
npm run deploy
# open once in a browser to register webhook, menu and commands:
# https://<your-worker>.workers.dev/setup/<WH_SECRET>
```

Full guide: [docs/SETUP.md](docs/SETUP.md) · [فارسی](docs/SETUP.fa.md)

## Tests

```bash
npm test      # Node 22+
```

The end-to-end suite simulates a Telegram client, the bridge page, the worker and Telegram's upstream (using `node:crypto` for the client/upstream side). It does **not** talk to real Telegram or Cloudflare, so behaviour with real clients can still differ.

## Limits and disclaimer

- Cloudflare's free plan has request and CPU limits (e.g. 100,000 requests/day per account). Heavy use may be throttled.
- `*.workers.dev` hostnames are blocked in some countries. A custom domain on Cloudflare helps, but is not set up automatically.
- Each user deploys to **their own** account and is responsible for complying with Cloudflare's Terms of Service and the laws that apply to them. Review the terms before running a proxy.
- Not affiliated with or endorsed by Telegram or Cloudflare. Provided "as is", without warranty (see [LICENSE](LICENSE)).

## Contributing, security, license

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [MIT License](LICENSE)
