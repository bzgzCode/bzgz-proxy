// Bzgz Proxy Bot v3 — Cloudflare Worker + D1 (free tier)
// Bindings: DB (D1) | Secrets: BOT_TOKEN, WH_SECRET | Var: OWNER_ID (Telegram numeric id of the owner) | Cron: */5 * * * *
// User Cloudflare tokens are NEVER stored: they live in memory only for the one API call that needs them.
import PROXY_CODE from './core.html';
import APP_HTML from './app.html';

const BUNDLE = 'v8'; // bumped whenever the proxy code changes; users update their proxies themselves, nothing is ever pushed automatically
// Wrapper placed in front of the unmodified proxy core: serves the private usage page at /_u/<secret>, everything else goes to the core.
const WRAP = `import core from './core.js';
const E = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const B = (b) => (b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : (b / 1e3).toFixed(0) + ' KB');
const same = (a, b) => { a = String(a || ''); b = String(b || ''); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; };
const TX = {
  en: { dir: 'ltr', h: 'Proxy usage', today: 'Today', week: 'Last 7 days', total: 'Requests today', st: 'Status', on: 'Online', off: 'Paused', none: 'Usage data is not available right now. Try again in a minute.', priv: 'This page is private — only people with this exact link can see it.' },
  fa: { dir: 'rtl', h: 'مصرف پروکسی', today: 'امروز', week: '۷ روز اخیر', total: 'درخواست‌های امروز', st: 'وضعیت', on: 'فعال', off: 'متوقف', none: 'اطلاعات مصرف الان در دسترس نیست. یک دقیقه بعد دوباره امتحان کن.', priv: 'این صفحه خصوصی است؛ فقط کسی که این لینک دقیق را دارد می‌بیند.' },
};
const page = (L, d) => {
  const x = TX[L], mx = Math.max(1, ...d.days.map((s) => s.b));
  const bars = d.days.map((s) => '<i title="' + E(s.d) + ' · ' + B(s.b) + '" style="height:' + Math.max(6, (s.b / mx) * 100) + '%"></i>').join('');
  return '<!doctype html><html lang="' + L + '" dir="' + x.dir + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + x.h + '</title><style>' +
    ':root{color-scheme:dark light;--bg:#0e1621;--c:#17212b;--t:#f5f7fa;--m:#8b98a5;--a:#2ea6ff}@media(prefers-color-scheme:light){:root{--bg:#eef2f6;--c:#fff;--t:#10202e;--m:#5b6b7a}}' +
    '*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--t);font:16px/1.6 system-ui,-apple-system,Segoe UI,Tahoma,sans-serif}' +
    '.w{width:100%;max-width:420px;background:var(--c);border-radius:20px;padding:24px;box-shadow:0 10px 40px rgba(0,0,0,.25)}h1{margin:0 0 4px;font-size:20px}.n{color:var(--m);margin:0 0 18px}' +
    '.g{display:grid;grid-template-columns:1fr 1fr;gap:10px}.k{background:rgba(127,127,127,.12);border-radius:14px;padding:14px}.k small{display:block;color:var(--m)}.k b{font-size:22px}' +
    '.s{display:flex;align-items:flex-end;gap:6px;height:90px;margin:18px 0 6px}.s i{flex:1;background:var(--a);border-radius:6px 6px 2px 2px;opacity:.9}.p{color:var(--m);font-size:13px;margin:16px 0 0}.d{display:inline-block;width:9px;height:9px;border-radius:50%;margin-inline-end:6px;background:' + (d.off ? '#f5a623' : '#31c27c') + '}' +
    '</style></head><body><div class="w"><h1>📊 ' + x.h + '</h1><p class="n">' + E(d.name) + ' · <span class="d"></span>' + (d.off ? x.off : x.on) + '</p><div class="g"><div class="k"><small>' + x.today + '</small><b>' + B(d.tb) + '</b></div><div class="k"><small>' + x.week + '</small><b>' + B(d.wb) + '</b></div></div>' +
    '<div class="s">' + bars + '</div><p class="p">' + x.total + ': ' + Number(d.tr).toLocaleString('en') + '</p><p class="p">🔒 ' + x.priv + '</p></div></body></html>';
};
export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url);
    if (req.method === 'GET' && u.pathname.startsWith('/_u/') && env.SECRET && same(decodeURIComponent(u.pathname.slice(4)), env.SECRET)) {
      const L = u.searchParams.get('l') === 'en' || (u.searchParams.get('l') !== 'fa' && !/fa/i.test(req.headers.get('accept-language') || '')) ? 'en' : 'fa';
      const h = { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" };
      try {
        const r = await fetch(String(env.REPORT).replace(/\\/r$/, '/u'), { method: 'POST', body: JSON.stringify({ p: env.PID, k: env.SECRET }), headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(6000) });
        if (!r.ok) throw 0;
        return new Response(page(L, await r.json()), { headers: h });
      } catch { return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font:16px system-ui;padding:24px" dir="' + TX[L].dir + '">' + TX[L].none, { status: 503, headers: h }); }
    }
    return core.fetch(req, env, ctx);
  },
};
`;

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const hx = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
const rid = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join('');
const day = () => new Date().toISOString().slice(0, 10);
const ago = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const fmtB = (b) => (b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : (b / 1e3).toFixed(0) + ' KB');
const OWNER = (env) => Number(env.OWNER_ID);

/* ---------- D1 helpers ---------- */
const bind = (env, sql, a) => env.DB.prepare(sql).bind(...a);
const one = (env, sql, ...a) => bind(env, sql, a).first();
const all = async (env, sql, ...a) => (await bind(env, sql, a).all()).results;
const run = (env, sql, ...a) => bind(env, sql, a).run();
const metaGet = async (env, k) => (await one(env, 'SELECT v FROM meta WHERE k=?', k))?.v;
const metaSet = (env, k, v) => run(env, 'INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', k, v);
const role = async (env, id) => (id === OWNER(env) ? 'owner' : (await one(env, 'SELECT id FROM admins WHERE id=?', id)) ? 'admin' : 'user');

/* ---------- security helpers ---------- */
// constant-time string compare (no early exit, so timing reveals nothing about a secret)
const eq = (a, b) => { a = String(a ?? ''); b = String(b ?? ''); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; };
// Telegram echoes this value in a header on every webhook call; derived from WH_SECRET so there is nothing extra to configure
const hookTok = async (env) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('bzgz-hook:' + env.WH_SECRET)))].slice(0, 16).map((x) => x.toString(16).padStart(2, '0')).join('');
const SEC = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()', 'cross-origin-opener-policy': 'same-origin' };
const CSP = "default-src 'none'; script-src 'self' 'unsafe-inline' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.workers.dev; base-uri 'none'; form-action 'none'; frame-ancestors https://web.telegram.org https://*.telegram.org https://telegram.org";
function secure(r, app) { try { for (const [k, v] of Object.entries(SEC)) r.headers.set(k, v); if (app) r.headers.set('content-security-policy', CSP); } catch {} return r; }

// Idempotent: creates anything that is missing and never touches existing data, so every deploy is safe — even if the schema step was skipped.
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)',
  "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT 'User', joined INTEGER NOT NULL DEFAULT 0, last INTEGER NOT NULL DEFAULT 0, lang TEXT, state TEXT, banned INTEGER NOT NULL DEFAULT 0, notify INTEGER NOT NULL DEFAULT 1, jchk INTEGER NOT NULL DEFAULT 0, extra TEXT)",
  'CREATE TABLE IF NOT EXISTS proxies (id TEXT PRIMARY KEY, uid INTEGER NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, enter TEXT NOT NULL, secret TEXT NOT NULL, created INTEGER NOT NULL, fail INTEGER NOT NULL DEFAULT 0, seen INTEGER NOT NULL DEFAULT 0)',
  'CREATE INDEX IF NOT EXISTS idx_proxies_uid ON proxies(uid)',
  'CREATE TABLE IF NOT EXISTS usage (pid TEXT NOT NULL, day TEXT NOT NULL, req INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (pid, day))',
  'CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY)',
  'CREATE TABLE IF NOT EXISTS channels (id TEXT PRIMARY KEY, title TEXT)',
  "CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER NOT NULL, subject TEXT, status TEXT NOT NULL DEFAULT 'open', created INTEGER NOT NULL, upd INTEGER NOT NULL)",
  'CREATE INDEX IF NOT EXISTS idx_tickets_uid ON tickets(uid)',
  'CREATE TABLE IF NOT EXISTS msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, tid INTEGER NOT NULL, admin INTEGER NOT NULL DEFAULT 0, text TEXT, ts INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_msgs_tid ON msgs(tid)',
  'CREATE TABLE IF NOT EXISTS shares (alias TEXT PRIMARY KEY, pid TEXT NOT NULL, uid INTEGER NOT NULL, salt TEXT NOT NULL DEFAULT \'\', hash TEXT NOT NULL DEFAULT \'\', created INTEGER NOT NULL DEFAULT 0, fails INTEGER NOT NULL DEFAULT 0, lock INTEGER NOT NULL DEFAULT 0, uses INTEGER NOT NULL DEFAULT 0)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_shares_pid ON shares(pid)',
];
let schemaOk = false;
async function ensureSchema(env) {
  if (schemaOk) return;
  try { await env.DB.batch(SCHEMA.map((q) => env.DB.prepare(q))); schemaOk = true; } catch (e) { console.error('schema check failed', e && e.message); }
}

export default {
  async fetch(req, env, ctx) { return secure(await handle(req, env, ctx), new URL(req.url).pathname === '/app'); },
  async scheduled(ev, env, ctx) { ctx.waitUntil(ensureSchema(env).then(() => cron(env))); },
};
async function handle(req, env, ctx) {
    const u = new URL(req.url), p = u.pathname;
    try {
      if (p === '/app') return new Response(APP_HTML, { headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-cache' } });
      await ensureSchema(env);
      if (eq(p, '/hook/' + env.WH_SECRET) && req.method === 'POST') {
        if ((await metaGet(env, 'whsec')) === '1' && !eq(req.headers.get('x-telegram-bot-api-secret-token'), await hookTok(env))) return new Response('no', { status: 403 });
        const up = await req.json(); ctx.waitUntil(onUpdate(env, u.origin, up).catch((e) => console.error('update failed', e && e.message))); return new Response('ok');
      }
      if (eq(p, '/setup/' + env.WH_SECRET)) return J(await setup(env, u.origin));
      if (p === '/r' && req.method === 'POST') return await report(env, req);
      if (p === '/u' && req.method === 'POST') return await usagePage(env, req);
      if (p.startsWith('/api/') && req.method === 'POST') return await api(req, env, p.slice(5), u.origin);
      if (p === '/') return new Response('Bzgz Proxy', { headers: { 'content-type': 'text/plain' } });
    } catch (e) { return J({ ok: false, error: e.message || 'internal' }, 500); }
    return new Response('Not found', { status: 404 });
}

/* ================= usage reports from proxies ================= */
async function report(env, req) {
  const b = await req.json().catch(() => ({}));
  const p = await one(env, 'SELECT id,secret FROM proxies WHERE id=?', String(b.p));
  if (!p || !eq(p.secret, b.k)) return new Response('no', { status: 403 });
  const r = Math.min(1e6, Math.max(0, Number(b.r) | 0)), by = Math.min(5e10, Math.max(0, Number(b.b) || 0));
  await env.DB.batch([
    bind(env, 'INSERT INTO usage(pid,day,req,bytes) VALUES(?,?,?,?) ON CONFLICT(pid,day) DO UPDATE SET req=req+excluded.req, bytes=bytes+excluded.bytes', [p.id, day(), r, by]),
    bind(env, 'UPDATE proxies SET seen=?, fail=0 WHERE id=?', [Date.now(), p.id]),
  ]);
  return new Response('ok');
}

// Data for the private usage page that every proxy serves at /_u/<its secret> (authenticated with that same secret)
async function usagePage(env, req) {
  const b = await req.json().catch(() => ({}));
  const p = await one(env, 'SELECT id,name,secret FROM proxies WHERE id=?', String(b.p));
  if (!p || !eq(p.secret, b.k)) return new Response('no', { status: 403 });
  const s = await usageOf(env, p.id), rows = await all(env, 'SELECT day d, bytes b FROM usage WHERE pid=? AND day>=?', p.id, ago(6)), days = [];
  for (let i = 6; i >= 0; i--) { const d = ago(i); days.push({ d, b: rows.find((x) => x.d === d)?.b || 0 }); }
  return J({ name: p.name, off: !!(await metaGet(env, 'off:' + p.id)), tr: s.tr, tb: s.tb, wb: s.wb, days });
}

/* ================= Telegram ================= */
const tg = (env, method, body) => fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({}));
const say = (env, chat, text, kb) => tg(env, 'sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });
const edit = (env, q, text, kb) => tg(env, 'editMessageText', { chat_id: q.message.chat.id, message_id: q.message.message_id, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });
async function setup(env, origin) {
  const C = (l, d) => tg(env, 'setMyCommands', { ...(l ? { language_code: l } : {}), commands: ['start', 'proxies', 'profile', 'support', 'help'].map((c, i) => ({ command: c, description: d[i] })) });
  return {
    webhook: await tg(env, 'setWebhook', { url: `${origin}/hook/${env.WH_SECRET}`, secret_token: await hookTok(env), allowed_updates: ['message', 'callback_query'] }).then(async (r) => { if (r.ok) await metaSet(env, 'whsec', '1'); return r; }),
    menu: await tg(env, 'setChatMenuButton', { menu_button: { type: 'web_app', text: '🪟 Panel', web_app: { url: `${origin}/app` } } }),
    cmds: [await C(null, ['Main menu', 'My proxies', 'Profile', 'Support', 'Help']), await C('ru', ['Меню', 'Мои прокси', 'Профиль', 'Поддержка', 'Помощь']), await C('fa', ['منوی اصلی', 'پروکسی‌های من', 'پروفایل', 'پشتیبانی', 'راهنما'])],
  };
}

/* ---------- i18n (bot) ---------- */
// One click: opens Cloudflare's "create token" page with the right permissions already ticked.
const TOKEN_URL = 'https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%5D&accountId=*&zoneId=all&name=Bzgz';
const TOKEN_URL_H = TOKEN_URL.replace(/&/g, '&amp;');
const chName = (x) => (String(x.id).startsWith('@') ? x.id : esc(x.title || 'channel'));
const LANGS = { en: 'English', ru: 'Русский', fa: 'فارسی' };
const detect = (from) => { const c = String(from?.language_code || '').slice(0, 2); return c === 'fa' || c === 'ru' ? c : 'en'; };
const fmtDate = (t) => new Date(t).toISOString().slice(0, 10);
const T = {
  en: {
    bFaq: '❓ FAQ', faqT: '❓ <b>Frequently asked questions</b>\n\nTap a question:',
    bKit: '🆘 Emergency kit', bTip: '💡 Stability tips',
    kitHead: (n) => `🆘 <b>Emergency kit</b> — ${n} proxy link(s)\n\nKeep this message. Forward it to Saved Messages so the links stay on your phone even if the network or the bot is down. Try the links in order.`,
    kitFoot: '⚠️ No guarantee. If the connection to the international internet is cut completely, no proxy can work. This only helps while the network is slow or half-open.',
    tipText: '💡 <b>Keep your proxies stable</b>\n\n1. Make 3 proxies in different places (Smart, Netherlands, UK).\n2. Add them all in Telegram now (Settings → Data and Storage → Proxy).\n3. Forward the Emergency kit to Saved Messages.\n4. Keep them updated and not paused.\n5. Use your own domain in Cloudflare instead of workers.dev if you can.\n6. Share by name + password instead of posting links publicly.\n7. If one stops working, tap “New link”.',
    bUse: '🤝 Use a friend’s proxy', bShare: '🤝 Share', bUsage: '📊 Usage page', bBack2: '🔙 Back',
    useAsk: '🤝 <b>Use a friend’s proxy</b>\n\nSend the share name your friend gave you (for example <code>saman</code>). If it has a password I will ask for it.\n\nNo Cloudflare account is needed.\n/cancel to stop.',
    shNone: '⚠️ No shared proxy with that name. Check the spelling and try again.', shPass: '🔐 This proxy is password-protected. Send the password.\n\n🔒 I delete your message right away.',
    shBad: (n) => `❌ Wrong password. ${n} attempt(s) left.`, shLocked: '⛔ Too many wrong tries. This share is locked for 15 minutes.',
    shOk: (n) => `✅ Shared proxy <b>${n}</b> is ready.\nTap the button to add it to Telegram.`, shOff: '⏸ The owner has paused this proxy for now — it will work again when it is resumed.',
    shAlert: (n) => `🚨 Someone entered a wrong password for your share <b>${n}</b> 5 times. It is locked for 15 minutes. Change the password if you did not share it with them.`,
    shNo: '🤝 <b>Sharing</b>\n\nSharing is off for this proxy.\nGive it a name (for example <code>saman</code>) and an optional password. Your friend writes that name in this bot and gets the proxy — no Cloudflare account needed.',
    shInfo: (a, pw, n) => `🤝 <b>Sharing is on</b>\n\nName: <code>${esc(a)}</code>\nPassword: ${pw ? '🔐 yes' : '⚠️ none (anyone who knows the name can use it)'}\nUsed: ${n} time(s)\n\nYour friend opens this bot, taps “Use a friend’s proxy” and writes the name. Removing the share or using “new link” stops it.`,
    shMake: '➕ Turn on sharing', shChange: '✏️ Change name / password', shRemove: '🗑️ Stop sharing',
    shAsk: '✍️ Send the share name and, optionally, a password — separated by a space.\nExample: <code>saman mypass1</code>\nName: 3–24 letters/digits (a-z, 0-9, _ or -). Password: at least 4 characters.\n\n🔒 I delete your message right away.',
    shErr: (c) => ({ alias: '⚠️ The name must be 3–24 characters: a-z, 0-9, _ or -.', pw: '⚠️ The password must be 4–64 characters.', taken: '⚠️ That name is already taken. Choose another one.', notfound: '⚠️ Proxy not found.' }[c] || '⚠️ Error.'),
    shDone: (a, pw) => `✅ Sharing is on: <code>${esc(a)}</code>${pw ? ' · 🔐 password set' : ' · ⚠️ no password'}`, shGone: '🗑️ Sharing stopped.',
    welcome: (n) => `Hi <b>${n}</b> 👋\nCreate personal Telegram proxies on your own Cloudflare account — as many as you need, for you and your family.\n\nPick an option below 👇`,
    bNew: '🚀 Create proxy', bPanel: '🪟 Open panel', bList: '📡 My proxies', bProfile: '👤 Profile', bSupport: '🆘 Support', bHelp: '❓ Help', bLang: '🌐 Language', bBack: '🔙 Menu', bAdd: '➕ Add to Telegram', bRm: '🗑️ Remove from list', bYes: '✅ Yes', bNo: '↩️ No', bCancel: '✖️ Cancel', bStats: '📊 Refresh',
    help: '❓ <b>Help</b>\n\n<b>1. Create</b> — tap “Create proxy”, send a name per person, then your Cloudflare token (Workers Scripts: Edit).\n<b>2. Privacy</b> — the token is used once and <b>never stored</b>; your message is deleted right away.\n<b>3. Connect</b> — open a link in a Telegram app that supports the WEB proxy type and tap Connect.\n<b>4. Monitoring</b> — proxies are checked regularly; you get a message if one goes down.\n\nNeed a hand? Tap “Support”.',
    profile: (u, n) => `👤 <b>Profile</b>\n\nName: ${esc(u.name)}\nID: <code>${u.id}</code>\nJoined: ${fmtDate(u.joined)}\nProxies: ${n}`,
    noProx: '📡 You have no proxies yet.\nTap “Create proxy” 🚀', proxHdr: (n) => `📡 <b>Your proxies</b> (${n})`,
    stOk: '🟢 Online', stDown: '🔴 Down', today: 'Today', week: '7 days', req: 'requests',
    rmAsk: (n) => `🗑️ Remove <b>${esc(n)}</b> from your list?\n\nThe worker stays in your Cloudflare account. To delete it completely use the panel (a one-time token is needed).`, rmDone: '🗑️ Removed.',
    joinTxt: (c) => `❌ <b>Dear user</b>, to use the bot please join the channel(s) below first:\n\n${c.map((x) => '🔗 ' + chName(x)).join('\n')}\n\nThen tap “I joined”.`, joinBtn: '✅ I joined (check again)', joinGo: (c) => '📢 Join ' + (c.title || c.id), notYet: 'You have not joined yet — join first, then try again.',
    supAsk: '🆘 Write your message and send it — our team will reply here.', supOk: (id) => `✅ Message received (#${id}). We will reply soon.`, repHdr: (id) => `💬 <b>Support reply</b> (#${id})`, repBtn: '🆘 Continue chat',
    langPick: '🌐 Choose your language:', nUp: (n) => `🟢 Proxy <b>${esc(n)}</b> is back online.`, nDown: (n) => `🔴 Proxy <b>${esc(n)}</b> is not responding. Check your Cloudflare worker.`,
    newAsk: '🚀 <b>Create proxies</b>\n\nSend a name for each person, one per line (up to 10).\nFor a single proxy just send one name.\n\n/cancel to stop.',
    credAsk: `🔐 <b>Cloudflare token</b>\n\nTap the link below, press <b>Continue → Create Token</b>, copy the token and send it here. You may add your Account ID on a second line.\n\n🔒 I delete your message immediately and never store the token.\n\n🔗 <a href="${TOKEN_URL_H}">Create the token (permissions are pre-selected)</a>\n\n/cancel to stop.`,
    building: (n) => `⏳ Creating ${n} proxy(ies)…`, made: (n) => `🎉 <b>${n} proxy(ies) ready!</b>\nTap a name to add it to Telegram.\n🔒 Your token was discarded.`,
    badCred: '⚠️ I could not read a token in that message. Send it again or /cancel.', noAcct: '⚠️ I could not find your Account ID automatically. Send the token and the 32-character Account ID on two lines.',
    cfErr: (m) => `⚠️ Cloudflare error: ${esc(m)}\nCheck the token permissions and send it again, or /cancel.`, cancelled: '✖️ Cancelled.', wait: '⏳ Please wait a few seconds.',
    joinedOk: '✅ You have joined — thank you! Everything is unlocked.', joinBroken: '⚠️ The membership check is temporarily unavailable (the owner has been notified). Please try again in a little while.', stOff: '⏸ Paused', limitErr: '⚠️ Limit reached: at most 30 proxies per user.',
  },
  ru: {
    bFaq: '❓ Вопросы', faqT: '❓ <b>Частые вопросы</b>\n\nВыберите вопрос:',
    bKit: '🆘 Аварийный набор', bTip: '💡 Советы',
    kitHead: (n) => `🆘 <b>Аварийный набор</b> — ссылок: ${n}\n\nСохраните это сообщение, перешлите в «Избранное», чтобы ссылки были на телефоне даже без сети и бота. Пробуйте по порядку.`,
    kitFoot: '⚠️ Без гарантий. Если выход в мировой интернет полностью отрезан, ни один прокси не работает. Это помогает только при медленной или частично открытой сети.',
    tipText: '💡 <b>Как держать прокси стабильными</b>\n\n1. Сделайте 3 прокси в разных местах.\n2. Добавьте их все в Telegram заранее.\n3. Перешлите аварийный набор в «Избранное».\n4. Обновляйте и не ставьте на паузу.\n5. Свой домен в Cloudflare вместо workers.dev.\n6. Делитесь по имени и паролю, не публикуйте ссылки.\n7. Если не работает — «Новая ссылка».',
    bUse: '🤝 Прокси друга', bShare: '🤝 Поделиться', bUsage: '📊 Страница трафика', bBack2: '🔙 Назад',
    useAsk: '🤝 <b>Прокси друга</b>\n\nОтправьте имя, которое дал друг (например <code>saman</code>). Если есть пароль, я его спрошу.\n\nАккаунт Cloudflare не нужен.\n/cancel — отмена.',
    shNone: '⚠️ Такого общего прокси нет. Проверьте имя.', shPass: '🔐 Прокси защищён паролем. Отправьте пароль.\n\n🔒 Я сразу удаляю ваше сообщение.',
    shBad: (n) => `❌ Неверный пароль. Осталось попыток: ${n}.`, shLocked: '⛔ Слишком много ошибок. Доступ закрыт на 15 минут.',
    shOk: (n) => `✅ Общий прокси <b>${n}</b> готов.\nНажмите кнопку, чтобы добавить в Telegram.`, shOff: '⏸ Владелец временно приостановил этот прокси.',
    shAlert: (n) => `🚨 Кто-то 5 раз ввёл неверный пароль для <b>${n}</b>. Доступ закрыт на 15 минут.`,
    shNo: '🤝 <b>Общий доступ</b>\n\nДля этого прокси он выключен.\nЗадайте имя (например <code>saman</code>) и необязательный пароль. Друг пишет это имя в боте и получает прокси — аккаунт Cloudflare не нужен.',
    shInfo: (a, pw, n) => `🤝 <b>Общий доступ включён</b>\n\nИмя: <code>${esc(a)}</code>\nПароль: ${pw ? '🔐 есть' : '⚠️ нет (доступ у всех, кто знает имя)'}\nИспользовано: ${n}\n\n«Новая ссылка» или удаление доступа закрывает его.`,
    shMake: '➕ Включить доступ', shChange: '✏️ Изменить имя / пароль', shRemove: '🗑️ Закрыть доступ',
    shAsk: '✍️ Отправьте имя и, при желании, пароль через пробел.\nПример: <code>saman mypass1</code>\nИмя: 3–24 символа (a-z, 0-9, _ или -). Пароль: от 4 символов.\n\n🔒 Я сразу удаляю ваше сообщение.',
    shErr: (c) => ({ alias: '⚠️ Имя: 3–24 символа a-z, 0-9, _ или -.', pw: '⚠️ Пароль: 4–64 символа.', taken: '⚠️ Имя занято.', notfound: '⚠️ Прокси не найден.' }[c] || '⚠️ Ошибка.'),
    shDone: (a, pw) => `✅ Доступ включён: <code>${esc(a)}</code>${pw ? ' · 🔐 пароль задан' : ' · ⚠️ без пароля'}`, shGone: '🗑️ Доступ закрыт.',
    welcome: (n) => `Привет, <b>${n}</b> 👋\nСоздавайте личные прокси для Telegram в своём аккаунте Cloudflare — сколько нужно, для себя и семьи.\n\nВыберите действие ниже 👇`,
    bNew: '🚀 Создать прокси', bPanel: '🪟 Открыть панель', bList: '📡 Мои прокси', bProfile: '👤 Профиль', bSupport: '🆘 Поддержка', bHelp: '❓ Помощь', bLang: '🌐 Язык', bBack: '🔙 Меню', bAdd: '➕ Добавить в Telegram', bRm: '🗑️ Убрать из списка', bYes: '✅ Да', bNo: '↩️ Нет', bCancel: '✖️ Отмена', bStats: '📊 Обновить',
    help: '❓ <b>Помощь</b>\n\n<b>1. Создание</b> — нажмите «Создать прокси», отправьте имя для каждого человека, затем токен Cloudflare (Workers Scripts: Edit).\n<b>2. Приватность</b> — токен используется один раз и <b>нигде не хранится</b>; ваше сообщение сразу удаляется.\n<b>3. Подключение</b> — откройте ссылку в приложении Telegram с поддержкой прокси типа WEB и нажмите Connect.\n<b>4. Мониторинг</b> — прокси проверяются регулярно; если один упадёт, придёт сообщение.\n\nНужна помощь? Нажмите «Поддержка».',
    profile: (u, n) => `👤 <b>Профиль</b>\n\nИмя: ${esc(u.name)}\nID: <code>${u.id}</code>\nС нами с: ${fmtDate(u.joined)}\nПрокси: ${n}`,
    noProx: '📡 Прокси пока нет.\nНажмите «Создать прокси» 🚀', proxHdr: (n) => `📡 <b>Ваши прокси</b> (${n})`,
    stOk: '🟢 Работает', stDown: '🔴 Недоступен', today: 'Сегодня', week: '7 дней', req: 'запросов',
    rmAsk: (n) => `🗑️ Убрать <b>${esc(n)}</b> из списка?\n\nВоркер останется в вашем аккаунте Cloudflare. Для полного удаления используйте панель (нужен одноразовый токен).`, rmDone: '🗑️ Удалено.',
    joinTxt: (c) => `❌ <b>Уважаемый пользователь</b>, чтобы пользоваться ботом, сначала подпишитесь на канал(ы):\n\n${c.map((x) => '🔗 ' + chName(x)).join('\n')}\n\nЗатем нажмите «Я подписался».`, joinBtn: '✅ Я подписался (проверить)', joinGo: (c) => '📢 Подписаться: ' + (c.title || c.id), notYet: 'Вы ещё не подписались — подпишитесь и попробуйте снова.',
    supAsk: '🆘 Напишите сообщение — команда поддержки ответит здесь.', supOk: (id) => `✅ Сообщение получено (#${id}). Скоро ответим.`, repHdr: (id) => `💬 <b>Ответ поддержки</b> (#${id})`, repBtn: '🆘 Продолжить чат',
    langPick: '🌐 Выберите язык:', nUp: (n) => `🟢 Прокси <b>${esc(n)}</b> снова работает.`, nDown: (n) => `🔴 Прокси <b>${esc(n)}</b> не отвечает. Проверьте воркер в Cloudflare.`,
    newAsk: '🚀 <b>Создание прокси</b>\n\nОтправьте имя для каждого человека, по одному в строке (до 10).\nДля одного прокси отправьте одно имя.\n\n/cancel — отмена.',
    credAsk: `🔐 <b>Токен Cloudflare</b>\n\nНажмите ссылку ниже, затем <b>Continue → Create Token</b>, скопируйте токен и отправьте сюда. Account ID можно добавить второй строкой.\n\n🔒 Я сразу удаляю ваше сообщение и не храню токен.\n\n🔗 <a href="${TOKEN_URL_H}">Создать токен (права уже выбраны)</a>\n\n/cancel — отмена.`,
    building: (n) => `⏳ Создаю прокси: ${n}…`, made: (n) => `🎉 <b>Готово: ${n}!</b>\nНажмите на имя, чтобы добавить в Telegram.\n🔒 Токен удалён.`,
    badCred: '⚠️ Не нашёл токен в сообщении. Отправьте снова или /cancel.', noAcct: '⚠️ Не удалось определить Account ID. Отправьте токен и 32-символьный Account ID двумя строками.',
    cfErr: (m) => `⚠️ Ошибка Cloudflare: ${esc(m)}\nПроверьте права токена и отправьте снова или /cancel.`, cancelled: '✖️ Отменено.', wait: '⏳ Подождите несколько секунд.',
    joinedOk: '✅ Вы подписались — спасибо! Всё разблокировано.', joinBroken: '⚠️ Проверка подписки временно недоступна (владелец уже уведомлён). Попробуйте чуть позже.', stOff: '⏸ Приостановлен', limitErr: '⚠️ Лимит: не более 30 прокси на пользователя.',
  },
  fa: {
    bFaq: '❓ سوالات متداول', faqT: '❓ <b>سوالات متداول</b>\n\nیکی از سوال‌ها رو بزن:',
    bKit: '🆘 کیت اضطراری', bTip: '💡 نکات پایداری',
    kitHead: (n) => `🆘 <b>کیت اضطراری</b> — ${n} لینک پروکسی\n\nاین پیام رو نگه دار و به Saved Messages فوروارد کن تا حتی وقتی شبکه یا ربات قطع شد لینک‌ها روی گوشیت باشن. لینک‌ها رو به ترتیب امتحان کن.`,
    kitFoot: '⚠️ تضمینی نیست. اگه ارتباط با اینترنت جهانی کامل قطع بشه هیچ پروکسی‌ای کار نمی‌کنه. این فقط وقتی کمک می‌کنه که شبکه کند یا نیمه‌بازه.',
    tipText: '💡 <b>پایدار نگه داشتن پروکسی‌ها</b>\n\n۱. سه پروکسی توی جاهای مختلف بساز (هوشمند، هلند، انگلیس).\n۲. همه‌شون رو از الان توی تلگرام اضافه کن (تنظیمات ← داده و ذخیره‌سازی ← پروکسی).\n۳. کیت اضطراری رو به Saved Messages فوروارد کن.\n۴. آپدیت و روشن نگهشون دار.\n۵. اگه میشه دامنه‌ی شخصی خودت رو توی کلودفلر بذار.\n۶. با اسم و رمز اشتراک بذار، لینک رو عمومی پخش نکن.\n۷. اگه یکی کار نکرد «لینک جدید» بزن.\n',
    bUse: '🤝 پروکسی دوستم', bShare: '🤝 اشتراک‌گذاری', bUsage: '📊 صفحه‌ی حجم', bBack2: '🔙 برگشت',
    useAsk: '🤝 <b>استفاده از پروکسی دوستت</b>\n\nاسمی که دوستت بهت داده رو بفرست (مثلاً <code>saman</code>). اگه رمز داشته باشه ازت می‌پرسم.\n\nلازم نیست اکانت کلودفلر داشته باشی.\n/cancel برای لغو.',
    shNone: '⚠️ پروکسی اشتراکی با این اسم پیدا نشد. املاش رو چک کن.', shPass: '🔐 این پروکسی رمز داره. رمز رو بفرست.\n\n🔒 پیامت رو فوراً پاک می‌کنم.',
    shBad: (n) => `❌ رمز اشتباهه. ${n} بار دیگه فرصت داری.`, shLocked: '⛔ تعداد تلاش اشتباه زیاد شد. این اشتراک ۱۵ دقیقه قفله.',
    shOk: (n) => `✅ پروکسی اشتراکی <b>${n}</b> آماده‌ست.\nدکمه‌ی زیر رو بزن تا به تلگرام اضافه بشه.`, shOff: '⏸ صاحب پروکسی فعلاً اون رو متوقف کرده؛ وقتی دوباره روشن بشه کار می‌کنه.',
    shAlert: (n) => `🚨 یه نفر ۵ بار رمز اشتباه برای اشتراک <b>${n}</b> زده. ۱۵ دقیقه قفل شد. اگه اون رو به این شخص ندادی رمز رو عوض کن.`,
    shNo: '🤝 <b>اشتراک‌گذاری</b>\n\nبرای این پروکسی خاموشه.\nیه اسم بهش بده (مثلاً <code>saman</code>) و اگه خواستی رمز بذار. دوستت همون اسم رو توی این ربات می‌نویسه و پروکسی رو می‌گیره — بدون نیاز به اکانت کلودفلر.',
    shInfo: (a, pw, n) => `🤝 <b>اشتراک‌گذاری روشنه</b>\n\nاسم: <code>${esc(a)}</code>\nرمز: ${pw ? '🔐 دارد' : '⚠️ ندارد (هرکس اسم رو بدونه می‌تونه استفاده کنه)'}\nتعداد استفاده: ${n}\n\nدوستت ربات رو باز می‌کنه، «پروکسی دوستم» رو می‌زنه و اسم رو می‌نویسه. با «لینک جدید» یا حذف اشتراک، دسترسی قطع میشه.`,
    shMake: '➕ روشن کردن اشتراک', shChange: '✏️ تغییر اسم / رمز', shRemove: '🗑️ قطع اشتراک',
    shAsk: '✍️ اسم اشتراک و (اختیاری) رمز رو با یک فاصله بفرست.\nمثال: <code>saman mypass1</code>\nاسم: ۳ تا ۲۴ حرف انگلیسی/عدد (a-z, 0-9, _ یا -). رمز: حداقل ۴ کاراکتر.\n\n🔒 پیامت رو فوراً پاک می‌کنم.',
    shErr: (c) => ({ alias: '⚠️ اسم باید ۳ تا ۲۴ کاراکتر از a-z, 0-9, _ یا - باشه.', pw: '⚠️ رمز باید ۴ تا ۶۴ کاراکتر باشه.', taken: '⚠️ این اسم قبلاً گرفته شده، یکی دیگه انتخاب کن.', notfound: '⚠️ پروکسی پیدا نشد.' }[c] || '⚠️ خطا.'),
    shDone: (a, pw) => `✅ اشتراک روشن شد: <code>${esc(a)}</code>${pw ? ' · 🔐 رمز دارد' : ' · ⚠️ بدون رمز'}`, shGone: '🗑️ اشتراک قطع شد.',
    welcome: (n) => `سلام <b>${n}</b> 👋\nروی اکانت کلودفلر خودت هر تعداد پروکسی شخصی تلگرام بساز — برای خودت و خانواده.\n\nاز گزینه‌های زیر شروع کن 👇`,
    bNew: '🚀 ساخت پروکسی', bPanel: '🪟 ورود به پنل', bList: '📡 پروکسی‌های من', bProfile: '👤 پروفایل', bSupport: '🆘 پشتیبانی', bHelp: '❓ راهنما', bLang: '🌐 زبان', bBack: '🔙 منو', bAdd: '➕ افزودن به تلگرام', bRm: '🗑️ حذف از لیست', bYes: '✅ بله', bNo: '↩️ نه', bCancel: '✖️ لغو', bStats: '📊 به‌روزرسانی',
    help: '❓ <b>راهنما</b>\n\n<b>۱) ساخت</b> — «ساخت پروکسی» رو بزن، برای هر نفر یه اسم بفرست و بعد توکن کلودفلر (Workers Scripts: Edit) رو بده.\n<b>۲) حریم خصوصی</b> — توکن فقط یک بار استفاده میشه و <b>هیچ‌جا ذخیره نمیشه</b>؛ پیامت هم سریع پاک میشه.\n<b>۳) اتصال</b> — لینک رو توی تلگرامِ دارای پروکسی نوع WEB باز کن و Connect بزن.\n<b>۴) پایش</b> — سلامت پروکسی‌ها مرتب چک میشه و اگه یکی قطع شد خبرت می‌کنم.\n\nکمک می‌خوای؟ «پشتیبانی» رو بزن.',
    profile: (u, n) => `👤 <b>پروفایل</b>\n\nنام: ${esc(u.name)}\nشناسه: <code>${u.id}</code>\nعضویت: ${fmtDate(u.joined)}\nپروکسی: ${n}`,
    noProx: '📡 هنوز پروکسی نداری.\n«ساخت پروکسی» رو بزن 🚀', proxHdr: (n) => `📡 <b>پروکسی‌های تو</b> (${n})`,
    stOk: '🟢 فعال', stDown: '🔴 قطع', today: 'امروز', week: '۷ روز', req: 'درخواست',
    rmAsk: (n) => `🗑️ <b>${esc(n)}</b> از لیست حذف بشه؟\n\nورکر توی اکانت کلودفلرت می‌مونه. برای حذف کامل از پنل استفاده کن (توکن موقت لازمه).`, rmDone: '🗑️ حذف شد.',
    joinTxt: (c) => `❌ <b>کاربر گرامی</b>، برای استفاده از ربات ابتدا در کانال(های) زیر عضو شوید:\n\n${c.map((x) => '🔗 ' + chName(x)).join('\n')}\n\nسپس روی دکمه «عضو شدم» کلیک کنید.`, joinBtn: '✅ عضو شدم (بررسی مجدد)', joinGo: (c) => '📢 عضویت در ' + (c.title || c.id), notYet: 'هنوز عضو نشدی — اول عضو شو و دوباره امتحان کن.',
    supAsk: '🆘 پیامت رو بنویس و بفرست؛ تیم پشتیبانی همین‌جا جواب میده.', supOk: (id) => `✅ پیامت ثبت شد (#${id}). به‌زودی جواب میدیم.`, repHdr: (id) => `💬 <b>پاسخ پشتیبانی</b> (#${id})`, repBtn: '🆘 ادامه‌ی گفتگو',
    langPick: '🌐 زبان رو انتخاب کن:', nUp: (n) => `🟢 پروکسی <b>${esc(n)}</b> دوباره فعال شد.`, nDown: (n) => `🔴 پروکسی <b>${esc(n)}</b> پاسخ نمیده. ورکر کلودفلرت رو بررسی کن.`,
    newAsk: '🚀 <b>ساخت پروکسی</b>\n\nبرای هر نفر یه اسم بفرست، هر اسم توی یک خط (حداکثر ۱۰ تا).\nبرای یک پروکسی فقط یه اسم بفرست.\n\n/cancel برای لغو.',
    credAsk: `🔐 <b>توکن کلودفلر</b>\n\nروی لینک زیر بزن، <b>Continue → Create Token</b> رو بزن، توکن رو کپی کن و همین‌جا بفرست. می‌تونی Account ID رو توی خط دوم هم بذاری.\n\n🔒 پیامت رو فوراً پاک می‌کنم و توکن ذخیره نمیشه.\n\n🔗 <a href="${TOKEN_URL_H}">ساخت توکن (دسترسی‌ها از قبل انتخاب شده)</a>\n\n/cancel برای لغو.`,
    building: (n) => `⏳ در حال ساخت ${n} پروکسی…`, made: (n) => `🎉 <b>${n} پروکسی آماده شد!</b>\nروی اسم هر کدوم بزن تا به تلگرام اضافه بشه.\n🔒 توکنت دور ریخته شد.`,
    badCred: '⚠️ توکنی توی این پیام پیدا نکردم. دوباره بفرست یا /cancel.', noAcct: '⚠️ نتونستم Account ID رو خودکار پیدا کنم. توکن و Account ID (۳۲ کاراکتر) رو توی دو خط بفرست.',
    cfErr: (m) => `⚠️ خطا از کلودفلر: ${esc(m)}\nدسترسی‌های توکن رو چک کن و دوباره بفرست، یا /cancel.`, cancelled: '✖️ لغو شد.', wait: '⏳ چند ثانیه صبر کن.',
    joinedOk: '✅ شما جوین شدید — ممنون! همه‌چیز باز شد.', joinBroken: '⚠️ بررسی عضویت موقتاً در دسترس نیست (به مالک خبر داده شد). کمی بعد دوباره امتحان کن.', stOff: '⏸ متوقف', limitErr: '⚠️ سقف پر شد: حداکثر ۳۰ پروکسی برای هر کاربر.',
  },
};
const tr = (L, k, ...a) => { const v = (T[L] && T[L][k]) ?? T.en[k]; return typeof v === 'function' ? v(...a) : v; };

/* ---------- helpers shared by bot and mini app ---------- */
const fixTok = (t) => String(t || '').trim().replace(/^Cfut_/, 'cfut_'); // phone keyboards capitalise the first letter
const cleanNames = (a) => a.map((s) => String(s).replace(/[|<>]/g, '').trim().slice(0, 24)).filter(Boolean).slice(0, 10);
async function guard(env, uid) {
  const k = 'rl' + uid;
  if (Number(await metaGet(env, k)) > Date.now()) return true;
  await metaSet(env, k, String(Date.now() + 4000));
  return false;
}
async function resolveAccount(token, acc) {
  if (/^[a-f0-9]{32}$/i.test(acc || '')) return acc.toLowerCase();
  const list = await cf(token, 'GET', '/accounts').catch(() => []);
  if (Array.isArray(list) && list.length === 1) return list[0].id;
  throw new Error('noacct');
}
async function createProxies(env, origin, u, names, acc, token, loc) {
  acc = await resolveAccount(token, acc);
  let sub;
  try { sub = (await cf(token, 'GET', `/accounts/${acc}/workers/subdomain`)).subdomain; } catch (e) { if (e.code !== 10007) throw e; }
  if (!sub) sub = (await cf(token, 'PUT', `/accounts/${acc}/workers/subdomain`, { subdomain: 'bz-' + rid(8) })).subdomain;
  const made = [];
  if (((await one(env, 'SELECT COUNT(*) n FROM proxies WHERE uid=?', u.id)).n || 0) + names.length > 30) throw new Error('limit');
  try {
    for (const name of names) {
      const id = 'tgp-' + rid(6), psec = hx(16), secret = rid(24), host = `${id}.${sub}.workers.dev`, link = `https://t.me/webproxy?server=${host}&secret=${psec}`;
      const d = await deploy(token, acc, id, { MTSECRET: psec, PID: id, SECRET: secret, REPORT: origin + '/r' }, { loc });
      await run(env, 'INSERT INTO proxies(id,uid,name,url,enter,secret,created) VALUES(?,?,?,?,?,?,?)', id, u.id, name, `https://${host}`, link, secret, Date.now());
      await metaSet(env, 'ver:' + id, BUNDLE);
      if (d.placed) await metaSet(env, 'pl:' + id, loc);
      made.push({ id, name, enter: link, loc: d.placed ? loc : 'auto' });
    }
  } catch (e) { if (made.length) e.made = made; throw e; } // keep the ones that already worked
  return made;
}

/* ---------- forced join (bot + mini app) ---------- */
async function warnOwner(env, text, key) {
  const k = 'jw' + key;
  if (Number(await metaGet(env, k)) > Date.now()) return;
  await metaSet(env, k, String(Date.now() + 3600e3));
  await say(env, OWNER(env), text);
}
async function botIsAdmin(env, chat) {
  const me = (await tg(env, 'getMe', {})).result;
  if (!me) return false;
  const m = await tg(env, 'getChatMember', { chat_id: chat, user_id: me.id });
  return !!(m.ok && ['administrator', 'creator'].includes(m.result.status));
}
// Public channels use t.me/<name>; private ones (numeric id) use an invite link stored in meta `cl<id>`.
const chUrl = async (env, c) => (String(c.id).startsWith('@') ? 'https://t.me/' + c.id.slice(1) : (await metaGet(env, 'cl' + c.id)) || '');
const chans = async (env) => { const rows = await all(env, 'SELECT id,title FROM channels'); for (const c of rows) c.url = await chUrl(env, c); return rows; };
const chOut = (c) => ({ id: c.id, title: c.title, url: c.url || '', broken: !!c.broken });
const lockOn = async (env) => (await metaGet(env, 'fjoff')) !== '1';
async function joinActive(env) { return (await lockOn(env)) && !!(await one(env, 'SELECT id FROM channels LIMIT 1')); }
async function addChannel(env, raw, link) {
  let id = String(raw || '').trim().replace(/^https?:\/\/t\.me\//i, '@').replace(/\/$/, '');
  if (!/^@\w{4,}$/.test(id) && !/^-100\d{5,}$/.test(id)) return 'badch';
  const c = await tg(env, 'getChat', { chat_id: id });
  if (!c.ok || !(await botIsAdmin(env, id))) return 'nochannel';
  if (id.startsWith('-')) {
    link = String(link || '').trim();
    if (!/^https:\/\/t\.me\/(\+|joinchat\/)[\w-]+$/.test(link)) { const x = await tg(env, 'exportChatInviteLink', { chat_id: id }); link = x.ok ? x.result : ''; }
    if (!link) return 'nolink';
    await metaSet(env, 'cl' + id, link);
  }
  await run(env, 'INSERT OR REPLACE INTO channels(id,title) VALUES(?,?)', id, c.result.title || id);
  await run(env, 'UPDATE users SET jchk=0');
  return null;
}
async function missing(env, u, force) {
  if (!force && (await role(env, u.id)) !== 'user') return []; // owner and admins are exempt (use /testjoin to preview)
  if (!force && !(await lockOn(env))) return []; // forced join switched off with /lock off
  const chs = await chans(env);
  if (!chs.length) return [];
  if (!force && u.jchk > Date.now()) return Object.assign([], { verified: true }); // checked within the last minute
  const out = []; let seen = 0; // `seen` counts channels Telegram really answered for; `verified` is true only when all did
  for (const c of chs) {
    const r = await tg(env, 'getChatMember', { chat_id: c.id, user_id: u.id });
    if (!r.ok) {
      await warnOwner(env, `⚠️ Forced join cannot check ${c.id}: ${r.description || 'error'}\nMake the bot an admin of that channel (/joininfo shows details).`, c.id);
      // A set-up problem (bot not admin / removed / channel gone) must NOT silently let everybody in: block until it is fixed.
      // A temporary Telegram problem (rate limit, 5xx, network) fails open for that one request.
      if ([400, 403].includes(r.error_code) && /inaccessible|not found|not enough rights|not a member|kicked|administrator|forbidden/i.test(r.description || '')) out.push({ ...c, broken: true });
      continue;
    }
    seen++;
    const st = r.result.status;
    if (!['member', 'administrator', 'creator'].includes(st) && !(st === 'restricted' && r.result.is_member)) out.push(c);
  }
  out.verified = seen === chs.length;
  if (!out.length && out.verified && !force) await run(env, 'UPDATE users SET jchk=? WHERE id=?', Date.now() + 60000, u.id);
  return out;
}
// Sends the "please join" message (with the channel buttons) to the user's chat with the bot. At most once per 30 s so reopening the panel cannot spam.
async function joinPing(env, origin, u, miss, force) {
  const k = 'jm' + u.id;
  if (!force && Number(await metaGet(env, k)) > Date.now()) return;
  await metaSet(env, k, String(Date.now() + 30e3));
  const L = LANGS[u.lang] ? u.lang : 'en';
  await say(env, u.id, joinMsg(L, miss), joinKb(L, miss));
}
const joinMsg = (L, chs) => tr(L, 'joinTxt', chs) + (chs.some((c) => c.broken) ? '\n\n' + tr(L, 'joinBroken') : '');
const joinKb = (L, chs) => ({ inline_keyboard: [...chs.filter((c) => c.url).map((c) => [{ text: tr(L, 'joinGo', c), url: c.url }]), [{ text: tr(L, 'joinBtn'), callback_data: 'chk' }]] });

/* ---------- screens ---------- */
const FAQ = { fa: [["این ربات چیه؟","یه ربات تلگرام که برات یه پروکسی تلگرام روی حساب کلودفلر خودت می‌سازه. رایگان و متن‌باز."],["توکن کلودفلر امنه؟","توکن فقط برای ساخت پروکسی استفاده میشه و ذخیره نمیشه. بهتره بعد از ساخت پاکش کنی."],["چطور وصل بشم؟","بعد از ساخت، دکمه «افزودن به تلگرام» رو بزن و تایید کن. یا لینک پروکسی رو توی چت بزن."],["پروکسی قطع‌وصل میشه، چیکار کنم؟","اول آپدیت رو بزن (مینی‌اپ ← مصرف). بعد لوکیشن «هوشمند» یا هلند/آلمان رو امتحان کن. اگه حجم درخواست امروز نزدیک ۱۰۰ هزاره، سقف رایگان کلودفلر داره پر میشه؛ یه پروکسی دیگه بساز."],["کدوم لوکیشن بهتره؟","اول «هوشمند»، بعد هلند یا آلمان. با دانلود یه فایل توی تلگرام سرعت رو مقایسه کن؛ تست پینگ فقط فاصله تا کلودفلر رو نشون میده."],["چطور آپدیت کنم؟","مینی‌اپ ← مصرف ← دکمه «آپدیت». هیچ‌چیز خودکار آپدیت نمیشه و لینک و تنظیماتت همون می‌مونه."],["چطور به دوستم بدم؟","روی پروکسی «اشتراک‌گذاری» رو بزن، اسم و رمز بذار. دوستت توی ربات «پروکسی دوستم» رو می‌زنه و اسم رو می‌نویسه."],["اگه اینترنت قطع شد؟","«کیت اضطراری» رو از قبل به Saved Messages فوروارد کن و چند پروکسی توی جاهای مختلف داشته باش. در قطع کامل اینترنت بین‌الملل هیچ پروکسی‌ای کار نمی‌کنه."]], en: [["What is this bot?","A Telegram bot that builds a Telegram proxy on your own Cloudflare account. Free and open source."],["Is my Cloudflare token safe?","The token is only used to create the proxy and is never stored. Delete it afterwards."],["How do I connect?","After creating, tap “Add to Telegram” and confirm, or paste the proxy link in any chat."],["My proxy keeps dropping, what now?","Update it first (Mini App → Usage). Then try the Smart location or Netherlands/Germany. If today's requests are close to 100k, the free Cloudflare limit is running out — make another proxy."],["Which location is best?","Smart first, then Netherlands or Germany. Compare real speed by downloading a file in Telegram; the ping test only shows the distance to Cloudflare."],["How do I update?","Mini App → Usage → Update. Nothing updates automatically and your link and settings stay the same."],["How do I give it to a friend?","Tap “Share” on the proxy, set a name and a password. Your friend taps “Use a friend's proxy” in the bot and writes the name."],["What if the internet is cut?","Forward the Emergency kit to Saved Messages and keep a few proxies in different places. If the connection to the international internet is cut completely, no proxy works."]] };
const faqOf = (L) => FAQ[L] || FAQ.en;
const faqKb = (L) => back(L, faqOf(L).map(([q], i) => [{ text: q, callback_data: 'fq:' + i }]));
const home = (L, o) => ({ inline_keyboard: [
  [{ text: tr(L, 'bNew'), callback_data: 'new' }, { text: tr(L, 'bUse'), callback_data: 'use' }],
  [{ text: tr(L, 'bList'), callback_data: 'list' }, { text: tr(L, 'bPanel'), web_app: { url: `${o}/app` } }],
  [{ text: tr(L, 'bProfile'), callback_data: 'profile' }, { text: tr(L, 'bSupport'), callback_data: 'sup' }],
  [{ text: tr(L, 'bFaq'), callback_data: 'faq' }, { text: tr(L, 'bKit'), callback_data: 'kit' }],
  [{ text: tr(L, 'bTip'), callback_data: 'tip' }],
  [{ text: tr(L, 'bLang'), callback_data: 'lang' }, { text: tr(L, 'bHelp'), callback_data: 'help' }],
] });
const back = (L, extra = []) => ({ inline_keyboard: [...extra, [{ text: tr(L, 'bBack'), callback_data: 'home' }]] });
const cancelKb = (L) => ({ inline_keyboard: [[{ text: tr(L, 'bCancel'), callback_data: 'cx' }]] });
const usageOf = (env, pid) => one(env, 'SELECT COALESCE(SUM(CASE WHEN day=? THEN req END),0) tr, COALESCE(SUM(CASE WHEN day=? THEN bytes END),0) tb, COALESCE(SUM(bytes),0) wb FROM usage WHERE pid=? AND day>=?', day(), day(), pid, ago(6));
async function proxyText(env, L, p) {
  const s = await usageOf(env, p.id), off = !!(await metaGet(env, 'off:' + p.id));
  return `📡 <b>${esc(p.name)}</b>\n\n🔗 <code>${esc(p.enter)}</code>\n${off ? tr(L, 'stOff') : p.fail >= 2 ? tr(L, 'stDown') : tr(L, 'stOk')}\n\n📊 ${tr(L, 'today')}: ${s.tr.toLocaleString('en')} ${tr(L, 'req')} · ${fmtB(s.tb)}\n📅 ${tr(L, 'week')}: ${fmtB(s.wb)}`;
}
const proxyKb = (L, p, fresh) => back(L, [[{ text: tr(L, 'bAdd'), url: p.enter }], [{ text: tr(L, 'bShare'), callback_data: 'sh:' + p.id }, ...(fresh ? [{ text: tr(L, 'bUsage'), url: `${p.url}/_u/${p.secret}?l=${L === 'fa' ? 'fa' : 'en'}` }] : [])], [{ text: tr(L, 'bStats'), callback_data: 'px:' + p.id }, { text: tr(L, 'bRm'), callback_data: 'dl:' + p.id }]]);

/* ---------- user ---------- */
async function getUser(env, from) {
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || 'User';
  let u = await one(env, 'SELECT * FROM users WHERE id=?', from.id);
  if (!u) {
    await run(env, 'INSERT INTO users(id,name,joined,last,lang) VALUES(?,?,?,?,?)', from.id, name, Date.now(), Date.now(), detect(from));
    u = await one(env, 'SELECT * FROM users WHERE id=?', from.id);
  } else if (u.name !== name || !u.lang || Date.now() - u.last > 36e5) {
    u.lang = u.lang || detect(from);
    await run(env, 'UPDATE users SET name=?, last=?, lang=? WHERE id=?', name, Date.now(), u.lang, from.id); u.name = name;
  }
  return u;
}
const offSet = async (env) => new Set((await all(env, "SELECT k FROM meta WHERE k LIKE 'off:%'")).map((r) => r.k.slice(4)));
const myProxies = (env, uid) => all(env, 'SELECT id,name,url,enter,secret,created,fail,seen FROM proxies WHERE uid=? ORDER BY created', uid);

// Emergency kit: every link of the user in ONE message, so it sits in the chat (and in Saved Messages if forwarded) when the network gets bad.
async function kitText(env, L, uid) {
  const ps = await myProxies(env, uid), off = await offSet(env);
  if (!ps.length) return null;
  return tr(L, 'kitHead', ps.length) + '\n\n' + ps.map((p, i) => `<b>${i + 1}.</b> ${esc(p.name)}${off.has(p.id) ? ' ⏸' : ''}\n<code>${esc(p.enter)}</code>`).join('\n\n') + '\n\n' + tr(L, 'kitFoot');
}
const kitKb = (L) => back(L, [[{ text: tr(L, 'bTip'), callback_data: 'tip' }]]);

/* ---------- proxy sharing: a friend types the share name (and password) in the bot and gets the owner's proxy — no Cloudflare account needed ---------- */
const ALIAS = /^[a-z0-9][a-z0-9_-]{2,23}$/;
const RESERVED = new Set(['start', 'help', 'new', 'cancel', 'profile', 'proxies', 'support', 'admin', 'use', 'menu', 'panel', 'stop', 'lock', 'bot']);
const hexOf = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
// PBKDF2-SHA256, 100 000 rounds (the maximum Workers allow) with a random salt per share — the password itself is never stored
const pbk = async (pw, salt) => hexOf(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']), 256));
async function setShare(env, uid, pid, aliasRaw, pw) {
  const alias = String(aliasRaw || '').trim().toLowerCase();
  if (!ALIAS.test(alias) || RESERVED.has(alias)) return 'alias';
  pw = String(pw || '');
  if (pw && (pw.length < 4 || pw.length > 64)) return 'pw';
  if (!(await one(env, 'SELECT id FROM proxies WHERE id=? AND uid=?', pid, uid))) return 'notfound';
  const ex = await one(env, 'SELECT pid FROM shares WHERE alias=?', alias);
  if (ex && ex.pid !== pid) return 'taken';
  const salt = pw ? hx(16) : '';
  await env.DB.batch([bind(env, 'DELETE FROM shares WHERE pid=?', [pid]), bind(env, 'INSERT INTO shares(alias,pid,uid,salt,hash,created) VALUES(?,?,?,?,?,?)', [alias, pid, uid, salt, pw ? await pbk(pw, salt) : '', Date.now()])]);
  return null;
}
const shareOf = (env, pid) => one(env, 'SELECT alias, hash<>\'\' pw, uses, lock FROM shares WHERE pid=?', pid);
// returns true when the message was handled (silent: unknown names fall through to the normal menu)
async function useShare(env, L, u, chat, alias, pw, silent) {
  alias = String(alias || '').trim().toLowerCase();
  const s = ALIAS.test(alias) ? await one(env, 'SELECT s.*, p.enter, p.name pname, p.uid owner FROM shares s JOIN proxies p ON p.id=s.pid WHERE s.alias=?', alias) : null;
  if (!s) { if (!silent) await say(env, chat, tr(L, 'shNone'), back(L)); return !silent; }
  if (s.lock > Date.now()) { await say(env, chat, tr(L, 'shLocked'), back(L)); return true; }
  if (s.hash) {
    if (pw === undefined) { await run(env, 'UPDATE users SET state=? WHERE id=?', 'sp:' + alias, u.id); await say(env, chat, tr(L, 'shPass'), cancelKb(L)); return true; }
    if (!eq(await pbk(String(pw), s.salt), s.hash)) {
      const f = s.fails + 1;
      if (f >= 5) { await run(env, 'UPDATE shares SET fails=0, lock=? WHERE alias=?', Date.now() + 15 * 60e3, alias); await say(env, s.owner, tr('en', 'shAlert', alias)); await run(env, 'UPDATE users SET state=NULL WHERE id=?', u.id); await say(env, chat, tr(L, 'shLocked'), back(L)); }
      else { await run(env, 'UPDATE shares SET fails=? WHERE alias=?', f, alias); await say(env, chat, tr(L, 'shBad', 5 - f), cancelKb(L)); }
      return true;
    }
  }
  await run(env, 'UPDATE users SET state=NULL WHERE id=?', u.id);
  await run(env, 'UPDATE shares SET fails=0, uses=uses+1 WHERE alias=?', alias);
  const off = await metaGet(env, 'off:' + s.pid);
  await say(env, chat, tr(L, 'shOk', esc(alias)) + (off ? '\n\n' + tr(L, 'shOff') : ''), back(L, [[{ text: tr(L, 'bAdd'), url: s.enter }]]));
  return true;
}
const shareText = async (env, L, p) => { const s = await shareOf(env, p.id); return s ? tr(L, 'shInfo', s.alias, !!s.pw, s.uses) : tr(L, 'shNo'); };
const shareKb = (L, p, has) => back(L, [[{ text: tr(L, has ? 'shChange' : 'shMake'), callback_data: 'ss:' + p.id }, ...(has ? [{ text: tr(L, 'shRemove'), callback_data: 'sx:' + p.id }] : [])], [{ text: tr(L, 'bBack2'), callback_data: 'px:' + p.id }]]);

/* ---------- support ---------- */
async function adminIds(env) { return [OWNER(env), ...(await all(env, 'SELECT id FROM admins')).map((a) => a.id)]; }
async function userMsg(env, u, text, tid) {
  const now = Date.now();
  let t = tid ? await one(env, 'SELECT * FROM tickets WHERE id=? AND uid=?', tid, u.id) : await one(env, "SELECT * FROM tickets WHERE uid=? AND status='open' ORDER BY id DESC", u.id);
  if (!t) { const r = await run(env, 'INSERT INTO tickets(uid,subject,created,upd) VALUES(?,?,?,?)', u.id, text.slice(0, 40), now, now); t = { id: r.meta.last_row_id }; }
  await env.DB.batch([bind(env, 'INSERT INTO msgs(tid,admin,text,ts) VALUES(?,0,?,?)', [t.id, text.slice(0, 2000), now]), bind(env, "UPDATE tickets SET upd=?, status='open' WHERE id=?", [now, t.id])]);
  for (const a of await adminIds(env)) await say(env, a, `🆘 <b>Ticket #${t.id}</b> — ${esc(u.name)} (<code>${u.id}</code>)\n\n${esc(text.slice(0, 800))}`, { inline_keyboard: [[{ text: '💬 Reply', callback_data: 'tr:' + t.id }, { text: '✅ Close', callback_data: 'tc:' + t.id }]] });
  return t.id;
}
async function adminReply(env, origin, tid, text) {
  const t = await one(env, 'SELECT t.*, u.lang FROM tickets t JOIN users u ON u.id=t.uid WHERE t.id=?', tid);
  if (!t) return false;
  const L = LANGS[t.lang] ? t.lang : 'en';
  await env.DB.batch([bind(env, 'INSERT INTO msgs(tid,admin,text,ts) VALUES(?,1,?,?)', [tid, text.slice(0, 2000), Date.now()]), bind(env, 'UPDATE tickets SET upd=? WHERE id=?', [Date.now(), tid])]);
  await say(env, t.uid, `${tr(L, 'repHdr', tid)}\n\n${esc(text)}`, { inline_keyboard: [[{ text: tr(L, 'repBtn'), web_app: { url: `${origin}/app#support` } }]] });
  return true;
}

/* ---------- create proxies inside the bot (token is used once, never stored) ---------- */
async function startNew(env, L, u) { await run(env, "UPDATE users SET state='names' WHERE id=?", u.id); return { text: tr(L, 'newAsk'), kb: cancelKb(L) }; }
async function doBotCreate(env, origin, L, u, chat, m, text) {
  const parts = text.split(/\s+/).filter(Boolean);
  const acc = parts.find((x) => /^[a-f0-9]{32}$/i.test(x));
  const token = fixTok(parts.filter((x) => x !== acc).sort((a, b) => b.length - a.length)[0] || '');
  await tg(env, 'deleteMessage', { chat_id: chat, message_id: m.message_id }); // remove the token from the chat right away
  if (token.length < 20) return await say(env, chat, tr(L, 'badCred'), cancelKb(L));
  if (await guard(env, u.id)) return await say(env, chat, tr(L, 'wait'));
  const names = u.state.slice(5).split('|');
  await say(env, chat, tr(L, 'building', names.length));
  try {
    const made = await createProxies(env, origin, u, names, acc, token);
    await run(env, 'UPDATE users SET state=NULL WHERE id=?', u.id);
    await say(env, chat, tr(L, 'made', made.length), back(L, made.map((p) => [{ text: '➕ ' + p.name, url: p.enter }])));
  } catch (e) {
    if (e.made?.length) { await run(env, 'UPDATE users SET state=NULL WHERE id=?', u.id); await say(env, chat, tr(L, 'made', e.made.length), back(L, e.made.map((p) => [{ text: '➕ ' + p.name, url: p.enter }]))); }
    await say(env, chat, e.message === 'noacct' ? tr(L, 'noAcct') : e.message === 'limit' ? tr(L, 'limitErr') : tr(L, 'cfErr', e.message), e.made?.length ? undefined : cancelKb(L));
  }
}

/* ---------- update router ---------- */
async function onUpdate(env, origin, up) {
  const from = (up.callback_query || up.message || {}).from;
  if (!from || from.is_bot) return;
  const u = await getUser(env, from);
  if (u.banned) return;
  const L = LANGS[u.lang] ? u.lang : 'en';
  if (up.callback_query) return onCallback(env, origin, up.callback_query, u, L);

  const m = up.message, chat = m.chat.id, t = (m.text || '').trim();
  if (!t || m.chat.type !== 'private') return; // never process tokens or commands from groups
  const [cmd, ...rest] = t.split(/\s+/), arg = rest.join(' '), r = await role(env, u.id);

  if (cmd === '/joininfo' && r !== 'user') {
    const chs = await chans(env);
    if (!chs.length) return await say(env, chat, '🔎 No channels configured yet. Use /addchannel @name');
    const me = (await tg(env, 'getMe', {})).result || {};
    let txt = `🔎 <b>Forced join</b>: ${(await lockOn(env)) ? '🔒 ON' : '🔓 OFF'}\nYour role: ${r} (owner/admins are exempt — use /testjoin or another account)\n`;
    for (const c of chs) {
      const b = await tg(env, 'getChatMember', { chat_id: c.id, user_id: me.id }), m = await tg(env, 'getChatMember', { chat_id: c.id, user_id: u.id });
      txt += `\n<b>${esc(c.id)}</b>\n• bot: ${b.ok ? b.result.status : '❌ ' + esc(b.description || '')}\n• you: ${m.ok ? m.result.status : '❌ ' + esc(m.description || '')}`;
    }
    return await say(env, chat, txt);
  }
  if (cmd === '/testjoin' && r !== 'user') { const mm = await missing(env, u, true); return await (mm.length ? say(env, chat, joinMsg(L, mm), joinKb(L, mm)) : say(env, chat, '✅ You are a member of every required channel.')); }
  const miss = await missing(env, u);
  if (miss.length) { if (/^(cred|sp|shs):/.test(u.state || '')) await tg(env, 'deleteMessage', { chat_id: chat, message_id: m.message_id }); return await say(env, chat, joinMsg(L, miss), joinKb(L, miss)); }

  if (cmd === '/cancel') { await run(env, 'UPDATE users SET state=NULL WHERE id=?', u.id); return await say(env, chat, tr(L, 'cancelled'), home(L, origin)); }
  if (cmd === '/new') { const v = await startNew(env, L, u); return await say(env, chat, v.text, v.kb); }
  if (u.state === 'names' && !t.startsWith('/')) {
    const names = cleanNames(t.split(/\n|,|،/));
    if (!names.length) return await say(env, chat, tr(L, 'newAsk'), cancelKb(L));
    await run(env, 'UPDATE users SET state=? WHERE id=?', 'cred:' + names.join('|'), u.id);
    return await say(env, chat, tr(L, 'credAsk'), cancelKb(L));
  }
  if (u.state?.startsWith('cred:') && !t.startsWith('/')) return await doBotCreate(env, origin, L, u, chat, m, t);
  if (u.state?.startsWith('sp:') && !t.startsWith('/')) { await tg(env, 'deleteMessage', { chat_id: chat, message_id: m.message_id }); return await useShare(env, L, u, chat, u.state.slice(3), t); }
  if (u.state === 'alias' && !t.startsWith('/')) { const [a, ...pw] = t.split(/\s+/); if (pw.length) await tg(env, 'deleteMessage', { chat_id: chat, message_id: m.message_id }); await run(env, 'UPDATE users SET state=NULL WHERE id=?', u.id); return await useShare(env, L, u, chat, a, pw.length ? pw.join(' ') : undefined); }
  if (u.state?.startsWith('shs:') && !t.startsWith('/')) {
    await tg(env, 'deleteMessage', { chat_id: chat, message_id: m.message_id });
    const pid = u.state.slice(4), [a, ...pw] = t.split(/\s+/), e = await setShare(env, u.id, pid, a, pw.join(' '));
    if (e) return await say(env, chat, tr(L, 'shErr', e), cancelKb(L));
    await run(env, 'UPDATE users SET state=NULL WHERE id=?', u.id);
    return await say(env, chat, tr(L, 'shDone', a.toLowerCase(), !!pw.join(' ')), back(L, [[{ text: tr(L, 'bBack2'), callback_data: 'px:' + pid }]]));
  }
  if (cmd === '/use') return await (arg ? useShare(env, L, u, chat, arg.split(/\s+/)[0], arg.split(/\s+/).length > 1 ? arg.split(/\s+/).slice(1).join(' ') : undefined) : (run(env, "UPDATE users SET state='alias' WHERE id=?", u.id).then(() => say(env, chat, tr(L, 'useAsk'), cancelKb(L)))));
  if (cmd === '/start' && /^use_[a-z0-9_-]{3,24}$/i.test(arg)) return await useShare(env, L, u, chat, arg.slice(4), undefined);

  if (cmd === '/profile') return await say(env, chat, tr(L, 'profile', u, (await myProxies(env, u.id)).length), home(L, origin));
  if (cmd === '/help') return await say(env, chat, tr(L, 'help'), back(L));
  if (cmd === '/proxies') { const v = await listView(env, L, u); return await say(env, chat, v.text, v.kb); }
  if (cmd === '/support') { await run(env, "UPDATE users SET state='ticket' WHERE id=?", u.id); return await say(env, chat, tr(L, 'supAsk')); }

  if (u.state?.startsWith('reply:') && r !== 'user' && !t.startsWith('/')) {
    await run(env, 'UPDATE users SET state=NULL WHERE id=?', u.id);
    return await say(env, chat, (await adminReply(env, origin, Number(u.state.slice(6)), t)) ? '✅ Sent.' : '⚠️ Ticket not found.');
  }
  if (u.state === 'ticket' && !t.startsWith('/')) { await run(env, 'UPDATE users SET state=NULL WHERE id=?', u.id); const id = await userMsg(env, u, t); return await say(env, chat, tr(L, 'supOk', id), back(L)); }

  if (r !== 'user') {
    const id = /^\d+$/.test(arg.split(' ')[0]) ? Number(arg.split(' ')[0]) : null;
    if (cmd === '/admin') { const s = await stats(env); return await say(env, chat, `🛠️ <b>Admin</b>\n\n👥 Users: <b>${s.users}</b> (+${s.newToday} today)\n📡 Proxies: ${s.proxies} (down: ${s.down})\n📊 Today: ${s.req.toLocaleString('en')} requests · ${fmtB(s.bytes)}\n🆘 Open tickets: ${s.tickets}\n\n/user id · /ban id · /unban id · /adduser id\n/broadcast text\n(owner) /addadmin id · /rmadmin id\n/addchannel @x (or -100id + invite link) · /rmchannel @x\n/lock on|off (forced join) · /testjoin · /joininfo`, { inline_keyboard: [[{ text: '🛠️ Admin panel', web_app: { url: `${origin}/app#admin` } }]] }); }
    if (cmd === '/user' && id) return await say(env, chat, await userCard(env, id));
    if (cmd === '/ban' && id) { await run(env, 'UPDATE users SET banned=1 WHERE id=?', id); return await say(env, chat, '⛔ Banned'); }
    if (cmd === '/unban' && id) { await run(env, 'UPDATE users SET banned=0 WHERE id=?', id); return await say(env, chat, '✅ Unbanned'); }
    if (cmd === '/adduser' && id) { await addUser(env, id); return await say(env, chat, '✅ Done'); }
    if (r === 'owner') {
      if (cmd === '/broadcast' && arg) { await metaSet(env, 'bc', JSON.stringify({ text: arg, cur: 0, sent: 0 })); return await say(env, chat, '📣 Queued (20 users every 5 min).'); }
      if (cmd === '/addadmin' && id) { await run(env, 'INSERT OR IGNORE INTO admins(id) VALUES(?)', id); return await say(env, chat, '✅ Admin added'); }
      if (cmd === '/rmadmin' && id) { await run(env, 'DELETE FROM admins WHERE id=?', id); return await say(env, chat, '✅ Admin removed'); }
      if (cmd === '/addchannel' && arg) {
        const [cid, link] = arg.split(/\s+/), e = await addChannel(env, cid, link);
        return await say(env, chat, e ? { badch: '⚠️ Use @channelname, or a numeric id like -1001234567890 followed by the invite link.', nochannel: '⚠️ Channel not found, or the bot is not an admin there. Make the bot an admin first, then run the command again.', nolink: '⚠️ Private channel: send the invite link after the id (https://t.me/+xxxx), or give the bot the “invite users” right.' }[e] : '✅ Forced join enabled');
      }
      if (cmd === '/rmchannel' && arg) { await run(env, 'DELETE FROM channels WHERE id=? COLLATE NOCASE', arg); await run(env, 'DELETE FROM meta WHERE k=?', 'cl' + arg); return await say(env, chat, '✅ Removed'); }
      if (cmd === '/lock') {
        if (arg === 'on' || arg === 'off') { await metaSet(env, 'fjoff', arg === 'off' ? '1' : '0'); await run(env, 'UPDATE users SET jchk=0'); }
        let rep = '';
        if (await lockOn(env)) { // self-test: can the bot really check every channel?
          const me = (await tg(env, 'getMe', {})).result || {}, chs = await chans(env);
          if (!chs.length) rep = '\n\n⚠️ No channels yet — add one with /addchannel.';
          for (const c of chs) { const x = await tg(env, 'getChatMember', { chat_id: c.id, user_id: me.id }); rep += `\n${x.ok && ['administrator', 'creator'].includes(x.result.status) ? '✅' : '❌'} ${esc(c.id)}${x.ok && ['administrator', 'creator'].includes(x.result.status) ? '' : ' — make the bot an admin here'}`; }
        }
        return await say(env, chat, ((await lockOn(env)) ? '🔒 Forced join is <b>ON</b>. Non-members are blocked until they join.\n/lock off to disable.' : '🔓 Forced join is <b>OFF</b> (channels are kept).\n/lock on to enable.') + rep);
      }
    }
  }
  if (!u.state && !t.startsWith('/') && ALIAS.test(t.toLowerCase()) && (await useShare(env, L, u, chat, t, undefined, true))) return;
  const hi = cmd === '/start' && r === 'user' && miss.verified ? tr(L, 'joinedOk') + '\n\n' : ''; // reached only when every channel check passed
  await say(env, chat, hi + tr(L, 'welcome', esc(from.first_name)), home(L, origin));
}

async function listView(env, L, u) {
  const ps = await myProxies(env, u.id);
  if (!ps.length) return { text: tr(L, 'noProx'), kb: back(L, [[{ text: tr(L, 'bNew'), callback_data: 'new' }]]) };
  const off = await offSet(env);
  return { text: tr(L, 'proxHdr', ps.length), kb: back(L, ps.map((p) => [{ text: `${off.has(p.id) ? '⏸' : p.fail >= 2 ? '🔴' : '🟢'} ${p.name}`, callback_data: 'px:' + p.id }])) };
}

async function onCallback(env, origin, q, u, L) {
  const [act, id] = q.data.split(':'), r = await role(env, u.id);
  let text = tr(L, 'welcome', esc(q.from.first_name)), kb = home(L, origin), toast;
  if (act === 'chk') await run(env, 'UPDATE users SET jchk=0 WHERE id=?', u.id);
  const miss = await missing(env, act === 'chk' ? { ...u, jchk: 0 } : u);
  if (miss.length) { await tg(env, 'answerCallbackQuery', { callback_query_id: q.id, text: act === 'chk' ? tr(L, 'notYet') : undefined, show_alert: act === 'chk' }); return await edit(env, q, joinMsg(L, miss), joinKb(L, miss)); }

  if (act === 'chk' && miss.verified) { toast = tr(L, 'joinedOk'); text = toast + '\n\n' + text; }
  const p = id ? await one(env, 'SELECT * FROM proxies WHERE id=? AND uid=?', id, u.id) : null;
  if (act === 'cx') await run(env, 'UPDATE users SET state=NULL WHERE id=?', u.id);
  else if (act === 'new') { const v = await startNew(env, L, u); text = v.text; kb = v.kb; }
  else if (act === 'kit') { const k = await kitText(env, L, u.id); text = k || tr(L, 'noProx'); kb = k ? kitKb(L) : back(L); }
  else if (act === 'faq') { text = tr(L, 'faqT'); kb = faqKb(L); }
  else if (/^fq:\d+$/.test(q.data)) { const f = faqOf(L)[Number(q.data.slice(3))]; text = f ? `<b>${esc(f[0])}</b>\n\n${esc(f[1])}` : tr(L, 'faqT'); kb = back(L, [[{ text: tr(L, 'bFaq'), callback_data: 'faq' }]]); }
  else if (act === 'tip') { text = tr(L, 'tipText'); kb = back(L); }
  else if (act === 'use') { await run(env, "UPDATE users SET state='alias' WHERE id=?", u.id); text = tr(L, 'useAsk'); kb = cancelKb(L); }
  else if (act === 'profile') { text = tr(L, 'profile', u, (await myProxies(env, u.id)).length); kb = back(L); }
  else if (act === 'help') { text = tr(L, 'help'); kb = back(L); }
  else if (act === 'list') { const v = await listView(env, L, u); text = v.text; kb = v.kb; }
  else if (act === 'lang') { text = tr(L, 'langPick'); kb = { inline_keyboard: [Object.entries(LANGS).map(([k, n]) => ({ text: n, callback_data: 'sl:' + k })), [{ text: tr(L, 'bBack'), callback_data: 'home' }]] }; }
  else if (act === 'sl' && LANGS[id]) { await run(env, 'UPDATE users SET lang=? WHERE id=?', id, u.id); L = id; text = tr(L, 'welcome', esc(q.from.first_name)); kb = home(L, origin); }
  else if (act === 'sup') { await run(env, "UPDATE users SET state='ticket' WHERE id=?", u.id); text = tr(L, 'supAsk'); kb = back(L); }
  else if (act === 'tr' && r !== 'user') { await run(env, 'UPDATE users SET state=? WHERE id=?', 'reply:' + id, u.id); await tg(env, 'answerCallbackQuery', { callback_query_id: q.id }); return await say(env, q.message.chat.id, `✍️ Send your reply to ticket #${id}:`); }
  else if (act === 'tc' && r !== 'user') { await run(env, "UPDATE tickets SET status='closed' WHERE id=?", id); toast = 'Closed'; text = esc(q.message.text || '') + '\n\n✅ Closed'; kb = undefined; }
  else if (p && act === 'px') { text = await proxyText(env, L, p); kb = proxyKb(L, p, (await metaGet(env, 'ver:' + p.id)) === BUNDLE); }
  else if (p && act === 'sh') { text = await shareText(env, L, p); kb = shareKb(L, p, !!(await shareOf(env, p.id))); }
  else if (p && act === 'ss') { await run(env, 'UPDATE users SET state=? WHERE id=?', 'shs:' + p.id, u.id); text = tr(L, 'shAsk'); kb = cancelKb(L); }
  else if (p && act === 'sx') { await run(env, 'DELETE FROM shares WHERE pid=?', p.id); toast = tr(L, 'shGone'); text = await shareText(env, L, p); kb = shareKb(L, p, false); }
  else if (p && act === 'dl') { text = tr(L, 'rmAsk', p.name); kb = { inline_keyboard: [[{ text: tr(L, 'bYes'), callback_data: 'dy:' + p.id }, { text: tr(L, 'bNo'), callback_data: 'px:' + p.id }]] }; }
  else if (p && act === 'dy') { await env.DB.batch([bind(env, 'DELETE FROM proxies WHERE id=?', [p.id]), bind(env, 'DELETE FROM usage WHERE pid=?', [p.id]), bind(env, 'DELETE FROM shares WHERE pid=?', [p.id]), bind(env, 'DELETE FROM meta WHERE k IN (?,?,?,?)', ['off:' + p.id, 'pl:' + p.id, 'ver:' + p.id, 'geo:' + p.id])]); const v = await listView(env, L, u); text = tr(L, 'rmDone') + '\n\n' + v.text; kb = v.kb; }
  await tg(env, 'answerCallbackQuery', { callback_query_id: q.id, text: toast });
  await edit(env, q, text, kb);
}

/* ================= admin data ================= */
async function stats(env) {
  const d = day(), t0 = new Date(d).getTime();
  const [a, b, c, e, f] = await Promise.all([
    one(env, 'SELECT COUNT(*) n, SUM(joined>=?) t, SUM(banned) bn FROM users', t0),
    one(env, 'SELECT COUNT(*) n, SUM(fail>=2) d FROM proxies'),
    one(env, 'SELECT COALESCE(SUM(req),0) r, COALESCE(SUM(bytes),0) b FROM usage WHERE day=?', d),
    one(env, "SELECT COUNT(*) n FROM tickets WHERE status='open'"),
    one(env, 'SELECT COUNT(*) n FROM users WHERE last>=?', Date.now() - 864e5),
  ]);
  return { users: a.n, newToday: a.t || 0, banned: a.bn || 0, active24: f.n, proxies: b.n, down: b.d || 0, req: c.r, bytes: c.b, tickets: e.n };
}
async function userCard(env, id) {
  const u = await one(env, 'SELECT * FROM users WHERE id=?', id);
  if (!u) return '⚠️ User not found';
  const ps = await myProxies(env, id);
  const us = await one(env, 'SELECT COALESCE(SUM(bytes),0) b, COALESCE(SUM(req),0) r FROM usage WHERE pid IN (SELECT id FROM proxies WHERE uid=?) AND day>=?', id, ago(29));
  return `👤 <b>${esc(u.name)}</b> <code>${u.id}</code>\nJoined: ${fmtDate(u.joined)}${u.banned ? ' · ⛔' : ''}\nProxies: ${ps.length}\n30d usage: ${fmtB(us.b)} · ${us.r.toLocaleString('en')} requests\n` + ps.map((p) => `• ${esc(p.name)} ${p.fail >= 2 ? '🔴' : '🟢'}`).join('\n');
}
async function addUser(env, id) {
  await run(env, "INSERT OR IGNORE INTO users(id,name,joined) VALUES(?,'User',?)", id, Date.now());
}

/* ================= Cloudflare (token used transiently, never persisted) ================= */
async function cf(token, method, path, body, form) {
  const r = await fetch('https://api.cloudflare.com/client/v4' + path, { method, headers: { Authorization: 'Bearer ' + token, ...(body && !form ? { 'content-type': 'application/json' } : {}) }, body: form || (body ? JSON.stringify(body) : undefined) });
  const j = await r.json().catch(() => ({}));
  if (!j.success) { const e = new Error(j.errors?.[0]?.message || 'cf'); e.code = j.errors?.[0]?.code; throw e; }
  return j.result;
}
// Fixed locations (Cloudflare "placement hints"): the worker runs in the chosen region instead of next to each visitor.
// smart = Cloudflare Smart Placement: the worker runs where the round-trip to Telegram is shortest (best default for mobile networks)
// Region hints are {provider}:{region}. The hint says where the worker code runs relative to its backend (Telegram), Cloudflare may still adjust it.
const LOCS = {
  smart: { mode: 'smart' },
  nl: { region: 'gcp:europe-west4' }, eu: { region: 'aws:eu-central-1' }, gb: { region: 'aws:eu-west-2' }, fr: { region: 'aws:eu-west-3' }, se: { region: 'aws:eu-north-1' },
  ae: { region: 'aws:me-central-1' }, bh: { region: 'aws:me-south-1' }, in: { region: 'aws:ap-south-1' },
  asia: { region: 'aws:ap-southeast-1' }, jp: { region: 'aws:ap-northeast-1' }, us: { region: 'aws:us-east-1' },
};
// Country restriction chosen in the panel (GEO env of the proxy). Only sent when the owner used the toggle, so values set by hand in the Cloudflare dashboard are left alone otherwise.
const geoVars = async (env, pid) => { const v = await metaGet(env, 'geo:' + pid); return v == null ? {} : { GEO: v }; };
async function deploy(token, acc, id, vars, o = {}) {
  // keep:true  → settings the owner added in the Cloudflare dashboard (GEO, MAX_LANES, …) survive an update; only our own variables are overwritten
  // loc        → optional fixed region. If Cloudflare refuses an option we retry without it, so a deploy never fails because of a nice-to-have.
  const place = LOCS[o.loc] ? { placement: LOCS[o.loc] } : {}, keep = o.keep ? { keep_bindings: ['plain_text', 'secret_text'] } : {};
  const tries = [{ ...keep, ...place }, ...(place.placement ? [{ ...keep }] : []), ...(o.keep ? [{}] : [])].filter((x, i, a) => a.findIndex((y) => JSON.stringify(y) === JSON.stringify(x)) === i);
  let placed = false;
  for (const [i, extra] of tries.entries()) {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ main_module: 'worker.js', compatibility_date: '2025-01-01', bindings: Object.entries(vars).map(([name, text]) => ({ type: 'plain_text', name, text })), ...extra })], { type: 'application/json' }));
    form.append('worker.js', new Blob([WRAP], { type: 'application/javascript+module' }), 'worker.js');
    form.append('core.js', new Blob([PROXY_CODE], { type: 'application/javascript+module' }), 'core.js');
    try { await cf(token, 'PUT', `/accounts/${acc}/workers/scripts/${id}`, null, form); placed = !!extra.placement; break; } catch (e) { if (i === tries.length - 1 || e.code === 10000) throw e; }
  }
  await cf(token, 'POST', `/accounts/${acc}/workers/scripts/${id}/subdomain`, { enabled: true, previews_enabled: false });
  return { placed };
}
const locMap = async (env) => Object.fromEntries((await all(env, "SELECT k,v FROM meta WHERE k LIKE 'pl:%'")).map((r) => [r.k.slice(3), r.v]));
// after a redeploy: a paused proxy stays paused, a location choice is remembered
async function afterDeploy(env, token, acc, p, loc, placed) {
  await metaSet(env, 'ver:' + p.id, BUNDLE);
  if (await metaGet(env, 'off:' + p.id)) await cf(token, 'POST', `/accounts/${acc}/workers/scripts/${p.id}/subdomain`, { enabled: false, previews_enabled: false });
  if (loc === 'auto' || !LOCS[loc]) await run(env, 'DELETE FROM meta WHERE k=?', 'pl:' + p.id); else if (placed) await metaSet(env, 'pl:' + p.id, loc);
}
const cred = (b) => {
  const acc = String(b.account || '').trim(), token = String(b.token || '').trim();
  if (!/^[a-f0-9]{32}$/i.test(acc) || token.length < 20) throw new Error('creds');
  return { acc, token };
};

/* ================= Mini-app API ================= */
async function authInit(env, init) {
  const p = new URLSearchParams(init || ''), h = p.get('hash');
  if (!h) return null;
  p.delete('hash');
  const s = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const hm = async (k, d) => new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', typeof k === 'string' ? new TextEncoder().encode(k) : k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), new TextEncoder().encode(d)));
  const d = [...(await hm(await hm('WebAppData', env.BOT_TOKEN), s))].map((x) => x.toString(16).padStart(2, '0')).join('');
  if (!eq(d, h) || Date.now() / 1000 - Number(p.get('auth_date')) > 86400) return null;
  return JSON.parse(p.get('user'));
}

async function api(req, env, route, origin) {
  const from = await authInit(env, req.headers.get('x-init'));
  if (!from) return J({ ok: false, error: 'auth' }, 401);
  const u = await getUser(env, from);
  if (u.banned) return J({ ok: false, error: 'banned' }, 403);
  const r = await role(env, u.id), isA = r !== 'user';
  const b = await req.json().catch(() => ({}));
  const ok = (o = {}) => J({ ok: true, ...o });
  const bad = (e, s = 400) => J({ ok: false, error: e }, s);
  // The forced-join prompt lives in the bot chat, not in the panel: the panel only says "check your chat with the bot".
  const joinErr = async (miss) => { await joinPing(env, origin, u, miss); return J({ ok: false, error: 'join', broken: miss.some((c) => c.broken) }, 403); };
  // Forced join is enforced on every API route except identity/settings/recheck, so the panel cannot bypass it.
  if (!isA && !['me', 'settings', 'chk'].includes(route)) { const miss = await missing(env, u); if (miss.length) return await joinErr(miss); }
  const A = (o) => { if (!isA) throw Object.assign(new Error('forbidden'), { st: 403 }); return o; };
  const O = () => { if (r !== 'owner') throw Object.assign(new Error('forbidden'), { st: 403 }); };
  try {
    switch (route) {
      case 'me': { const miss = await missing(env, u); if (miss.length) await joinPing(env, origin, u, miss); return ok({ user: { id: u.id, name: u.name, joined: u.joined, notify: !!u.notify, lang: LANGS[u.lang] ? u.lang : 'en', role: r }, join: miss.length > 0, broken: miss.some((c) => c.broken) }); }
      case 'chk': { await run(env, 'UPDATE users SET jchk=0 WHERE id=?', u.id); const miss = await missing(env, { ...u, jchk: 0 }); if (miss.length) await joinPing(env, origin, u, miss); return ok({ join: miss.length > 0, broken: miss.some((c) => c.broken), joined: !miss.length && !!miss.verified }); }
      case 'proxies': {
        const ps = await myProxies(env, u.id), off = await offSet(env), lm = await locMap(env), vm = Object.fromEntries((await all(env, "SELECT k,v FROM meta WHERE k LIKE 'ver:%'")).map((r) => [r.k.slice(4), r.v])), gm = Object.fromEntries((await all(env, "SELECT k,v FROM meta WHERE k LIKE 'geo:%'")).map((r) => [r.k.slice(4), r.v])), shm = Object.fromEntries((await all(env, 'SELECT pid, alias, hash<>\'\' pw, uses FROM shares WHERE uid=?', u.id)).map((r) => [r.pid, { alias: r.alias, pw: !!r.pw, uses: r.uses }]));
        const us = await all(env, 'SELECT pid, day, req, bytes FROM usage WHERE day>=? AND pid IN (SELECT id FROM proxies WHERE uid=?)', ago(6), u.id);
        return ok({ bundle: BUNDLE, proxies: ps.map((p) => { const x = us.filter((s) => s.pid === p.id); const t = x.find((s) => s.day === day()); return { ...p, off: off.has(p.id), ver: vm[p.id] || 'v4', geo: gm[p.id] ?? null, share: shm[p.id] || null, loc: lm[p.id] || 'auto', today: { req: t?.req || 0, bytes: t?.bytes || 0 }, week: x.reduce((a, s) => a + s.bytes, 0), spark: Array.from({ length: 7 }, (_, i) => x.find((s) => s.day === ago(6 - i))?.bytes || 0) }; }) });
      }
      case 'settings': if (b.notify !== undefined) await run(env, 'UPDATE users SET notify=? WHERE id=?', b.notify ? 1 : 0, u.id); if (LANGS[b.lang]) await run(env, 'UPDATE users SET lang=? WHERE id=?', b.lang, u.id); return ok();
      case 'create': {
        const names = cleanNames(Array.isArray(b.members) ? b.members : []);
        if (!names.length) return bad('names');
        if (await guard(env, u.id)) return bad('wait', 429);
        const made = await createProxies(env, origin, u, names, String(b.account || '').trim(), fixTok(b.token), String(b.loc || 'auto'));
        return ok({ made }); // token goes out of scope here — nothing persisted
      }
      case 'share_set': { const pw = String(b.password || ''), e = await setShare(env, u.id, String(b.id), b.alias, pw); return e ? bad(e) : ok({ alias: String(b.alias).trim().toLowerCase(), pw: !!pw }); }
      case 'kit': { const k = await kitText(env, LANGS[u.lang] ? u.lang : 'en', u.id); if (!k) return bad('notfound'); await say(env, u.id, k, kitKb(LANGS[u.lang] ? u.lang : 'en')); return ok(); }
      case 'share_del': await run(env, 'DELETE FROM shares WHERE pid=? AND uid=?', String(b.id), u.id); return ok();
      case 'rename': { const nm = cleanNames([b.name])[0]; if (!nm) return bad('names'); await run(env, 'UPDATE proxies SET name=? WHERE id=? AND uid=?', nm, b.id, u.id); return ok(); }
      case 'delete': {
        const p = await one(env, 'SELECT * FROM proxies WHERE id=? AND uid=?', b.id, u.id);
        if (!p) return bad('notfound', 404);
        if (b.token) { const token = fixTok(b.token); if (token.length < 20) return bad('creds'); const acc = await resolveAccount(token, String(b.account || '').trim()); await cf(token, 'DELETE', `/accounts/${acc}/workers/scripts/${p.id}?force=true`).catch((e) => { if (e.code !== 10007) throw e; }); } // 10007 = already gone
        await env.DB.batch([bind(env, 'DELETE FROM proxies WHERE id=?', [p.id]), bind(env, 'DELETE FROM usage WHERE pid=?', [p.id]), bind(env, 'DELETE FROM shares WHERE pid=?', [p.id]), bind(env, 'DELETE FROM meta WHERE k IN (?,?,?,?)', ['off:' + p.id, 'pl:' + p.id, 'ver:' + p.id, 'geo:' + p.id])]);
        return ok();
      }
      case 'update': { // redeploy newest core; needs a one-time token
        const p = await one(env, 'SELECT * FROM proxies WHERE id=? AND uid=?', b.id, u.id);
        if (!p) return bad('notfound', 404);
        const token = fixTok(b.token); if (token.length < 20) return bad('creds'); const acc = await resolveAccount(token, String(b.account || '').trim());
        let psec = new URL(p.enter).searchParams.get('secret');
        let link = p.enter;
        if (!/^[0-9a-f]{32}$/.test(psec || '')) { psec = hx(16); link = `https://t.me/webproxy?server=${new URL(p.url).host}&secret=${psec}`; await run(env, 'UPDATE proxies SET enter=? WHERE id=?', link, p.id); }
        const loc = b.loc === undefined ? (await metaGet(env, 'pl:' + p.id)) || 'auto' : String(b.loc);
        if (b.geo === 'IR' || b.geo === '') await metaSet(env, 'geo:' + p.id, b.geo);
        const d = await deploy(token, acc, p.id, { MTSECRET: psec, PID: p.id, SECRET: p.secret, REPORT: origin + '/r', ...(await geoVars(env, p.id)) }, { keep: true, loc });
        await afterDeploy(env, token, acc, p, loc, d.placed); // same link, same custom settings, still paused if it was paused
        return ok({ enter: link, placed: d.placed });
      }
      case 'rotate': { // brand-new secret → the old link stops working everywhere
        const p = await one(env, 'SELECT * FROM proxies WHERE id=? AND uid=?', b.id, u.id);
        if (!p) return bad('notfound', 404);
        const token = fixTok(b.token); if (token.length < 20) return bad('creds'); const acc = await resolveAccount(token, String(b.account || '').trim());
        const psec = hx(16), link = `https://t.me/webproxy?server=${new URL(p.url).host}&secret=${psec}`;
        const loc = (await metaGet(env, 'pl:' + p.id)) || 'auto';
        const d = await deploy(token, acc, p.id, { MTSECRET: psec, PID: p.id, SECRET: p.secret, REPORT: origin + '/r', ...(await geoVars(env, p.id)) }, { keep: true, loc });
        await run(env, 'UPDATE proxies SET enter=?, fail=0 WHERE id=?', link, p.id);
        await afterDeploy(env, token, acc, p, loc, d.placed);
        return ok({ enter: link });
      }
      case 'power': { // pause / resume = switch the worker's workers.dev address off / on (reversible, nothing is deleted)
        const p = await one(env, 'SELECT * FROM proxies WHERE id=? AND uid=?', b.id, u.id);
        if (!p) return bad('notfound', 404);
        const token = fixTok(b.token); if (token.length < 20) return bad('creds'); const acc = await resolveAccount(token, String(b.account || '').trim());
        const on = !!b.on;
        await cf(token, 'POST', `/accounts/${acc}/workers/scripts/${p.id}/subdomain`, { enabled: on, previews_enabled: false });
        if (on) { await run(env, 'DELETE FROM meta WHERE k=?', 'off:' + p.id); await run(env, 'UPDATE proxies SET fail=0 WHERE id=?', p.id); } else await metaSet(env, 'off:' + p.id, '1');
        return ok({ off: !on });
      }
      /* ----- support ----- */
      case 'tickets': return ok({ tickets: await all(env, 'SELECT id,subject,status,upd FROM tickets WHERE uid=? ORDER BY upd DESC LIMIT 30', u.id) });
      case 'ticket': {
        const t = await one(env, isA && b.admin ? 'SELECT * FROM tickets WHERE id=?' : 'SELECT * FROM tickets WHERE id=? AND uid=?', ...(isA && b.admin ? [b.id] : [b.id, u.id]));
        if (!t) return bad('notfound', 404);
        return ok({ ticket: t, msgs: await all(env, 'SELECT admin,text,ts FROM msgs WHERE tid=? ORDER BY id', t.id) });
      }
      case 'tnew': { const t = String(b.text || '').trim(); if (!t) return bad('empty'); return ok({ id: await userMsg(env, u, t, b.id) }); }
      /* ----- admin ----- */
      case 'a_stats': A(); return ok({ stats: await stats(env), top: await all(env, 'SELECT u.id, u.name, SUM(s.bytes) b, SUM(s.req) r FROM usage s JOIN proxies p ON p.id=s.pid JOIN users u ON u.id=p.uid WHERE s.day>=? GROUP BY u.id ORDER BY b DESC LIMIT 10', ago(6)), spark: await all(env, 'SELECT day, SUM(bytes) b, SUM(req) r FROM usage WHERE day>=? GROUP BY day ORDER BY day', ago(13)) });
      case 'a_users': { A(); const q = String(b.q || '').trim(); const rows = q ? await all(env, 'SELECT id,name,banned,extra,joined FROM users WHERE id=? OR name LIKE ? LIMIT 30', Number(q) || 0, '%' + q + '%') : await all(env, 'SELECT id,name,banned,extra,joined FROM users ORDER BY joined DESC LIMIT 30 OFFSET ?', (Number(b.page) || 0) * 30); return ok({ users: rows }); }
      case 'a_user': { A(); const x = await one(env, 'SELECT * FROM users WHERE id=?', Number(b.id)); if (!x) return bad('notfound', 404); const ps = await all(env, "SELECT p.id,p.name,p.fail,p.created, COALESCE((SELECT SUM(bytes) FROM usage WHERE pid=p.id AND day>=?),0) b30, COALESCE((SELECT SUM(req) FROM usage WHERE pid=p.id AND day>=?),0) r30 FROM proxies p WHERE uid=?", ago(29), ago(29), x.id); return ok({ user: { id: x.id, name: x.name, banned: x.banned, extra: x.extra, joined: x.joined}, proxies: ps }); }
      case 'a_ban': A(); await run(env, 'UPDATE users SET banned=? WHERE id=?', b.ban ? 1 : 0, Number(b.id)); return ok();
      case 'a_adduser': A(); if (!Number(b.id)) return bad('badid'); await addUser(env, Number(b.id)); return ok();
      case 'a_tickets': A(); return ok({ tickets: await all(env, 'SELECT t.id,t.subject,t.status,t.upd,t.uid,u.name FROM tickets t JOIN users u ON u.id=t.uid WHERE (?=\'all\' OR t.status=?) ORDER BY t.upd DESC LIMIT 40', b.f || 'open', b.f || 'open') });
      case 'a_reply': A(); if (!String(b.text || '').trim()) return bad('empty'); if (!(await adminReply(env, origin, Number(b.id), String(b.text)))) return bad('notfound', 404); return ok();
      case 'a_close': A(); await run(env, "UPDATE tickets SET status=? WHERE id=?", b.open ? 'open' : 'closed', Number(b.id)); return ok();
      case 'a_admins': O(); return ok({ admins: await all(env, 'SELECT a.id, COALESCE(u.name,\'\') name FROM admins a LEFT JOIN users u ON u.id=a.id') });
      case 'a_addadmin': O(); if (!Number(b.id)) return bad('badid'); await run(env, 'INSERT OR IGNORE INTO admins(id) VALUES(?)', Number(b.id)); return ok();
      case 'a_rmadmin': O(); await run(env, 'DELETE FROM admins WHERE id=?', Number(b.id)); return ok();
      case 'a_channels': A(); return ok({ channels: (await chans(env)).map(chOut), lock: await lockOn(env) });
      case 'a_addch': { O(); const e = await addChannel(env, b.id, b.link); return e ? bad(e) : ok(); }
      case 'a_rmch': O(); await run(env, 'DELETE FROM channels WHERE id=? COLLATE NOCASE', String(b.id)); await run(env, 'DELETE FROM meta WHERE k=?', 'cl' + String(b.id)); return ok();
      case 'a_fj': O(); await metaSet(env, 'fjoff', b.on ? '0' : '1'); await run(env, 'UPDATE users SET jchk=0'); return ok({ lock: !!b.on });
      case 'a_bc': O(); if (!String(b.text || '').trim()) return bad('empty'); await metaSet(env, 'bc', JSON.stringify({ text: String(b.text), cur: 0, sent: 0 })); return ok();
    }
    return bad('route', 404);
  } catch (e) { return J({ ok: false, error: e.message, ...(e.made ? { made: e.made } : {}) }, e.st || 400); }
}

/* ================= Cron: broadcast + health monitor ================= */
async function cron(env) {
  const bc = JSON.parse((await metaGet(env, 'bc')) || 'null');
  if (bc) {
    const us = await all(env, 'SELECT id FROM users WHERE id>? AND banned=0 ORDER BY id LIMIT 20', bc.cur);
    for (const x of us) { await say(env, x.id, bc.text); bc.cur = x.id; bc.sent++; }
    if (us.length < 20) await run(env, "DELETE FROM meta WHERE k='bc'"); else await metaSet(env, 'bc', JSON.stringify(bc));
    return;
  }
  const cur = (await metaGet(env, 'mon')) || '';
  const ps = await all(env, 'SELECT p.id,p.name,p.url,p.secret,p.fail,p.uid,u.notify,u.lang FROM proxies p JOIN users u ON u.id=p.uid WHERE p.id>? ORDER BY p.id LIMIT 8', cur);
  const off = await offSet(env);
  for (const p of ps) {
    if (off.has(p.id)) continue; // paused by the owner on purpose
    const up = await fetch(p.url + '/health', { headers: { 'x-k': p.secret }, signal: AbortSignal.timeout(6000) }).then((x) => x.ok).catch(() => false);
    const nf = up ? 0 : p.fail + 1;
    if (nf !== p.fail) await run(env, 'UPDATE proxies SET fail=? WHERE id=?', nf, p.id);
    if (p.notify && ((!up && nf === 2) || (up && p.fail >= 2))) { const L = LANGS[p.lang] ? p.lang : 'en'; await say(env, p.uid, tr(L, up ? 'nUp' : 'nDown', p.name)); }
  }
  if (ps.length < 8) await run(env, "DELETE FROM meta WHERE k='mon'"); else await metaSet(env, 'mon', ps[ps.length - 1].id);
}
