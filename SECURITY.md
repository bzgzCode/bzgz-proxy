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
