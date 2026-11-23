# Architecture

## Components
- **Bot worker** (`src/worker.js`): Telegram webhook, Mini App API (`/api/*`), usage intake (`/r`), cron monitor. State lives in D1 (`schema.sql`).
- **Mini App** (`src/app.html`): single-page UI served at `/app`, authenticated with Telegram `initData` (HMAC).
- **Proxy core** (`src/core.html`): the worker the bot deploys into each user's account. Implements Telegram's WEB-proxy protocol v1 (websocket-lanes carrier).

## Token handling
The user's Cloudflare token is read from the request, used for the Cloudflare API calls that need it (find account, create `workers.dev` subdomain, upload worker), and dropped. It is never written to D1, KV, logs or env.

## Proxy core flow
1. The Telegram app loads `/?bridge=<HMAC(secret, host)>` — a sandboxed page with a strict CSP.
2. The page posts `HELLO` to `/api/v1/session` with a short-lived bootstrap token and receives a session token.
3. Each Telegram connection opens a WebSocket (`/api/v1/ws`) with sub-protocol `tproxy-lane-v1.<session>.<lane id>`.
4. The lane decrypts the client's obfuscated2 stream, re-encrypts it with a fresh key, and forwards it to `kwsN.web.telegram.org/apiws`.
5. Credit-based flow control; downstream frames are at most 64 KiB.
6. Every unknown request gets a decoy website (Persian, different per hostname). `/health` answers only with header `x-k: <SECRET>`.
7. Every 5 minutes (when active) the core reports request and byte counters to the bot (`/r`, authenticated with the proxy's own secret).

## Data stored (D1)
users, proxies (id, owner, name, URLs, per-proxy secret), usage counters per day, support tickets and messages, admins, forced-join channels, small `meta` key-value rows. No traffic content, no destinations, no Cloudflare tokens.

## Tests
`test/e2e.mjs` wires a fake Telegram client → the real bridge script served by the worker → the worker → a fake upstream. Client and upstream crypto uses `node:crypto` so it is independent of the core's WebCrypto code.
