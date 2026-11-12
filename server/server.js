'use strict';
// Локальний сервер гри «Феод». Без залежностей — потрібен лише Node.js 18+.
// Запуск: node server/server.js   (або start-server.bat)
// Змінні середовища: PORT (3000), HOST (127.0.0.1), SPEED (1), SAVE (шлях до збереження)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Game } = require('./game');

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const SPEED = +process.env.SPEED || 1;
const ROOT = path.join(__dirname, '..');
const SAVE = process.env.SAVE || path.join(ROOT, 'data', 'save.json');

// ---------- Завантаження світу ----------
let game;
try {
  if (fs.existsSync(SAVE)) {
    game = new Game(JSON.parse(fs.readFileSync(SAVE, 'utf8')), { speed: SPEED });
    console.log('Світ завантажено зі збереження:', SAVE);
  }
} catch (e) {
  console.error('Не вдалося прочитати збереження, створюю новий світ:', e.message);
  try { fs.copyFileSync(SAVE, SAVE + '.broken-' + Date.now()); } catch (_) { /* ignore */ }
}
if (!game) { game = new Game(null, { speed: SPEED }); console.log('Створено новий світ, seed', game.w.seed); }

function save() {
  try {
    fs.mkdirSync(path.dirname(SAVE), { recursive: true });
    const tmp = SAVE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(game.toJSON()));
    fs.renameSync(tmp, SAVE);
  } catch (e) { console.error('Помилка збереження:', e.message); }
}

// ---------- Сесії ----------
const tokens = new Map(); // token -> playerId
const streams = new Map(); // res -> playerId

function playerByToken(t) { const id = tokens.get(t); return id && game.w.players[id]; }

// ---------- Статичні файли ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveStatic(req, res, urlPath) {
  let file;
  if (urlPath === '/defs.js') file = path.join(ROOT, 'shared', 'defs.js');
  else {
    const rel = path.normalize(decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath)).replace(/^([/\\])+/, '');
    file = path.join(ROOT, 'public', rel);
    if (!file.startsWith(path.join(ROOT, 'public'))) { res.writeHead(403); return res.end(); }
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (_) { resolve({}); } });
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// ---------- HTTP ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/api/login') {
    const body = await readBody(req);
    const r = game.login(body.acc, body.key, body.name);
    if (r.error) return json(res, 403, { error: r.error });
    const token = crypto.randomBytes(16).toString('hex');
    tokens.set(token, r.player.id);
    save();
    return json(res, 200, { token, id: r.player.id });
  }
  if (req.method === 'POST' && url.pathname === '/api/action') {
    const body = await readBody(req);
    const p = playerByToken(body.token);
    if (!p) return json(res, 401, { error: 'Сесія завершилась, перезавантажте сторінку' });
    const r = game.action(p, body.a || {});
    if (r.ok) pushTo(p.id);
    return json(res, 200, r);
  }
  if (req.method === 'GET' && url.pathname === '/api/stream') {
    const p = playerByToken(url.searchParams.get('token'));
    if (!p) { res.writeHead(401); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    streams.set(res, { pid: p.id, ownVer: -1, terrainVer: game.terrainVer });
    game.online[p.id] = (game.online[p.id] || 0) + 1;
    if (game.online[p.id] === 1) game.sys(`${p.name} увійшов(-ла) в гру.`);
    send(res, 'init', { you: p.id, terrain: Array.from(game.w.terrain) });
    pushOne(res);
    req.on('close', () => {
      streams.delete(res);
      game.online[p.id] = Math.max(0, (game.online[p.id] || 1) - 1);
      if (!game.online[p.id]) game.sys(`${p.name} вийшов(-ла) з гри.`);
    });
    return;
  }
  if (req.method === 'GET') return serveStatic(req, res, url.pathname);
  res.writeHead(405); res.end();
});

function send(res, ev, data) { res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`); }
function pushOne(res) {
  const s = streams.get(res);
  const p = s && game.w.players[s.pid];
  if (!p) return;
  const snap = game.snapshot(p);
  if (s.ownVer !== game.w.ownVer) { snap.own = Array.from(game.own); s.ownVer = game.w.ownVer; }
  if (s.terrainVer !== game.terrainVer) { snap.terrain = Array.from(game.w.terrain); s.terrainVer = game.terrainVer; }
  send(res, 'tick', snap);
}
function pushTo(pid) { for (const [res, s] of streams) if (s.pid === pid) pushOne(res); }
function pushAll() { for (const res of streams.keys()) pushOne(res); }

// ---------- Ігровий цикл ----------
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(5, (now - last) / 1000);
  last = now;
  game.tick(dt);
  pushAll();
}, 1000);
setInterval(save, 15000);

function shutdown() { console.log('\nЗберігаю світ...'); save(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ⚜  Феод — сервер запущено');
  console.log(`  Адреса для гравців: http://localhost:${PORT}`);
  console.log('  Кожен гравець запускає play.bat у своєму сеансі віддаленого робочого столу.');
  console.log('  Щоб зупинити й зберегти — закрийте це вікно або натисніть Ctrl+C.');
  console.log('');
});
