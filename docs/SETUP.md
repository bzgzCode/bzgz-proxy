# Setup guide

[فارسی](SETUP.fa.md)

## 1. Prerequisites
- Node.js 18+ and npm
- A Cloudflare account (free plan is enough)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Your numeric Telegram id (ask [@userinfobot](https://t.me/userinfobot))

## 2. Cloudflare API token for deploying the bot
Create a token at <https://dash.cloudflare.com/profile/api-tokens> → *Create Token* → *Custom token* → **Start with an Account policy**:
- `Workers Scripts` → **Edit**
- `D1` → **Edit**
- Account Resources → your account

Export it for Wrangler: `export CLOUDFLARE_API_TOKEN=...` (never commit it).

## 3. Database
```bash
npx wrangler d1 create bzgz-proxy
```
Copy the printed `database_id` into `wrangler.toml`, then:
```bash
npm run db:init
```
Upgrading an old database? Run `bash migrate.sh` (adds missing columns; "duplicate column" messages are harmless).

## 4. Configure and deploy
1. In `wrangler.toml` set `OWNER_ID` to your numeric Telegram id.
2. Add secrets:
   ```bash
   npx wrangler secret put BOT_TOKEN
   npx wrangler secret put WH_SECRET     # any long random string; keep it private
   ```
3. `npm run deploy`
4. Open `https://<your-worker>.workers.dev/setup/<WH_SECRET>` once. You should see `"ok":true`.
5. Send `/start` to your bot.

## 5. Forced channel join
1. Add the bot as **admin** of a public channel.
2. As owner send `/addchannel @yourchannel` (or use panel → Settings).
3. Test with a normal account. Owner and admins are exempt; use `/testjoin` to preview and `/joininfo` to debug.

Users who have not joined are blocked in the bot and in the Mini App. Membership is cached for 60 seconds. If Telegram refuses the membership check (for example the bot is not an admin), users are let through and the owner is warned once an hour.

## 6. Proxy core options
Optional variables on each proxy worker (set by editing the deploy code or in the Cloudflare dashboard):
| Variable | Meaning |
|---|---|
| `GEO` | Allowed countries, e.g. `IR,DE`. Empty = everyone |
| `LANES_PER_IP` | Max concurrent connections per IP (default 128) |
| `MAX_LANES` | Max concurrent connections per worker instance (default 2000) |

Existing proxies keep their old core until the user taps **Update** in the panel.

## 7. Commands
Users: `/start /proxies /profile /support /help /new /cancel`
Admins: `/admin /user id /ban id /unban id /adduser id /broadcast text /testjoin /joininfo`
Owner: `/addadmin id /rmadmin id /addchannel @x /rmchannel @x`

## Troubleshooting
| Symptom | Likely cause |
|---|---|
| `Authentication error` on `/d1/database` | API token lacks **D1 → Edit** |
| Telegram `404 Not Found` during webhook setup | Wrong or revoked `BOT_TOKEN` |
| Bot silent after deploy | Webhook not registered: open `/setup/<WH_SECRET>` again |
| Forced join does nothing for you | You are the owner/admin (exempt) |
| Forced join never blocks anyone | Bot is not admin of the channel; run `/joininfo` |

## Token for your users (one click)

The bot and Mini App link users to a pre-filled Cloudflare page ([open it](https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%5D&accountId=*&zoneId=all&name=Bzgz)): *Workers Scripts: Edit* and *Account Settings: Read* are already selected — press **Continue → Create Token**.

## Forced join

- `/addchannel @name` (bot must be channel admin) or, for a private channel, `/addchannel -100123… https://t.me/+invite` (the invite link is optional if the bot may create invite links).
- `/lock on|off` or the switch in Mini App → Settings turns the requirement on/off without removing channels. `/testjoin` previews what a non-member sees.
