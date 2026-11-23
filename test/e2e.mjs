// End-to-end test for the proxy core. Usage: node --no-warnings e2e.mjs <core file> [v3]
// Simulates: Telegram client -> bridge page (real script served by the worker) -> worker -> Telegram upstream.
// Crypto on the client/upstream sides uses node:crypto streaming AES-CTR (independent of the core's WebCrypto code).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const file = process.argv[2], V4 = process.argv[3] !== 'v3';
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'core-')), 'core.mjs');
fs.copyFileSync(file, tmp);

/* ---- minimal Workers runtime ---- */
const R0 = globalThis.Response;
globalThis.Response = class extends R0 {
  constructor(b, i) { if (i && i.status === 101) { super(null, { status: 200, headers: i.headers }); this.webSocket = i.webSocket; this.is101 = true; } else super(b, i); }
  get status() { return this.is101 ? 101 : super.status; }
};
class MS extends EventTarget {
  constructor() { super(); this.peer = null; this.closed = false; }
  accept() {}
  send(d) { if (this.closed) throw new Error('closed'); const peer = this.peer, data = d instanceof Uint8Array ? d.slice().buffer : d; setTimeout(() => { if (!peer.closed) peer.dispatchEvent(Object.assign(new Event('message'), { data })); }, 0); }
  close() { if (this.closed) return; this.closed = true; const peer = this.peer; setTimeout(() => { peer.closed = true; peer.dispatchEvent(new Event('close')); this.dispatchEvent(new Event('close')); }, 0); }
}
const pair = () => { const a = new MS(), b = new MS(); a.peer = b; b.peer = a; return [a, b]; };
globalThis.WebSocketPair = function () { const [a, b] = pair(); this[0] = a; this[1] = b; };

/* ---- fake Telegram upstream (independent implementation with node:crypto) ---- */
const sha = (b) => crypto.createHash('sha256').update(b).digest();
const ups = [];
globalThis.fetch = async (url) => {
  const m = String(url).match(/^https:\/\/kws(\d)(-1)?\.web\.telegram\.org\/apiws$/);
  if (!m) throw new Error('no network: ' + url);
  const [a, b] = pair();
  const up = { dc: Number(m[1]), media: !!m[2], got: Buffer.alloc(0), tag: null, closed: false, sock: b, started: false, buf: Buffer.alloc(0) };
  b.addEventListener('message', (ev) => {
    up.buf = Buffer.concat([up.buf, Buffer.from(ev.data)]);
    if (!up.started) {
      if (up.buf.length < 64) return;
      const init = up.buf.subarray(0, 64); up.buf = up.buf.subarray(64); up.started = true;
      up.dec = crypto.createDecipheriv('aes-256-ctr', init.subarray(8, 40), init.subarray(40, 56));
      const rev = Buffer.from(init.subarray(8, 56)).reverse();
      up.enc = crypto.createCipheriv('aes-256-ctr', rev.subarray(0, 32), rev.subarray(32, 48));
      const d = up.dec.update(init); up.tag = d.subarray(56, 60).toString('hex'); up.dcRaw = d.readInt16LE(60);
    }
    if (up.buf.length) { up.got = Buffer.concat([up.got, up.dec.update(up.buf)]); up.buf = Buffer.alloc(0); }
  });
  b.addEventListener('close', () => { up.closed = true; });
  up.send = (plain) => b.send(up.enc.update(plain));
  up.close = () => b.close();
  ups.push(up);
  return { webSocket: a, status: 101 };
};

const mod = await import(pathToFileURL(tmp).href);
const worker = mod.default, ctx = { waitUntil() {} };
const BASE = 'https://worker.test';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (cond, ms = 4000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timeout waiting for condition'); await sleep(4); } };

/* ---- fake Telegram app + bridge ---- */
class App {
  constructor() { this.buf = Buffer.alloc(0); this.frames = []; this.ctls = []; this.autoAck = true; this.P = { postMessage: (x) => this.recv(x), onmessage: null }; }
  recv(x) {
    if (typeof x === 'string') { this.ctls.push(JSON.parse(x)); return; }
    const u = x instanceof ArrayBuffer ? new Uint8Array(x) : new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    this.buf = Buffer.concat([this.buf, Buffer.from(u)]);
    while (this.buf.length >= 8) {
      const n = this.buf.readUInt32BE(4); if (this.buf.length < 8 + n) break;
      const f = { t: this.buf[0], id: this.buf.readUIntBE(1, 3), pl: Buffer.from(this.buf.subarray(8, 8 + n)) };
      this.buf = this.buf.subarray(8 + n); this.frames.push(f);
      if (f.t === 2 && this.autoAck) this.send(4, f.id, u32(f.pl.length));
    }
  }
  send(t, id, pl = Buffer.alloc(0)) { const b = Buffer.alloc(8 + pl.length); b[0] = t; b.writeUIntBE(id, 1, 3); b.writeUInt32BE(pl.length, 4); pl.copy(b, 8); this.P.onmessage(new Uint8Array(b)); }
  data(id) { return Buffer.concat(this.frames.filter((f) => f.t === 2 && f.id === id).map((f) => f.pl)); }
  acked(id) { return this.frames.filter((f) => f.t === 4 && f.id === id).reduce((a, f) => a + f.pl.readUInt32BE(0), 0); }
  closed(id) { return this.frames.some((f) => f.t === 3 && f.id === id); }
}
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };

async function boot(secretHex, extraEnv = {}, ip = '1.1.1.1') {
  const env = { MTSECRET: secretHex, ...extraEnv };
  const S = Buffer.from(secretHex, 'hex');
  const cap = crypto.createHmac('sha256', S).update('tdesktop-web-proxy-bridge-v1\nworker.test').digest('base64url');
  const r = await worker.fetch(new Request(`${BASE}/?bridge=${cap}`), env, ctx);
  if (r.status !== 200) throw new Error('bridge page status ' + r.status);
  const page = await r.text();
  const script = page.match(/<script nonce="[^"]+">([\s\S]*)<\/script>/)[1];
  const app = new App(), timers = [];
  class BW {
    constructor(url, protos) {
      this.binaryType = 'arraybuffer';
      worker.fetch(new Request(BASE + '/api/v1/ws', { headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': protos[0], 'cf-connecting-ip': ip } }), env, ctx).then((resp) => {
        if (!resp.webSocket) { this.onerror && this.onerror(); this.onclose && this.onclose(); return; }
        this.s = resp.webSocket;
        this.s.addEventListener('message', (e) => this.onmessage && this.onmessage({ data: e.data }));
        this.s.addEventListener('close', () => this.onclose && this.onclose());
        setTimeout(() => this.onopen && this.onopen(), 0);
      });
    }
    send(d) { this.s.send(d); }
    close() { this.s && this.s.close(); }
  }
  const wfetch = (p, init = {}) => worker.fetch(new Request(BASE + p, { method: init.method, headers: init.headers, body: init.body }), env, ctx);
  const location = { hash: '#android=' + 'A'.repeat(43), host: 'worker.test', hostname: 'worker.test' };
  new Function('window', 'location', 'history', 'fetch', 'WebSocket', 'setInterval', script)({ TelegramWebProxy: app.P }, location, { replaceState() {} }, wfetch, BW, (f, ms) => { const t = setInterval(f, ms); t.unref(); timers.push(t); return t; });
  await waitFor(() => app.ctls.some((c) => c.t === 'tproxy-android-init'));
  app.send(16, 0, Buffer.from([1]));
  await waitFor(() => app.frames.some((f) => f.t === 0x11));
  return { app, env, S16: S.length === 17 ? S.subarray(1) : S, stop: () => timers.forEach(clearInterval) };
}

/* ---- fake Telegram client crypto ---- */
const BAD = new Set([0x44414548, 0x54534f50, 0x20544547, 0x4954504f, 0xdddddddd, 0xeeeeeeee, 0x02010316]);
function clientInit(S16, tagHex, dcRaw) {
  let init;
  for (;;) { init = crypto.randomBytes(64); if (init[0] === 0xef || BAD.has(init.readUInt32LE(0)) || init.readUInt32LE(4) === 0) continue; break; }
  Buffer.from(tagHex, 'hex').copy(init, 56); init.writeInt16LE(dcRaw, 60);
  const enc = crypto.createCipheriv('aes-256-ctr', sha(Buffer.concat([init.subarray(8, 40), S16])), init.subarray(40, 56));
  const rev = Buffer.from(init.subarray(8, 56)).reverse();
  const dec = crypto.createDecipheriv('aes-256-ctr', sha(Buffer.concat([rev.subarray(0, 32), S16])), rev.subarray(32, 48));
  const e = enc.update(init);
  return { wire: Buffer.concat([init.subarray(0, 56), e.subarray(56, 64)]), enc, dec };
}
function packet(tag, payload) {
  if (tag === 'efefefef') { const w = payload.length / 4; return w < 0x7f ? Buffer.concat([Buffer.from([w]), payload]) : Buffer.concat([Buffer.from([0x7f, w & 255, (w >> 8) & 255, (w >> 16) & 255]), payload]); }
  const h = Buffer.alloc(4); h.writeUInt32LE(payload.length); return Buffer.concat([h, payload]);
}
function sendSplit(app, id, buf, maxPiece = 1 << 30) { // DATA frames of random sizes
  let o = 0; while (o < buf.length) { const n = Math.min(buf.length - o, 1 + Math.floor(Math.random() * Math.min(maxPiece, 70000))); app.send(2, id, buf.subarray(o, o + n)); o += n; }
}

/* ---- tests ---- */
const tests = [];
const test = (name, fn, only4 = false) => tests.push({ name, fn, only4 });
const eq = (a, b, msg) => { if (!Buffer.from(a).equals(Buffer.from(b))) throw new Error(msg || 'buffers differ'); };
const ok = (c, msg) => { if (!c) throw new Error(msg); };
const HEX = () => crypto.randomBytes(16).toString('hex');

async function session1({ tag, dc, secret = HEX(), n = 3, sizes = [40, 400, 3000], split = false, piece = 7, id = 1 }) {
  const c = await boot(secret), { app } = c, before = ups.length;
  const ci = clientInit(c.S16, tag, dc);
  app.send(1, id);
  const pkts = sizes.map((s) => packet(tag, crypto.randomBytes(s)));
  const plain = Buffer.concat(pkts);
  const stream = Buffer.concat([ci.wire, ci.enc.update(plain)]);
  if (split) sendSplit(app, id, stream, piece); else { app.send(2, id, stream.subarray(0, 64)); app.send(2, id, stream.subarray(64)); }
  await waitFor(() => ups.length > before && ups[before].got.length >= plain.length);
  const up = ups[before];
  eq(up.got, plain, 'upstream plaintext mismatch');
  ok(up.tag === tag, 'tag mismatch');
  ok(up.dcRaw === dc, 'dc mismatch');
  await waitFor(() => app.acked(id) === stream.length);
  const reply = crypto.randomBytes(1234);
  up.send(reply);
  await waitFor(() => app.data(id).length >= reply.length);
  eq(ci.dec.update(app.data(id)), reply, 'downstream plaintext mismatch');
  return { c, up, ci, app };
}

test('abridged, dc2, init and packets in separate frames', async () => { const r = await session1({ tag: 'efefefef', dc: 2 }); ok(r.up.dc === 2 && !r.up.media, 'wrong upstream host'); r.c.stop(); });
test('intermediate, media dc (-3) uses kws3-1', async () => { const r = await session1({ tag: 'eeeeeeee', dc: -3 }); ok(r.up.dc === 3 && r.up.media, 'wrong upstream host'); r.c.stop(); });
test('padded intermediate, byte-by-byte-ish fragmentation', async () => { const r = await session1({ tag: 'dddddddd', dc: 4, split: true, sizes: [33, 517, 2048] }); r.c.stop(); });
test('abridged long-length packet (>508 bytes)', async () => { const r = await session1({ tag: 'efefefef', dc: 1, sizes: [4000, 120000] }); r.c.stop(); });
test('secret with dd prefix', async () => { const r = await session1({ tag: 'dddddddd', dc: 5, secret: 'dd' + HEX() }); r.c.stop(); });
test('1 MB packet', async () => { const r = await session1({ tag: 'eeeeeeee', dc: 2, sizes: [1048576], split: true, piece: 60000 }); r.c.stop(); });

test('downstream 6 MB with flow control', async () => {
  const c = await boot(HEX()), { app } = c, before = ups.length; app.autoAck = false;
  const ci = clientInit(c.S16, 'eeeeeeee', 2); app.send(1, 1);
  app.send(2, 1, Buffer.concat([ci.wire, ci.enc.update(packet('eeeeeeee', crypto.randomBytes(16)))])); await waitFor(() => ups.length > before && ups[before].started);
  const up = ups[before], big = crypto.randomBytes(6 * 1048576);
  for (let o = 0; o < big.length; o += 90000) up.send(big.subarray(o, o + 90000));
  await sleep(500);
  const got1 = app.data(1).length;
  ok(got1 > 0 && got1 <= 4194304, 'sent beyond credit: ' + got1);
  ok(app.frames.every((f) => f.pl.length <= 65536), 'frame >64KB');
  app.autoAck = true;
  app.send(4, 1, u32(got1));
  await waitFor(() => app.data(1).length >= big.length, 20000);
  eq(ci.dec.update(app.data(1)), big, 'downstream data mismatch (flow control)');
  c.stop();
});
test('upstream closes -> client gets CLOSE', async () => { const r = await session1({ tag: 'efefefef', dc: 2 }); r.up.close(); await waitFor(() => r.app.closed(1)); r.c.stop(); });
test('client closes -> upstream closed', async () => { const r = await session1({ tag: 'efefefef', dc: 2 }); r.app.send(3, 1); await waitFor(() => r.up.closed); r.c.stop(); });
test('two concurrent lanes do not mix', async () => {
  const c = await boot(HEX()), { app } = c, before = ups.length;
  const A = clientInit(c.S16, 'efefefef', 2), B = clientInit(c.S16, 'eeeeeeee', 4);
  app.send(1, 1); app.send(1, 2);
  const pa = packet('efefefef', crypto.randomBytes(100)), pb = packet('eeeeeeee', crypto.randomBytes(300));
  app.send(2, 1, Buffer.concat([A.wire, A.enc.update(pa)])); app.send(2, 2, Buffer.concat([B.wire, B.enc.update(pb)]));
  await waitFor(() => ups.length >= before + 2 && ups.slice(before).every((u) => u.got.length));
  const [u1, u2] = ups.slice(before).sort((x, y) => x.dc - y.dc);
  eq(u1.got, pa); eq(u2.got, pb); ok(u1.dc === 2 && u2.dc === 4, 'dc routing');
  const ra = crypto.randomBytes(64), rb = crypto.randomBytes(64);
  u1.send(ra); u2.send(rb);
  await waitFor(() => app.data(1).length >= 64 && app.data(2).length >= 64);
  eq(A.dec.update(app.data(1)), ra); eq(B.dec.update(app.data(2)), rb);
  c.stop();
});
test('wrong tag in init -> lane closed, no upstream', async () => {
  const c = await boot(HEX()), { app } = c, before = ups.length;
  app.send(1, 1); app.send(2, 1, crypto.randomBytes(64));
  await waitFor(() => app.closed(1)); ok(ups.length === before, 'upstream was dialed'); c.stop();
});
test('init made with a different secret -> rejected', async () => {
  const c = await boot(HEX()), { app } = c, before = ups.length;
  const ci = clientInit(crypto.randomBytes(16), 'efefefef', 2);
  app.send(1, 1); app.send(2, 1, ci.wire);
  await waitFor(() => app.closed(1)); ok(ups.length === before, 'upstream was dialed'); c.stop();
});

/* ---- probe-resistance and limits (v4 only) ---- */
test('probes get the decoy; /health only for the owner', async () => {
  const env = { MTSECRET: HEX(), SECRET: 'owner-secret' };
  const get = async (p, h = {}, host = 'worker.test') => worker.fetch(new Request(`https://${host}${p}`, { headers: h }), env, ctx);
  let r = await get('/health'); ok(r.status === 404 && (await r.text()).includes('lang="fa"'), '/health must look like the decoy');
  r = await get('/health', { 'x-k': 'wrong' }); ok(r.status === 404, 'wrong key accepted');
  r = await get('/health', { 'x-k': 'owner-secret' }); ok(r.status === 200 && (await r.json()).ok === true, 'owner health failed');
  r = await get('/'); ok(r.status === 200 && (await r.text()).includes('<article>'), 'decoy home');
  r = await get('/posts/1'); ok(r.status === 200, 'decoy post');
  r = await get('/nope'); ok(r.status === 404, 'decoy 404');
  r = await get('/?bridge=bad'); ok((await r.text()).includes('<article>'), 'bad bridge cap must show decoy');
  r = await get('/api/v1/ws'); ok(r.status === 404, 'ws without upgrade');
  r = await worker.fetch(new Request('https://worker.test/api/v1/session', { method: 'POST', headers: { authorization: 'Bearer x' }, body: new Uint8Array(9) }), env, ctx); ok(r.status === 404, 'bad bearer');
  const names = new Set(); for (let i = 0; i < 12; i++) names.add((await (await get('/', {}, `h${i}.workers.dev`)).text()).match(/<title>(.*?)<\/title>/)[1]);
  const pages = new Set(); for (let i = 0; i < 12; i++) pages.add(await (await get('/', {}, `h${i}.workers.dev`)).text());
  ok(pages.size >= 10, 'decoys are not different per host: ' + pages.size);
  r = await worker.fetch(new Request('https://worker.test/', {}), { SECRET: 'x' }, ctx); ok(r.status === 200, 'no MTSECRET -> decoy home');
}, true);
test('GEO allow-list', async () => {
  const S = HEX(); const cap = crypto.createHmac('sha256', Buffer.from(S, 'hex')).update('tdesktop-web-proxy-bridge-v1\nworker.test').digest('base64url');
  const q = (country, env) => worker.fetch(new Request(`${BASE}/?bridge=${cap}`, { headers: country ? { 'cf-ipcountry': country } : {} }), { MTSECRET: S, ...env }, ctx).then((r) => r.text());
  ok((await q('IR', { GEO: 'IR,DE' })).includes('<script'), 'IR should pass');
  ok(!(await q('US', { GEO: 'IR,DE' })).includes('<script'), 'US should be blocked');
  ok((await q('US', {})).includes('<script'), 'no GEO = everyone');
}, true);
test('per-IP lane cap', async () => {
  const c = await boot(HEX(), { LANES_PER_IP: '2' }, '9.9.9.9'), { app } = c;
  app.send(1, 1); app.send(1, 2); await sleep(60);
  ok(!app.ctls.some((x) => x.t === 'close'), 'first two lanes must be accepted');
  app.send(1, 3); await waitFor(() => app.ctls.some((x) => x.t === 'close')); c.stop();
}, true);

let fail = 0;
for (const t of tests) {
  if (t.only4 && !V4) { console.log('SKIP', t.name); continue; }
  try { await Promise.race([t.fn(), sleep(25000).then(() => { throw new Error('test timeout'); })]); console.log('PASS', t.name); }
  catch (e) { fail++; console.log('FAIL', t.name, '->', e.message); }
}
console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
process.exit(fail ? 1 : 0);
