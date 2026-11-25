# Changelog

## 7.1

- **Proxy core v5 — fewer disconnects.** A lane that fails to open is retried (3 times, short back-off) and only that lane is dropped; before, one failed connection closed the whole session, which looked like constant reconnecting. The Telegram-side dial is hedged (parallel attempts, first socket that opens wins). Per-IP lane cap raised from 128 to 1024 because many mobile subscribers (CGNAT) share one address. Fewer buffer copies on the hot path.
- **13 server locations with country flags** (Netherlands, Germany, UK, France, Sweden, UAE, Bahrain, India, Singapore, Japan, USA, plus Smart and Automatic).
- Prettier action buttons.
- Existing proxies keep running the old core until their owner taps *Update*.

## 7.0

- **Share a proxy by name:** the owner gives a proxy a name (e.g. `saman`) and an optional password; a friend writes it in the bot (or `/use saman`, or the “Use a friend's proxy” button) and gets the proxy — no Cloudflare account or token. Passwords are stored as salted PBKDF2-SHA256 hashes, 5 wrong tries lock the name for 15 minutes and alert the owner, “New link” or removing the share cuts everyone off.
- **Usage page on each proxy's own link:** `https://<proxy>.workers.dev/_u/<secret>` shows today / 7-day traffic. Served by a thin wrapper deployed in front of the unmodified core; without the secret the path behaves like any other.
- **Forced join lives in the bot chat**, not in the Mini App: the bot sends the join message with buttons, the panel only points to it.
- **Manual updates only:** each proxy records its code version; the panel shows an “Update available” notice with release notes and an *Update now* button. Nothing is ever pushed to users' proxies, and declining keeps the old version working.
- Ping test button (device → proxy delay), cleaner cards, fixes: replies are now awaited so they cannot be dropped.
- **Smart placement** is now the default server location (best for mobile data); fixed regions remain available.
- Compact 3-column action tiles on proxy cards (much shorter page).
- Proxy core unchanged.

## 6.0

- **Updates never wipe users' settings:** schema is created idempotently at start-up; proxy *Update* keeps link, pause state, location and custom Cloudflare variables (`keep_bindings`).
- **Fixed server location** (Auto / Europe / USA / Asia) via Cloudflare placement hints, chosen when creating or updating a proxy. Proxy core unchanged.
- **Forced join:** fails closed when mis-configured (bot not admin) instead of letting everyone in; `/lock on` self-tests every channel.
- **Security:** webhook secret-token header, constant-time secret comparisons, strict CSP and security headers on the Mini App, clearer in-app security card, security model documented.
- Removed the hard-coded credit handle from the code.
- Mini App: nicer navigation, location picker, security card.

## Unreleased

- Forced join can be switched on/off from the bot (`/lock on|off`) and from the Mini App settings; users see a "you have joined" confirmation after joining and on `/start`.
- Private channels supported (`/addchannel -100… https://t.me/+invite`, or the bot creates the invite link itself).
- Mini App: proxy status badges, last report time, **pause / resume** and **new link** actions, labelled action cards, "Get the latest Telegram" card (Google Play, App Store, telegram.org/dl).
- Token creation now uses a pre-filled Cloudflare link (Workers Scripts: Edit + Account Settings: Read).
- Fixes: rename rejects empty names, delete tolerates already-removed workers, partial create keeps finished proxies, per-user cap of 30, removing a proxy also clears its usage rows, monitor skips paused proxies.
- Proxy core unchanged.

## 4.0.0
- New proxy core v4: per-hostname Persian decoy, keyed `/health`, token key separation, constant-time comparisons, retrying upstream dial, back-pressure cap, per-IP and global lane caps, optional `GEO` allow-list, BigInt-free AES-CTR.
- Forced join is now enforced in the Mini App API and has a join screen in the panel; membership cache 60 s; channel changes reset the cache.
- Bot only processes private chats; HTML-escaped ticket close; webhook errors are logged.
- Monitor sends `x-k` header to the new keyed `/health`.
- End-to-end test suite and CI.
