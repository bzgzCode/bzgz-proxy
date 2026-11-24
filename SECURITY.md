# Security policy

## Reporting a vulnerability
Please do **not** open a public issue. Use GitHub's *Report a vulnerability* (Security → Advisories) on this repository, or contact the maintainer privately. Include steps to reproduce and the affected file.

## Scope notes
- User Cloudflare tokens must never be stored or logged. A change that does so is a security bug.
- Secrets (`BOT_TOKEN`, `WH_SECRET`, Cloudflare tokens) must never be committed.

## If you leaked a secret
- Bot token: BotFather → `/revoke`, then `wrangler secret put BOT_TOKEN`.
- `WH_SECRET`: pick a new one, redeploy, open `/setup/<new WH_SECRET>`.
- Cloudflare token or Global API Key: delete or *Roll* it in the dashboard.

---

## گزارش آسیب‌پذیری (فارسی)
لطفاً issue عمومی باز نکنید. از بخش *Report a vulnerability* گیت‌هاب (Security ← Advisories) استفاده کنید. توکن کلودفلر کاربران هرگز نباید ذخیره یا لاگ شود، و سیکرت‌ها (`BOT_TOKEN`، `WH_SECRET`، توکن‌های کلودفلر) هرگز نباید در گیت بروند. اگر سیکرتی لو رفت: توکن بات را با `/revoke` عوض کنید، `WH_SECRET` را عوض و دوباره دیپلوی کنید، و توکن‌های کلودفلر را حذف یا Roll کنید.

## How the bot protects users and the owner

- **Cloudflare tokens are never stored or logged.** They are used for a single API call and dropped. The bot deletes the chat message that contained the token.
- **Least privilege.** The token link pre-selects only *Workers Scripts: Edit* and *Account Settings: Read* — no access to domains, DNS or billing.
- **Mini App requests are verified** with Telegram's signed `initData` (HMAC, 24 h max age, constant-time comparison). Forced join and bans are enforced in the API, not just in the UI.
- **Webhook is authenticated twice:** the URL contains `WH_SECRET`, and Telegram also sends a derived secret token header that is checked in constant time (enabled automatically after `/setup`).
- **Usage reports** from proxies are authenticated with a per-proxy secret (constant-time compare).
- **Secret proxy links.** Every proxy has its own random secret; *New link* rotates it. Paused proxies are switched off at Cloudflare, not just hidden.
- **Hardened responses.** The Mini App is served with a strict Content-Security-Policy (only Telegram may frame it), `nosniff`, `no-referrer` and a restrictive Permissions-Policy.
- **Forced join fails closed** when it is mis-configured (for example the bot is not a channel admin) instead of silently letting everybody in; short Telegram outages fail open. The owner is warned either way.
- **Rate limits and caps:** per-user create limit, 30 proxies per user, input validation on every field.
- **Safe updates.** The database schema is created idempotently on start-up, and updating a proxy keeps its link, pause state and any variables you added in Cloudflare (`keep_bindings`).

Rotate `BOT_TOKEN` (BotFather `/revoke`) and `WH_SECRET` if you ever suspect a leak.

- **Shared proxies:** share passwords are stored only as salted PBKDF2-SHA256 hashes (100 000 rounds), the password message is deleted from the chat, five wrong tries lock the name for 15 minutes and alert the owner. Sharing hands out the proxy link itself, so use a password and *New link* if it leaks.
- **Usage page:** `/_u/<secret>` is served only with the proxy's own secret (constant-time compare), with `no-store`, `noindex` and a strict CSP.
- **Forced join** prompts are sent in the bot chat; the Mini App API never returns channel details to blocked users.

## بات چطور از کاربران و مالک محافظت می‌کند

- **توکن کلودفلر هرگز ذخیره یا لاگ نمی‌شود.** فقط برای یک درخواست استفاده و دور ریخته می‌شود و بات پیامِ حاوی توکن را از چت پاک می‌کند.
- **کمترین دسترسی.** لینک ساخت توکن فقط *Workers Scripts: Edit* و *Account Settings: Read* را انتخاب می‌کند؛ دسترسی به دامنه، DNS و پرداخت وجود ندارد.
- **درخواست‌های مینی‌اپ تأیید می‌شوند** با `initData` امضاشده‌ی تلگرام (HMAC، حداکثر ۲۴ ساعت، مقایسه‌ی زمان‌ثابت). جوین اجباری و بن در خود API اعمال می‌شود، نه فقط در ظاهر.
- **وب‌هوک دو بار احراز می‌شود:** آدرسش `WH_SECRET` دارد و تلگرام هم یک توکن مخفیِ مشتق‌شده در هدر می‌فرستد که زمان‌ثابت بررسی می‌شود (بعد از `/setup` خودکار فعال می‌شود).
- **گزارش مصرف** پروکسی‌ها با سکرتِ اختصاصی هر پروکسی احراز می‌شود.
- **لینک سری.** هر پروکسی سکرت تصادفی خودش را دارد و «لینک جدید» آن را عوض می‌کند. پروکسیِ خاموش در خود کلودفلر خاموش می‌شود، نه فقط مخفی.
- **پاسخ‌های سخت‌شده.** مینی‌اپ با Content-Security-Policy سخت‌گیرانه (فقط تلگرام می‌تواند قابش کند)، `nosniff`، `no-referrer` و Permissions-Policy محدود ارائه می‌شود.
- **جوین اجباری در تنظیم اشتباه بسته می‌ماند** (مثلاً بات ادمین کانال نیست) و بی‌صدا همه را راه نمی‌دهد؛ قطعی کوتاه تلگرام فقط برای همان درخواست باز می‌ماند. در هر دو حالت مالک هشدار می‌گیرد.
- **محدودیت‌ها:** سقف ۳۰ پروکسی برای هر کاربر، محدودیت نرخ ساخت و اعتبارسنجی همه‌ی ورودی‌ها.
- **آپدیت امن.** ساختار دیتابیس هنگام شروع به‌صورت idempotent ساخته می‌شود و آپدیت پروکسی لینک، وضعیت خاموش/روشن و متغیرهایی که خودتان در کلودفلر اضافه کرده‌اید را نگه می‌دارد (`keep_bindings`).

اگر به لو رفتن شک کردید `BOT_TOKEN` (در BotFather با `/revoke`) و `WH_SECRET` را عوض کنید.
