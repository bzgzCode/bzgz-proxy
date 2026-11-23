# Changelog

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
