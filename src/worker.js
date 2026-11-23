// Bzgz Proxy Bot v3 — Cloudflare Worker + D1 (free tier)
// Bindings: DB (D1) | Secrets: BOT_TOKEN, WH_SECRET | Var: OWNER_ID (Telegram numeric id of the owner) | Cron: */5 * * * *
// User Cloudflare tokens are NEVER stored: they live in memory only for the one API call that needs them.
import PROXY_CODE from './core.html';
import APP_HTML from './app.html';

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

export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url), p = u.pathname;
    try {
      if (p === '/app') return new Response(APP_HTML, { headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-cache' } });
      if (p === '/hook/' + env.WH_SECRET && req.method === 'POST') { const up = await req.json(); ctx.waitUntil(onUpdate(env, u.origin, up).catch((e) => console.error('update failed', e && e.message))); return new Response('ok'); }
      if (p === '/setup/' + env.WH_SECRET) return J(await setup(env, u.origin));
      if (p === '/r' && req.method === 'POST') return await report(env, req);
      if (p.startsWith('/api/') && req.method === 'POST') return await api(req, env, p.slice(5), u.origin);
      if (p === '/') return new Response('Bzgz Proxy', { headers: { 'content-type': 'text/plain' } });
    } catch (e) { return J({ ok: false, error: e.message || 'internal' }, 500); }
    return new Response('Not found', { status: 404 });
  },
  async scheduled(ev, env, ctx) { ctx.waitUntil(cron(env)); },
};

/* ================= usage reports from proxies ================= */
async function report(env, req) {
  const b = await req.json().catch(() => ({}));
  const p = await one(env, 'SELECT id,secret FROM proxies WHERE id=?', String(b.p));
  if (!p || p.secret !== b.k) return new Response('no', { status: 403 });
  const r = Math.min(1e6, Math.max(0, Number(b.r) | 0)), by = Math.min(5e10, Math.max(0, Number(b.b) || 0));
  await env.DB.batch([
    bind(env, 'INSERT INTO usage(pid,day,req,bytes) VALUES(?,?,?,?) ON CONFLICT(pid,day) DO UPDATE SET req=req+excluded.req, bytes=bytes+excluded.bytes', [p.id, day(), r, by]),
    bind(env, 'UPDATE proxies SET seen=?, fail=0 WHERE id=?', [Date.now(), p.id]),
  ]);
  return new Response('ok');
}

/* ================= Telegram ================= */
const tg = (env, method, body) => fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({}));
const say = (env, chat, text, kb) => tg(env, 'sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });
const edit = (env, q, text, kb) => tg(env, 'editMessageText', { chat_id: q.message.chat.id, message_id: q.message.message_id, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });
async function setup(env, origin) {
  const C = (l, d) => tg(env, 'setMyCommands', { ...(l ? { language_code: l } : {}), commands: ['start', 'proxies', 'profile', 'support', 'help'].map((c, i) => ({ command: c, description: d[i] })) });
  return {
    webhook: await tg(env, 'setWebhook', { url: `${origin}/hook/${env.WH_SECRET}`, allowed_updates: ['message', 'callback_query'] }),
    menu: await tg(env, 'setChatMenuButton', { menu_button: { type: 'web_app', text: '🪟 Panel', web_app: { url: `${origin}/app` } } }),
    cmds: [await C(null, ['Main menu', 'My proxies', 'Profile', 'Support', 'Help']), await C('ru', ['Меню', 'Мои прокси', 'Профиль', 'Поддержка', 'Помощь']), await C('fa', ['منوی اصلی', 'پروکسی‌های من', 'پروفایل', 'پشتیبانی', 'راهنما'])],
  };
}

/* ---------- i18n (bot) ---------- */
const CREDIT = '@Lappeh';
// One click: opens Cloudflare's "create token" page with the right permissions already ticked.
const TOKEN_URL = 'https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%5D&accountId=*&zoneId=all&name=Bzgz';
const TOKEN_URL_H = TOKEN_URL.replace(/&/g, '&amp;');
const chName = (x) => (String(x.id).startsWith('@') ? x.id : esc(x.title || 'channel'));
const LANGS = { en: 'English', ru: 'Русский', fa: 'فارسی' };
const detect = (from) => { const c = String(from?.language_code || '').slice(0, 2); return c === 'fa' || c === 'ru' ? c : 'en'; };
const fmtDate = (t) => new Date(t).toISOString().slice(0, 10);
const T = {
  en: {
    welcome: (n) => `Hi <b>${n}</b> 👋\nCreate personal Telegram proxies on your own Cloudflare account — as many as you need, for you and your family.\n\nPick an option below 👇\n\n<i>Made by ${CREDIT}</i>`,
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
    joinedOk: '✅ You have joined — thank you! Everything is unlocked.', stOff: '⏸ Paused', limitErr: '⚠️ Limit reached: at most 30 proxies per user.',
  },
  ru: {
    welcome: (n) => `Привет, <b>${n}</b> 👋\nСоздавайте личные прокси для Telegram в своём аккаунте Cloudflare — сколько нужно, для себя и семьи.\n\nВыберите действие ниже 👇\n\n<i>Сделал ${CREDIT}</i>`,
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
    joinedOk: '✅ Вы подписались — спасибо! Всё разблокировано.', stOff: '⏸ Приостановлен', limitErr: '⚠️ Лимит: не более 30 прокси на пользователя.',
  },
  fa: {
    welcome: (n) => `سلام <b>${n}</b> 👋\nروی اکانت کلودفلر خودت هر تعداد پروکسی شخصی تلگرام بساز — برای خودت و خانواده.\n\nاز گزینه‌های زیر شروع کن 👇\n\n<i>ساخته‌شده توسط ${CREDIT}</i>`,
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
    joinedOk: '✅ شما جوین شدید — ممنون! همه‌چیز باز شد.', stOff: '⏸ متوقف', limitErr: '⚠️ سقف پر شد: حداکثر ۳۰ پروکسی برای هر کاربر.',
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
async function createProxies(env, origin, u, names, acc, token) {
  acc = await resolveAccount(token, acc);
  let sub;
  try { sub = (await cf(token, 'GET', `/accounts/${acc}/workers/subdomain`)).subdomain; } catch (e) { if (e.code !== 10007) throw e; }
  if (!sub) sub = (await cf(token, 'PUT', `/accounts/${acc}/workers/subdomain`, { subdomain: 'bz-' + rid(8) })).subdomain;
  const made = [];
  if (((await one(env, 'SELECT COUNT(*) n FROM proxies WHERE uid=?', u.id)).n || 0) + names.length > 30) throw new Error('limit');
  try {
    for (const name of names) {
      const id = 'tgp-' + rid(6), psec = hx(16), secret = rid(24), host = `${id}.${sub}.workers.dev`, link = `https://t.me/webproxy?server=${host}&secret=${psec}`;
      await deploy(token, acc, id, { MTSECRET: psec, PID: id, SECRET: secret, REPORT: origin + '/r' });
      await run(env, 'INSERT INTO proxies(id,uid,name,url,enter,secret,created) VALUES(?,?,?,?,?,?,?)', id, u.id, name, `https://${host}`, link, secret, Date.now());
      made.push({ id, name, enter: link });
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
const chOut = (c) => ({ id: c.id, title: c.title, url: c.url || '' });
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
    if (!r.ok) { await warnOwner(env, `⚠️ Forced join cannot check ${c.id}: ${r.description || 'error'}\nMake the bot an admin of that channel (/joininfo shows details).`, c.id); continue; }
    seen++;
    const st = r.result.status;
    if (!['member', 'administrator', 'creator'].includes(st) && !(st === 'restricted' && r.result.is_member)) out.push(c);
  }
  out.verified = seen === chs.length;
  if (!out.length && out.verified && !force) await run(env, 'UPDATE users SET jchk=? WHERE id=?', Date.now() + 60000, u.id);
  return out;
}
const joinKb = (L, chs) => ({ inline_keyboard: [...chs.filter((c) => c.url).map((c) => [{ text: tr(L, 'joinGo', c), url: c.url }]), [{ text: tr(L, 'joinBtn'), callback_data: 'chk' }]] });

/* ---------- screens ---------- */
const home = (L, o) => ({ inline_keyboard: [
  [{ text: tr(L, 'bNew'), callback_data: 'new' }],
  [{ text: tr(L, 'bList'), callback_data: 'list' }, { text: tr(L, 'bPanel'), web_app: { url: `${o}/app` } }],
  [{ text: tr(L, 'bProfile'), callback_data: 'profile' }, { text: tr(L, 'bSupport'), callback_data: 'sup' }],
  [{ text: tr(L, 'bLang'), callback_data: 'lang' }, { text: tr(L, 'bHelp'), callback_data: 'help' }],
] });
const back = (L, extra = []) => ({ inline_keyboard: [...extra, [{ text: tr(L, 'bBack'), callback_data: 'home' }]] });
const cancelKb = (L) => ({ inline_keyboard: [[{ text: tr(L, 'bCancel'), callback_data: 'cx' }]] });
const usageOf = (env, pid) => one(env, 'SELECT COALESCE(SUM(CASE WHEN day=? THEN req END),0) tr, COALESCE(SUM(CASE WHEN day=? THEN bytes END),0) tb, COALESCE(SUM(bytes),0) wb FROM usage WHERE pid=? AND day>=?', day(), day(), pid, ago(6));
async function proxyText(env, L, p) {
  const s = await usageOf(env, p.id), off = !!(await metaGet(env, 'off:' + p.id));
  return `📡 <b>${esc(p.name)}</b>\n\n🔗 <code>${esc(p.enter)}</code>\n${off ? tr(L, 'stOff') : p.fail >= 2 ? tr(L, 'stDown') : tr(L, 'stOk')}\n\n📊 ${tr(L, 'today')}: ${s.tr.toLocaleString('en')} ${tr(L, 'req')} · ${fmtB(s.tb)}\n📅 ${tr(L, 'week')}: ${fmtB(s.wb)}`;
}
const proxyKb = (L, p) => back(L, [[{ text: tr(L, 'bAdd'), url: p.enter }], [{ text: tr(L, 'bStats'), callback_data: 'px:' + p.id }, { text: tr(L, 'bRm'), callback_data: 'dl:' + p.id }]]);

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
const myProxies = (env, uid) => all(env, 'SELECT id,name,url,enter,created,fail,seen FROM proxies WHERE uid=? ORDER BY created', uid);

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
  if (token.length < 20) return void say(env, chat, tr(L, 'badCred'), cancelKb(L));
  if (await guard(env, u.id)) return void say(env, chat, tr(L, 'wait'));
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
    if (!chs.length) return void say(env, chat, '🔎 No channels configured yet. Use /addchannel @name');
    const me = (await tg(env, 'getMe', {})).result || {};
    let txt = `🔎 <b>Forced join</b>: ${(await lockOn(env)) ? '🔒 ON' : '🔓 OFF'}\nYour role: ${r} (owner/admins are exempt — use /testjoin or another account)\n`;
    for (const c of chs) {
      const b = await tg(env, 'getChatMember', { chat_id: c.id, user_id: me.id }), m = await tg(env, 'getChatMember', { chat_id: c.id, user_id: u.id });
      txt += `\n<b>${esc(c.id)}</b>\n• bot: ${b.ok ? b.result.status : '❌ ' + esc(b.description || '')}\n• you: ${m.ok ? m.result.status : '❌ ' + esc(m.description || '')}`;
    }
    return void say(env, chat, txt);
  }
  if (cmd === '/testjoin' && r !== 'user') { const mm = await missing(env, u, true); return void (mm.length ? say(env, chat, tr(L, 'joinTxt', mm), joinKb(L, mm)) : say(env, chat, '✅ You are a member of every required channel.')); }
  const miss = await missing(env, u);
  if (miss.length) { if (u.state?.startsWith('cred:')) await tg(env, 'deleteMessage', { chat_id: chat, message_id: m.message_id }); return void say(env, chat, tr(L, 'joinTxt', miss), joinKb(L, miss)); }

  if (cmd === '/cancel') { await run(env, 'UPDATE users SET state=NULL WHERE id=?', u.id); return void say(env, chat, tr(L, 'cancelled'), home(L, origin)); }
  if (cmd === '/new') { const v = await startNew(env, L, u); return void say(env, chat, v.text, v.kb); }
  if (u.state === 'names' && !t.startsWith('/')) {
    const names = cleanNames(t.split(/\n|,|،/));
    if (!names.length) return void say(env, chat, tr(L, 'newAsk'), cancelKb(L));
    await run(env, 'UPDATE users SET state=? WHERE id=?', 'cred:' + names.join('|'), u.id);
    return void say(env, chat, tr(L, 'credAsk'), cancelKb(L));
  }
  if (u.state?.startsWith('cred:') && !t.startsWith('/')) return void doBotCreate(env, origin, L, u, chat, m, t);

  if (cmd === '/profile') return void say(env, chat, tr(L, 'profile', u, (await myProxies(env, u.id)).length), home(L, origin));
  if (cmd === '/help') return void say(env, chat, tr(L, 'help'), back(L));
  if (cmd === '/proxies') { const v = await listView(env, L, u); return void say(env, chat, v.text, v.kb); }
  if (cmd === '/support') { await run(env, "UPDATE users SET state='ticket' WHERE id=?", u.id); return void say(env, chat, tr(L, 'supAsk')); }

  if (u.state?.startsWith('reply:') && r !== 'user' && !t.startsWith('/')) {
    await run(env, 'UPDATE users SET state=NULL WHERE id=?', u.id);
    return void say(env, chat, (await adminReply(env, origin, Number(u.state.slice(6)), t)) ? '✅ Sent.' : '⚠️ Ticket not found.');
  }
  if (u.state === 'ticket' && !t.startsWith('/')) { await run(env, 'UPDATE users SET state=NULL WHERE id=?', u.id); const id = await userMsg(env, u, t); return void say(env, chat, tr(L, 'supOk', id), back(L)); }

  if (r !== 'user') {
    const id = /^\d+$/.test(arg.split(' ')[0]) ? Number(arg.split(' ')[0]) : null;
    if (cmd === '/admin') { const s = await stats(env); return void say(env, chat, `🛠️ <b>Admin</b>\n\n👥 Users: <b>${s.users}</b> (+${s.newToday} today)\n📡 Proxies: ${s.proxies} (down: ${s.down})\n📊 Today: ${s.req.toLocaleString('en')} requests · ${fmtB(s.bytes)}\n🆘 Open tickets: ${s.tickets}\n\n/user id · /ban id · /unban id · /adduser id\n/broadcast text\n(owner) /addadmin id · /rmadmin id\n/addchannel @x (or -100id + invite link) · /rmchannel @x\n/lock on|off (forced join) · /testjoin · /joininfo`, { inline_keyboard: [[{ text: '🛠️ Admin panel', web_app: { url: `${origin}/app#admin` } }]] }); }
    if (cmd === '/user' && id) return void say(env, chat, await userCard(env, id));
    if (cmd === '/ban' && id) { await run(env, 'UPDATE users SET banned=1 WHERE id=?', id); return void say(env, chat, '⛔ Banned'); }
    if (cmd === '/unban' && id) { await run(env, 'UPDATE users SET banned=0 WHERE id=?', id); return void say(env, chat, '✅ Unbanned'); }
    if (cmd === '/adduser' && id) { await addUser(env, id); return void say(env, chat, '✅ Done'); }
    if (r === 'owner') {
      if (cmd === '/broadcast' && arg) { await metaSet(env, 'bc', JSON.stringify({ text: arg, cur: 0, sent: 0 })); return void say(env, chat, '📣 Queued (20 users every 5 min).'); }
      if (cmd === '/addadmin' && id) { await run(env, 'INSERT OR IGNORE INTO admins(id) VALUES(?)', id); return void say(env, chat, '✅ Admin added'); }
      if (cmd === '/rmadmin' && id) { await run(env, 'DELETE FROM admins WHERE id=?', id); return void say(env, chat, '✅ Admin removed'); }
      if (cmd === '/addchannel' && arg) {
        const [cid, link] = arg.split(/\s+/), e = await addChannel(env, cid, link);
        return void say(env, chat, e ? { badch: '⚠️ Use @channelname, or a numeric id like -1001234567890 followed by the invite link.', nochannel: '⚠️ Channel not found, or the bot is not an admin there. Make the bot an admin first, then run the command again.', nolink: '⚠️ Private channel: send the invite link after the id (https://t.me/+xxxx), or give the bot the “invite users” right.' }[e] : '✅ Forced join enabled');
      }
      if (cmd === '/rmchannel' && arg) { await run(env, 'DELETE FROM channels WHERE id=? COLLATE NOCASE', arg); await run(env, 'DELETE FROM meta WHERE k=?', 'cl' + arg); return void say(env, chat, '✅ Removed'); }
      if (cmd === '/lock') {
        if (arg === 'on' || arg === 'off') { await metaSet(env, 'fjoff', arg === 'off' ? '1' : '0'); await run(env, 'UPDATE users SET jchk=0'); }
        return void say(env, chat, (await lockOn(env)) ? '🔒 Forced join is <b>ON</b>. Non-members are blocked until they join.\n/lock off to disable.' : '🔓 Forced join is <b>OFF</b> (channels are kept).\n/lock on to enable.');
      }
    }
  }
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
  if (miss.length) { await tg(env, 'answerCallbackQuery', { callback_query_id: q.id, text: act === 'chk' ? tr(L, 'notYet') : undefined, show_alert: act === 'chk' }); return void edit(env, q, tr(L, 'joinTxt', miss), joinKb(L, miss)); }

  if (act === 'chk' && miss.verified) { toast = tr(L, 'joinedOk'); text = toast + '\n\n' + text; }
  const p = id ? await one(env, 'SELECT * FROM proxies WHERE id=? AND uid=?', id, u.id) : null;
  if (act === 'cx') await run(env, 'UPDATE users SET state=NULL WHERE id=?', u.id);
  else if (act === 'new') { const v = await startNew(env, L, u); text = v.text; kb = v.kb; }
  else if (act === 'profile') { text = tr(L, 'profile', u, (await myProxies(env, u.id)).length); kb = back(L); }
  else if (act === 'help') { text = tr(L, 'help'); kb = back(L); }
  else if (act === 'list') { const v = await listView(env, L, u); text = v.text; kb = v.kb; }
  else if (act === 'lang') { text = tr(L, 'langPick'); kb = { inline_keyboard: [Object.entries(LANGS).map(([k, n]) => ({ text: n, callback_data: 'sl:' + k })), [{ text: tr(L, 'bBack'), callback_data: 'home' }]] }; }
  else if (act === 'sl' && LANGS[id]) { await run(env, 'UPDATE users SET lang=? WHERE id=?', id, u.id); L = id; text = tr(L, 'welcome', esc(q.from.first_name)); kb = home(L, origin); }
  else if (act === 'sup') { await run(env, "UPDATE users SET state='ticket' WHERE id=?", u.id); text = tr(L, 'supAsk'); kb = back(L); }
  else if (act === 'tr' && r !== 'user') { await run(env, 'UPDATE users SET state=? WHERE id=?', 'reply:' + id, u.id); await tg(env, 'answerCallbackQuery', { callback_query_id: q.id }); return void say(env, q.message.chat.id, `✍️ Send your reply to ticket #${id}:`); }
  else if (act === 'tc' && r !== 'user') { await run(env, "UPDATE tickets SET status='closed' WHERE id=?", id); toast = 'Closed'; text = esc(q.message.text || '') + '\n\n✅ Closed'; kb = undefined; }
  else if (p && act === 'px') { text = await proxyText(env, L, p); kb = proxyKb(L, p); }
  else if (p && act === 'dl') { text = tr(L, 'rmAsk', p.name); kb = { inline_keyboard: [[{ text: tr(L, 'bYes'), callback_data: 'dy:' + p.id }, { text: tr(L, 'bNo'), callback_data: 'px:' + p.id }]] }; }
  else if (p && act === 'dy') { await env.DB.batch([bind(env, 'DELETE FROM proxies WHERE id=?', [p.id]), bind(env, 'DELETE FROM usage WHERE pid=?', [p.id]), bind(env, 'DELETE FROM meta WHERE k=?', ['off:' + p.id])]); const v = await listView(env, L, u); text = tr(L, 'rmDone') + '\n\n' + v.text; kb = v.kb; }
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
async function deploy(token, acc, id, vars) {
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ main_module: 'worker.js', compatibility_date: '2025-01-01', bindings: Object.entries(vars).map(([name, text]) => ({ type: 'plain_text', name, text })) })], { type: 'application/json' }));
  form.append('worker.js', new Blob([PROXY_CODE], { type: 'application/javascript+module' }), 'worker.js');
  await cf(token, 'PUT', `/accounts/${acc}/workers/scripts/${id}`, null, form);
  await cf(token, 'POST', `/accounts/${acc}/workers/scripts/${id}/subdomain`, { enabled: true, previews_enabled: false });
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
  if (d !== h || Date.now() / 1000 - Number(p.get('auth_date')) > 86400) return null;
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
  const joinErr = (miss) => J({ ok: false, error: 'join', channels: miss.map(chOut) }, 403);
  // Forced join is enforced on every API route except identity/settings/recheck, so the panel cannot bypass it.
  if (!isA && !['me', 'settings', 'chk'].includes(route)) { const miss = await missing(env, u); if (miss.length) return joinErr(miss); }
  const A = (o) => { if (!isA) throw Object.assign(new Error('forbidden'), { st: 403 }); return o; };
  const O = () => { if (r !== 'owner') throw Object.assign(new Error('forbidden'), { st: 403 }); };
  try {
    switch (route) {
      case 'me': return ok({ user: { id: u.id, name: u.name, joined: u.joined, notify: !!u.notify, lang: LANGS[u.lang] ? u.lang : 'en', role: r }, join: (await missing(env, u)).map(chOut) });
      case 'chk': { await run(env, 'UPDATE users SET jchk=0 WHERE id=?', u.id); const miss = await missing(env, { ...u, jchk: 0 }); return ok({ join: miss.map(chOut), joined: !miss.length && !!miss.verified }); }
      case 'proxies': {
        const ps = await myProxies(env, u.id), off = await offSet(env);
        const us = await all(env, 'SELECT pid, day, req, bytes FROM usage WHERE day>=? AND pid IN (SELECT id FROM proxies WHERE uid=?)', ago(6), u.id);
        return ok({ proxies: ps.map((p) => { const x = us.filter((s) => s.pid === p.id); const t = x.find((s) => s.day === day()); return { ...p, off: off.has(p.id), today: { req: t?.req || 0, bytes: t?.bytes || 0 }, week: x.reduce((a, s) => a + s.bytes, 0), spark: Array.from({ length: 7 }, (_, i) => x.find((s) => s.day === ago(6 - i))?.bytes || 0) }; }) });
      }
      case 'settings': if (b.notify !== undefined) await run(env, 'UPDATE users SET notify=? WHERE id=?', b.notify ? 1 : 0, u.id); if (LANGS[b.lang]) await run(env, 'UPDATE users SET lang=? WHERE id=?', b.lang, u.id); return ok();
      case 'create': {
        const names = cleanNames(Array.isArray(b.members) ? b.members : []);
        if (!names.length) return bad('names');
        if (await guard(env, u.id)) return bad('wait', 429);
        const made = await createProxies(env, origin, u, names, String(b.account || '').trim(), fixTok(b.token));
        return ok({ made }); // token goes out of scope here — nothing persisted
      }
      case 'rename': { const nm = cleanNames([b.name])[0]; if (!nm) return bad('names'); await run(env, 'UPDATE proxies SET name=? WHERE id=? AND uid=?', nm, b.id, u.id); return ok(); }
      case 'delete': {
        const p = await one(env, 'SELECT * FROM proxies WHERE id=? AND uid=?', b.id, u.id);
        if (!p) return bad('notfound', 404);
        if (b.token) { const token = fixTok(b.token); if (token.length < 20) return bad('creds'); const acc = await resolveAccount(token, String(b.account || '').trim()); await cf(token, 'DELETE', `/accounts/${acc}/workers/scripts/${p.id}?force=true`).catch((e) => { if (e.code !== 10007) throw e; }); } // 10007 = already gone
        await env.DB.batch([bind(env, 'DELETE FROM proxies WHERE id=?', [p.id]), bind(env, 'DELETE FROM usage WHERE pid=?', [p.id]), bind(env, 'DELETE FROM meta WHERE k=?', ['off:' + p.id])]);
        return ok();
      }
      case 'update': { // redeploy newest core; needs a one-time token
        const p = await one(env, 'SELECT * FROM proxies WHERE id=? AND uid=?', b.id, u.id);
        if (!p) return bad('notfound', 404);
        const token = fixTok(b.token); if (token.length < 20) return bad('creds'); const acc = await resolveAccount(token, String(b.account || '').trim());
        let psec = new URL(p.enter).searchParams.get('secret');
        let link = p.enter;
        if (!/^[0-9a-f]{32}$/.test(psec || '')) { psec = hx(16); link = `https://t.me/webproxy?server=${new URL(p.url).host}&secret=${psec}`; await run(env, 'UPDATE proxies SET enter=? WHERE id=?', link, p.id); }
        await deploy(token, acc, p.id, { MTSECRET: psec, PID: p.id, SECRET: p.secret, REPORT: origin + '/r' });
        await run(env, 'DELETE FROM meta WHERE k=?', 'off:' + p.id); // deploy() switches the workers.dev address back on
        return ok({ enter: link });
      }
      case 'rotate': { // brand-new secret → the old link stops working everywhere
        const p = await one(env, 'SELECT * FROM proxies WHERE id=? AND uid=?', b.id, u.id);
        if (!p) return bad('notfound', 404);
        const token = fixTok(b.token); if (token.length < 20) return bad('creds'); const acc = await resolveAccount(token, String(b.account || '').trim());
        const psec = hx(16), link = `https://t.me/webproxy?server=${new URL(p.url).host}&secret=${psec}`;
        await deploy(token, acc, p.id, { MTSECRET: psec, PID: p.id, SECRET: p.secret, REPORT: origin + '/r' });
        await run(env, 'UPDATE proxies SET enter=?, fail=0 WHERE id=?', link, p.id);
        await run(env, 'DELETE FROM meta WHERE k=?', 'off:' + p.id);
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
