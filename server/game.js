'use strict';
// Ігрова логіка: світ, симуляція сіл, рейди, ринок, події.
const crypto = require('crypto');
const D = require('../shared/defs');

const W = D.MAP_W, H = D.MAP_H, T = D.T, B = D.B;

// ---------- Генерація карти ----------
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function valueNoise(rand, cell) {
  const gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2;
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = sm(fx - x0), ty = sm(fy - y0);
    const a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1], c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x0 + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
}
function fbm(rand, c1, c2, c3) {
  const a = valueNoise(rand, c1), b = valueNoise(rand, c2), c = valueNoise(rand, c3);
  return (x, y) => a(x, y) * 0.5 + b(x, y) * 0.32 + c(x, y) * 0.18;
}
function threshold(values, frac) { // значення, вище якого лежить frac частка
  const s = Array.from(values).sort((p, q) => p - q);
  return s[Math.min(s.length - 1, Math.floor(s.length * (1 - frac)))];
}

function generateMap(seed) {
  const rand = rng(seed);
  const elev = fbm(rand, 14, 7, 3), moist = fbm(rand, 9, 5, 2.5), oreN = valueNoise(rand, 3);
  const N = W * H;
  const e = new Float32Array(N), m = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // краї карти трохи нижчі — щоб утворювались озера/узбережжя
    const dx = Math.min(x, W - 1 - x) / 6, dy = Math.min(y, H - 1 - y) / 6;
    const edge = Math.min(1, Math.min(dx, dy));
    e[y * W + x] = elev(x, y) * (0.75 + 0.25 * edge);
    m[y * W + x] = moist(x, y);
  }
  const ter = new Uint8Array(N).fill(T.GRASS);
  const tHill = threshold(e, 0.11);
  // найнижчі 14% — вода, ще 4% — піщаний берег
  const lowW = threshold(e.map(v => -v), 0.14), lowS = threshold(e.map(v => -v), 0.18);
  const rest = [];
  for (let i = 0; i < N; i++) {
    if (-e[i] >= lowW) ter[i] = T.WATER;
    else if (-e[i] >= lowS) ter[i] = T.SAND;
    else if (e[i] >= tHill) ter[i] = T.HILL;
    else rest.push(i);
  }
  const restM = rest.map(i => m[i]);
  const tForest = threshold(restM, 0.32), tFert = threshold(restM, 0.5);
  for (const i of rest) {
    if (m[i] >= tForest) ter[i] = T.FOREST;
    else if (m[i] >= tFert) ter[i] = T.FERTILE;
  }
  for (let i = 0; i < N; i++) {
    if (ter[i] === T.HILL && oreN(i % W, Math.floor(i / W)) > 0.62) ter[i] = T.ORE;
  }
  return ter;
}

function countNear(ter, x, y, r, types) {
  let n = 0;
  for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    if (types.includes(ter[yy * W + xx])) n++;
  }
  return n;
}

function findSpawns(ter) {
  const cands = [];
  for (let y = 8; y < H - 8; y++) for (let x = 8; x < W - 8; x++) {
    const t = ter[y * W + x];
    if (t !== T.GRASS && t !== T.FERTILE) continue;
    const forest = countNear(ter, x, y, 6, [T.FOREST]);
    const hill = countNear(ter, x, y, 7, [T.HILL, T.ORE]);
    const water = countNear(ter, x, y, 7, [T.WATER]);
    const ore = countNear(ter, x, y, 12, [T.ORE]);
    const build = countNear(ter, x, y, 3, [T.GRASS, T.FERTILE, T.SAND]);
    if (forest < 6 || hill < 2 || water < 2 || ore < 1 || build < 24) continue;
    const score = Math.min(forest, 30) + Math.min(hill, 12) * 2 + Math.min(water, 12) + build;
    cands.push({ x, y, score });
  }
  cands.sort((a, b) => b.score - a.score);
  const spots = [];
  for (const c of cands) {
    if (spots.every(s => Math.hypot(s.x - c.x, s.y - c.y) >= 18)) spots.push({ x: c.x, y: c.y });
    if (spots.length >= 8) break;
  }
  return spots;
}

// ---------- Світ ----------
class Game {
  constructor(saved, opts = {}) {
    this.speed = opts.speed || 1;
    this.terrainVer = 1;
    if (saved) {
      Object.assign(this, { w: saved });
      this.w.terrain = Uint8Array.from(saved.terrain);
    } else {
      this.w = this.newWorld(opts.seed || (Date.now() & 0xffffff));
    }
    this.reindex();
  }

  newWorld(seed) {
    let ter, spots, s = seed;
    for (let tries = 0; tries < 40; tries++) {
      ter = generateMap(s);
      spots = findSpawns(ter);
      if (spots.length >= 6) break;
      s++;
    }
    const market = {};
    for (const r of D.MARKET_RES) market[r] = 1;
    return {
      seed: s, time: 0, terrain: ter, spots, players: {}, buildings: {}, nextId: 1,
      armies: [], offers: [], chat: [], chatId: 1, effects: [], market,
      nextEvent: 360, ownVer: 1,
    };
  }

  // Службові індекси (не зберігаються)
  reindex() {
    this.grid = new Int32Array(W * H);
    for (const id in this.w.buildings) {
      const b = this.w.buildings[id];
      this.grid[b.y * W + b.x] = b.id;
    }
    this.online = this.online || {};
    this.recomputeOwnership();
  }

  toJSON() {
    return Object.assign({}, this.w, { terrain: Array.from(this.w.terrain) });
  }

  // ---------- Гравці ----------
  playersList() { return Object.values(this.w.players).sort((a, b) => a.n - b.n); }

  login(acc, key, name) {
    acc = String(acc || '').trim().slice(0, 64);
    if (!acc) return { error: 'Не вказано обліковий запис' };
    let p = Object.values(this.w.players).find(x => x.acc.toLowerCase() === acc.toLowerCase());
    if (p) {
      if (p.key && p.key !== key) return { error: 'Цей профіль захищено ключем облікового запису Windows. Запустіть гру через play.bat зі свого облікового запису.' };
      if (!p.key && key) p.key = key;
      return { player: p };
    }
    const spot = this.pickSpot();
    if (!spot) return { error: 'На карті не лишилося місця для нового села' };
    const n = this.playersList().length + 1;
    const id = 'p' + n + '_' + crypto.randomBytes(3).toString('hex');
    const res = {};
    for (const r of D.RES_ORDER) res[r] = 0;
    Object.assign(res, { gold: 120, wood: 80, stone: 20, grain: 60, fish: 10 });
    p = {
      id, n, acc, key: key || '', name: (name || acc).slice(0, 24), color: D.PLAYER_COLORS[(n - 1) % D.PLAYER_COLORS.length],
      joined: this.w.time, res, pop: 5, happy: 60, tax: 'normal', techs: [], units: { militia: 0, swordsman: 0, archer: 0 },
      hallId: 0, growT: 0, leaveT: 0, starveT: 0, desertT: 0, shieldUntil: this.w.time + D.NEWBIE_SHIELD,
      log: [], stats: { raidsWon: 0, raidsLost: 0, defended: 0 }, rates: {}, starving: false,
    };
    this.w.players[id] = p;
    const hall = this.addBuilding(p, 'hall', spot.x, spot.y, true);
    p.hallId = hall.id;
    // стартова хата та поле
    const near = this.freeTilesAround(spot.x, spot.y, 2);
    const h = near.find(t => t.y !== spot.y - 1 && [T.GRASS, T.FERTILE, T.SAND].includes(this.ter(t.x, t.y)));
    if (h) this.addBuilding(p, 'house', h.x, h.y, true);
    const f = this.freeTilesAround(spot.x, spot.y, 3).find(t => [T.FERTILE, T.GRASS].includes(this.ter(t.x, t.y)));
    if (f) { const fb = this.addBuilding(p, 'farm', f.x, f.y, true); fb.workers = 2; }
    this.recomputeOwnership();
    this.log(p, 'Ласкаво просимо, пане! Ваше село засноване. Перші 30 хв ваше село під захистом від нападів.');
    this.sys(`${p.name} заснував(-ла) нове село.`);
    return { player: p };
  }

  pickSpot() {
    const halls = this.playersList().map(p => this.w.buildings[p.hallId]).filter(Boolean);
    let best = null, bestD = -1;
    for (const s of this.w.spots) {
      if (this.grid[s.y * W + s.x]) continue;
      const d = halls.length ? Math.min(...halls.map(h => Math.hypot(h.x - s.x, h.y - s.y))) : 999;
      if (d < 14) continue;
      if (d > bestD) { bestD = d; best = s; }
    }
    return best;
  }

  freeTilesAround(x, y, r) {
    const out = [];
    for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || (xx === x && yy === y)) continue;
      if (!this.grid[yy * W + xx]) out.push({ x: xx, y: yy, d: Math.hypot(xx - x, yy - y) });
    }
    return out.sort((a, b) => a.d - b.d);
  }

  ter(x, y) { return this.w.terrain[y * W + x]; }

  recomputeOwnership() {
    const own = new Uint8Array(W * H);
    for (const p of this.playersList()) {
      const h = this.w.buildings[p.hallId];
      if (!h) continue;
      const r = D.hallRadius(h.level);
      for (let y = h.y - r; y <= h.y + r; y++) for (let x = h.x - r; x <= h.x + r; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (Math.hypot(x - h.x, y - h.y) > r + 0.3) continue;
        if (!own[y * W + x]) own[y * W + x] = p.n;
      }
    }
    for (const id in this.w.buildings) {
      const b = this.w.buildings[id];
      const p = this.w.players[b.owner];
      if (p) own[b.y * W + b.x] = p.n;
    }
    this.own = own;
    this.w.ownVer = (this.w.ownVer || 0) + 1;
  }

  // ---------- Повідомлення ----------
  log(p, text, kind) {
    p.logN = (p.logN || 0) + 1;
    p.log.push({ id: p.logN, t: this.w.time, text, kind: kind || 'info' });
    if (p.log.length > 60) p.log.splice(0, p.log.length - 60);
  }
  sys(text) { this.pushChat(null, text); }
  pushChat(from, text) {
    this.w.chat.push({ id: this.w.chatId++, t: this.w.time, from: from ? from.name : null, color: from ? from.color : null, text });
    if (this.w.chat.length > 80) this.w.chat.splice(0, this.w.chat.length - 80);
  }

  // ---------- Будівлі ----------
  addBuilding(p, type, x, y, done) {
    const id = this.w.nextId++;
    const b = { id, owner: p.id, type, x, y, level: 1, workers: 0, progress: done ? 1 : 0, upgrading: false };
    if (this.ter(x, y) === T.FOREST) { this.w.terrain[y * W + x] = T.GRASS; this.terrainVer++; } // вирубали під будову
    this.w.buildings[id] = b;
    this.grid[y * W + x] = id;
    return b;
  }
  myBuildings(p) { return Object.values(this.w.buildings).filter(b => b.owner === p.id); }
  countType(p, type) { let n = 0; for (const id in this.w.buildings) { const b = this.w.buildings[id]; if (b.owner === p.id && b.type === type) n++; } return n; }
  hallLevel(p) { const h = this.w.buildings[p.hallId]; return h ? h.level : 1; }

  capOf(p, res) {
    if (res === 'knowledge') return Infinity;
    if (res === 'gold') return D.GOLD_CAP + 500 * (this.hallLevel(p) - 1);
    let cap = D.BASE_CAP + D.hallStorage(this.hallLevel(p));
    for (const b of this.myBuildings(p)) if (b.type === 'warehouse' && b.progress >= 1) cap += B.warehouse.storage * b.level;
    return cap;
  }
  caps(p) { const c = {}; for (const r of D.RES_ORDER) c[r] = this.capOf(p, r); return c; }

  canAfford(p, cost) { for (const k in cost) if ((p.res[k] || 0) < cost[k] - 1e-9) return false; return true; }
  pay(p, cost) { for (const k in cost) p.res[k] -= cost[k]; }
  give(p, gain) { const caps = this.caps(p); for (const k in gain) p.res[k] = Math.min(caps[k], (p.res[k] || 0) + gain[k]); }

  placementError(p, type, x, y) {
    const d = B[type];
    if (!d) return 'Невідома будівля';
    if (x < 0 || y < 0 || x >= W || y >= H) return 'За межами карти';
    if (this.grid[y * W + x]) return 'Клітинка зайнята';
    if (this.own[y * W + x] !== p.n) return 'Можна будувати лише на своїх землях';
    if (!d.on.includes(this.ter(x, y))) return 'Тут така будівля не стане (' + D.TERRAIN_NAMES[this.ter(x, y)] + ')';
    if (d.near && countNear(this.w.terrain, x, y, d.near.r, d.near.t) < d.near.min) return 'Не підходить: ' + d.near.text;
    return null;
  }

  // ---------- Дії гравців ----------
  action(p, a) {
    const fn = this['act_' + a.type];
    if (!fn) return { error: 'Невідома дія' };
    try { return fn.call(this, p, a) || { ok: true }; } catch (e) { console.error(e); return { error: 'Помилка сервера' }; }
  }

  act_build(p, { b: type, x, y }) {
    const d = B[type];
    if (!d || type === 'hall') return { error: 'Не можна' };
    if (d.tech && !p.techs.includes(d.tech)) return { error: 'Потрібна технологія: ' + D.TECH[d.tech].name };
    if (d.hall && this.hallLevel(p) < d.hall) return { error: 'Потрібна ратуша ' + d.hall + ' рівня' };
    if (d.unique && this.countType(p, type) > 0) return { error: 'Така будівля може бути лише одна' };
    x |= 0; y |= 0;
    const err = this.placementError(p, type, x, y);
    if (err) return { error: err };
    const cost = D.buildCost(type, this.countType(p, type), p.techs);
    if (!this.canAfford(p, cost)) return { error: 'Не вистачає ресурсів' };
    this.pay(p, cost);
    this.addBuilding(p, type, x, y, false);
    return { ok: true };
  }

  act_upgrade(p, { id }) {
    const b = this.w.buildings[id];
    if (!b || b.owner !== p.id) return { error: 'Не ваша будівля' };
    if (b.progress < 1) return { error: 'Будівництво ще триває' };
    const d = B[b.type];
    if (b.level >= d.maxLevel) return { error: 'Максимальний рівень' };
    const to = b.level + 1;
    const tech = D.upgradeTech(b.type, to);
    if (tech && !p.techs.includes(tech)) return { error: 'Потрібна технологія: ' + D.TECH[tech].name };
    const cost = D.upgradeCost(b.type, to, p.techs);
    if (!this.canAfford(p, cost)) return { error: 'Не вистачає ресурсів' };
    this.pay(p, cost);
    b.upgrading = true; b.progress = 0;
    return { ok: true };
  }

  act_demolish(p, { id }) {
    const b = this.w.buildings[id];
    if (!b || b.owner !== p.id) return { error: 'Не ваша будівля' };
    if (b.type === 'hall') return { error: 'Ратушу зносити не можна' };
    const refund = D.buildCost(b.type, 0, p.techs);
    for (const k in refund) refund[k] = Math.floor(refund[k] * 0.4);
    this.give(p, refund);
    delete this.w.buildings[id];
    this.grid[b.y * W + b.x] = 0;
    this.recomputeOwnership();
    return { ok: true };
  }

  assigned(p) { let s = 0; for (const b of this.myBuildings(p)) s += b.workers; return s; }

  act_workers(p, { id, delta }) {
    const b = this.w.buildings[id];
    if (!b || b.owner !== p.id) return { error: 'Не ваша будівля' };
    if (b.progress < 1 && !b.upgrading) return { error: 'Спершу треба добудувати' };
    const slots = (B[b.type].workers || 0) * b.level;
    delta = delta | 0;
    if (delta > 0) {
      const free = p.pop - this.assigned(p);
      delta = Math.min(delta, free, slots - b.workers);
      if (delta <= 0) return { error: free <= 0 ? 'Немає вільних селян' : 'Усі місця зайняті' };
    }
    b.workers = Math.max(0, Math.min(slots, b.workers + delta));
    return { ok: true };
  }

  act_workersType(p, { b: type, delta }) {
    const list = this.myBuildings(p).filter(b => b.type === type && (b.progress >= 1 || b.upgrading));
    delta = delta | 0;
    if (delta > 0) {
      for (let i = 0; i < delta; i++) {
        if (p.pop - this.assigned(p) <= 0) break;
        const t = list.filter(b => b.workers < (B[b.type].workers || 0) * b.level).sort((a, c) => a.workers - c.workers)[0];
        if (!t) break;
        t.workers++;
      }
    } else {
      for (let i = 0; i < -delta; i++) {
        const t = list.filter(b => b.workers > 0).sort((a, c) => c.workers - a.workers)[0];
        if (!t) break;
        t.workers--;
      }
    }
    return { ok: true };
  }

  act_research(p, { tech }) {
    const t = D.TECH[tech];
    if (!t) return { error: 'Невідома технологія' };
    if (p.techs.includes(tech)) return { error: 'Вже вивчено' };
    if (!t.req.every(r => p.techs.includes(r))) return { error: 'Спершу вивчіть попередні технології' };
    if (p.res.knowledge < t.cost) return { error: 'Не вистачає знань' };
    p.res.knowledge -= t.cost;
    p.techs.push(tech);
    this.log(p, 'Вивчено: ' + t.name, 'good');
    return { ok: true };
  }

  act_tax(p, { level }) {
    if (!D.TAX[level]) return { error: 'Невідомий рівень' };
    p.tax = level;
    return { ok: true };
  }

  act_rename(p, { name }) {
    name = String(name || '').replace(/[<>]/g, '').trim().slice(0, 24);
    if (name.length < 2) return { error: "Ім'я занадто коротке" };
    if (this.playersList().some(o => o !== p && o.name.toLowerCase() === name.toLowerCase())) return { error: "Це ім'я вже зайняте" };
    const old = p.name;
    p.name = name;
    this.sys(`${old} тепер відомий(-а) як ${name}.`);
    return { ok: true };
  }

  act_chat(p, { text }) {
    text = String(text || '').trim().slice(0, 240);
    if (!text) return { error: 'Порожнє повідомлення' };
    this.pushChat(p, text);
    return { ok: true };
  }

  armyCap(p) {
    const br = this.myBuildings(p).find(b => b.type === 'barracks' && (b.progress >= 1 || b.upgrading));
    return br ? br.level * D.BARRACKS_SLOTS : 0;
  }
  armySize(p) {
    let n = 0;
    for (const u of D.UNIT_ORDER) n += p.units[u] || 0;
    for (const a of this.w.armies) if (a.owner === p.id) for (const u in a.units) n += a.units[u];
    return n;
  }

  act_hire(p, { unit, n }) {
    const u = D.UNITS[unit];
    n = Math.max(1, n | 0);
    if (!u) return { error: 'Невідомий воїн' };
    if (!p.techs.includes(u.tech)) return { error: 'Потрібна технологія: ' + D.TECH[u.tech].name };
    if (this.armyCap(p) === 0) return { error: 'Спершу збудуйте казарму' };
    n = Math.min(n, this.armyCap(p) - this.armySize(p));
    if (n <= 0) return { error: 'У казармі немає місця' };
    const free = p.pop - this.assigned(p);
    if (free < n) return { error: 'Воїнами стають вільні селяни — їх не вистачає' };
    const cost = {};
    for (const k in u.cost) cost[k] = u.cost[k] * n;
    if (!this.canAfford(p, cost)) return { error: 'Не вистачає ресурсів' };
    this.pay(p, cost);
    p.pop -= n;
    p.units[unit] += n;
    return { ok: true };
  }

  act_disband(p, { unit, n }) {
    n = Math.min(n | 0, p.units[unit] || 0);
    if (n <= 0) return { error: 'Немає кого розпускати' };
    p.units[unit] -= n;
    p.pop += n; // повертаються селянами (можуть перевищити житло — тоді підуть)
    return { ok: true };
  }

  defenseOf(p) {
    let d = 5 * this.hallLevel(p);
    for (const u of D.UNIT_ORDER) d += (p.units[u] || 0) * D.UNITS[u].def;
    for (const b of this.myBuildings(p)) if (b.type === 'tower' && b.progress >= 1) d += b.workers * B.tower.defense;
    if (p.techs.includes('walls')) d *= 1.3;
    return d;
  }

  isOnline(p) { return (this.online[p.id] || 0) > 0; }

  raidBlock(p, target) {
    if (!target || target === p) return 'Невідома ціль';
    if (!this.isOnline(target)) return 'Нападати можна лише на гравців, які зараз у грі';
    if (target.shieldUntil > this.w.time) return 'Село під захистом ще ' + Math.ceil((target.shieldUntil - this.w.time) / 60) + ' хв';
    return null;
  }

  act_attack(p, { target, units }) {
    const t = this.w.players[target];
    const block = this.raidBlock(p, t);
    if (block) return { error: block };
    const send = {};
    let total = 0;
    for (const u of D.UNIT_ORDER) {
      const n = Math.max(0, Math.min((units && units[u]) | 0, p.units[u] || 0));
      if (n > 0) { send[u] = n; total += n; }
    }
    if (!total) return { error: 'Оберіть воїнів для походу' };
    for (const u in send) p.units[u] -= send[u];
    const from = this.w.buildings[p.hallId], to = this.w.buildings[t.hallId];
    const dist = Math.hypot(from.x - to.x, from.y - to.y);
    const travel = Math.max(20, dist / D.ARMY_SPEED);
    this.w.armies.push({
      id: this.w.nextId++, owner: p.id, target: t.id, units: send, loot: {},
      fx: from.x, fy: from.y, tx: to.x, ty: to.y, start: this.w.time, arrive: this.w.time + travel, phase: 'go',
    });
    p.shieldUntil = 0; // напад знімає власний захист
    this.log(p, `Військо (${total}) вирушило на ${t.name}. Прибуде за ${Math.ceil(travel)} с.`);
    this.log(t, `⚠ Розвідка доповідає: військо ${p.name} іде на нас! Прибуде за ${Math.ceil(travel)} с.`, 'bad');
    return { ok: true };
  }

  // Ринок
  priceOf(res) {
    const base = D.PRICES[res], m = this.w.market[res] || 1;
    return { buy: base * m * 1.25, sell: base * m * 0.8 };
  }
  hasMarket(p) { return this.myBuildings(p).some(b => b.type === 'market' && b.progress >= 1); }

  act_market(p, { op, res, amount }) {
    if (!this.hasMarket(p)) return { error: 'Потрібен ринок' };
    if (!D.PRICES[res]) return { error: 'Цим не торгують' };
    amount = Math.max(1, Math.min(1000, amount | 0));
    const pr = this.priceOf(res);
    if (op === 'buy') {
      const cost = Math.ceil(pr.buy * amount);
      if (p.res.gold < cost) return { error: 'Не вистачає золота' };
      if (p.res[res] + amount > this.capOf(p, res)) return { error: 'Не вміститься на склад' };
      p.res.gold -= cost; p.res[res] += amount;
      this.w.market[res] = Math.min(3, this.w.market[res] * (1 + amount / 600));
    } else if (op === 'sell') {
      if (p.res[res] < amount) return { error: 'Не вистачає товару' };
      const gain = Math.floor(pr.sell * amount);
      p.res[res] -= amount;
      p.res.gold = Math.min(this.capOf(p, 'gold'), p.res.gold + gain);
      this.w.market[res] = Math.max(0.3, this.w.market[res] * (1 - amount / 600));
    } else return { error: 'Невідома операція' };
    return { ok: true };
  }

  act_offer(p, { give, giveN, want, wantN }) {
    if (!this.hasMarket(p)) return { error: 'Потрібен ринок' };
    giveN |= 0; wantN |= 0;
    if (!D.LOOT_RES.includes(give) || !D.LOOT_RES.includes(want) || give === want) return { error: 'Невірні товари' };
    if (giveN <= 0 || wantN <= 0) return { error: 'Вкажіть кількість' };
    if (p.res[give] < giveN) return { error: 'Не вистачає товару' };
    if (this.w.offers.filter(o => o.owner === p.id).length >= 5) return { error: 'Не більше 5 пропозицій' };
    p.res[give] -= giveN;
    this.w.offers.push({ id: this.w.nextId++, owner: p.id, give, giveN, want, wantN, t: this.w.time });
    this.sys(`${p.name} пропонує ${giveN} ${D.RES[give].name.toLowerCase()} за ${wantN} ${D.RES[want].name.toLowerCase()}.`);
    return { ok: true };
  }

  act_cancelOffer(p, { id }) {
    const i = this.w.offers.findIndex(o => o.id === id && o.owner === p.id);
    if (i < 0) return { error: 'Пропозицію не знайдено' };
    const o = this.w.offers.splice(i, 1)[0];
    p.res[o.give] += o.giveN; // повертаємо навіть понад ліміт
    return { ok: true };
  }

  act_acceptOffer(p, { id }) {
    if (!this.hasMarket(p)) return { error: 'Потрібен ринок' };
    const i = this.w.offers.findIndex(o => o.id === id);
    if (i < 0) return { error: 'Пропозиція вже неактуальна' };
    const o = this.w.offers[i];
    if (o.owner === p.id) return { error: 'Це ваша пропозиція' };
    if (p.res[o.want] < o.wantN) return { error: 'Не вистачає товару' };
    const seller = this.w.players[o.owner];
    this.w.offers.splice(i, 1);
    p.res[o.want] -= o.wantN;
    p.res[o.give] += o.giveN;
    if (seller) {
      seller.res[o.want] += o.wantN;
      this.log(seller, `${p.name} прийняв(-ла) вашу угоду: +${o.wantN} ${D.RES[o.want].name.toLowerCase()}.`, 'good');
    }
    this.log(p, `Угода укладена: +${o.giveN} ${D.RES[o.give].name.toLowerCase()}.`, 'good');
    return { ok: true };
  }

  act_gift(p, { to, res, amount }) {
    if (!this.hasMarket(p)) return { error: 'Потрібен ринок' };
    const t = this.w.players[to];
    amount |= 0;
    if (!t || t === p) return { error: 'Невідомий отримувач' };
    if (!D.LOOT_RES.includes(res) || amount <= 0) return { error: 'Невірна кількість' };
    if (p.res[res] < amount) return { error: 'Не вистачає' };
    p.res[res] -= amount;
    t.res[res] += amount;
    this.log(t, `${p.name} надіслав(-ла) вам дарунок: ${amount} ${D.RES[res].name.toLowerCase()}.`, 'good');
    this.log(p, `Дарунок для ${t.name} відправлено.`);
    return { ok: true };
  }

  // ---------- Симуляція ----------
  hasEffect(type, pid) {
    return this.w.effects.some(e => e.type === type && e.until > this.w.time && (!e.target || e.target === pid));
  }

  tick(dtReal) {
    const dt = dtReal * this.speed;
    const w = this.w;
    w.time += dt;
    const season = D.SEASONS[D.seasonOf(w.time)];
    const prevSeason = D.seasonOf(w.time - dt);
    if (prevSeason !== D.seasonOf(w.time)) this.sys(`Настає ${season.name.toLowerCase()}.` + (D.seasonOf(w.time) === 3 ? ' Поля завмирають — запасайтеся їжею!' : ''));

    const byOwner = {};
    for (const id in w.buildings) { const b = w.buildings[id]; (byOwner[b.owner] = byOwner[b.owner] || []).push(b); }

    let ownChanged = false;
    for (const p of this.playersList()) {
      const before = Object.assign({}, p.res);
      if (this.simPlayer(p, byOwner[p.id] || [], season, dt)) ownChanged = true;
      // згладжені швидкості для інтерфейсу (за хвилину)
      for (const r of D.RES_ORDER) {
        const v = (p.res[r] - before[r]) / dt * 60;
        p.rates[r] = p.rates[r] === undefined ? v : p.rates[r] * 0.8 + v * 0.2;
      }
    }
    if (ownChanged) this.recomputeOwnership();

    this.simArmies();
    this.simMarket(dt);
    this.simEvents();
  }

  simPlayer(p, list, season, dt) {
    let ownChanged = false;
    // житло
    let housing = 0, happyB = 0;
    for (const b of list) {
      if (b.progress < 1 && !b.upgrading) continue;
      const d = B[b.type];
      if (b.type === 'hall') housing += 6;
      if (d.housing) housing += d.housing * b.level;
      if (d.happy && !d.passive) happyB += d.happy * (b.type === 'chapel' ? b.level : 1);
    }
    // корчми: настрій поки є зерно
    for (const b of list) {
      if (b.type !== 'tavern' || b.progress < 1) continue;
      const need = B.tavern.in.grain * b.level * dt;
      if (p.res.grain >= need) { p.res.grain -= need; happyB += B.tavern.happy * b.level; }
    }
    // різноманіття їжі
    const variety = ['grain', 'fish', 'bread'].filter(r => p.res[r] > 1).length;
    let happy = 50 + happyB + D.TAX[p.tax].happy + (variety >= 3 ? 10 : variety === 2 ? 5 : 0);
    if (p.starving) happy -= 30;
    if (this.hasEffect('festival', p.id)) happy += 15;
    if (this.hasEffect('plague', p.id)) happy -= 10;
    p.happy = Math.max(0, Math.min(100, happy));
    const prodMult = 0.7 + 0.6 * p.happy / 100;

    // виробництво
    const caps = this.caps(p);
    const hasTools = p.techs.includes('smithing');
    for (const b of list) {
      const d = B[b.type];
      if (!d.out || d.passive) continue;
      let mult = prodMult * this.factor(b, p, season);
      const toolOn = d.tools && hasTools && p.res.tools > 0;
      if (toolOn) mult *= D.TOOL_BONUS;
      b.eff = mult;
      if (!b.workers || (b.progress < 1 && !b.upgrading)) continue;
      if (toolOn) p.res.tools = Math.max(0, p.res.tools - D.TOOL_USE * b.workers * dt);
      let k = b.workers * dt;
      if (d.in) {
        for (const r in d.in) k = Math.min(k, p.res[r] / (d.in[r]));
        k = Math.max(0, k);
        for (const r in d.in) p.res[r] -= d.in[r] * k;
      }
      for (const r in d.out) p.res[r] = Math.min(caps[r], p.res[r] + d.out[r] * k * mult);
    }

    // податки та утримання війська
    let soldiers = 0;
    for (const u of D.UNIT_ORDER) soldiers += p.units[u] || 0;
    for (const a of this.w.armies) if (a.owner === p.id) for (const u in a.units) soldiers += a.units[u];
    let taxMult = 1;
    if (this.hasMarket(p)) taxMult *= 1.1;
    if (p.techs.includes('banking')) taxMult *= 1.5;
    p.res.gold += p.pop * D.TAX[p.tax].gold * taxMult * dt;
    p.res.gold -= soldiers * D.GOLD_PER_SOLDIER * dt;
    if (p.res.gold < 0) {
      p.res.gold = 0;
      p.desertT += dt;
      if (p.desertT > 20 && soldiers > 0) {
        p.desertT = 0;
        const u = D.UNIT_ORDER.find(x => p.units[x] > 0);
        if (u) { p.units[u]--; this.log(p, 'Воїн дезертирував — нема чим платити.', 'bad'); }
      }
    }
    p.res.gold = Math.min(caps.gold, p.res.gold);

    // харчування
    let need = (p.pop * D.EAT_PER_VILLAGER + soldiers * D.EAT_PER_SOLDIER) * season.food * dt;
    for (const r of ['grain', 'fish', 'bread']) {
      if (need <= 0) break;
      const avail = p.res[r] * D.FOOD[r];
      const take = Math.min(avail, need);
      p.res[r] -= take / D.FOOD[r];
      need -= take;
    }
    const wasStarving = p.starving;
    p.starving = need > 1e-6;
    if (p.starving && !wasStarving) this.log(p, 'Люди голодують! Терміново потрібна їжа.', 'bad');

    // ріст / спад населення
    if (p.starving) {
      p.starveT += dt;
      if (p.starveT >= 25 && p.pop > 1) { p.starveT = 0; p.pop--; this.log(p, 'Селянин помер від голоду.', 'bad'); }
    } else p.starveT = 0;
    if (!p.starving && p.happy >= 35 && p.pop < housing) {
      p.growT += dt * (p.happy >= 70 ? 1.5 : 1);
      if (p.growT >= 30) { p.growT = 0; p.pop++; }
    }
    if (p.pop > housing) {
      p.leaveT += dt;
      if (p.leaveT >= 15) { p.leaveT = 0; p.pop--; this.log(p, 'Безхатній селянин пішов із села.', 'bad'); }
    } else if (p.happy < 20) {
      p.leaveT += dt;
      if (p.leaveT >= 30 && p.pop > 1) { p.leaveT = 0; p.pop--; this.log(p, 'Нещасний селянин покинув село.', 'bad'); }
    } else p.leaveT = 0;
    this.fixWorkers(p, list);

    // будівництво: вільні селяни — будівельники
    const builders = Math.max(0, p.pop - list.reduce((s, b) => s + b.workers, 0));
    const sites = list.filter(b => b.progress < 1);
    if (sites.length) {
      const share = (0.5 + Math.min(builders, 8) * 0.5) / sites.length;
      for (const b of sites) {
        const d = B[b.type];
        const time = b.upgrading ? (b.type === 'hall' ? 60 * b.level : d.buildTime * (b.level + 0.5)) : d.buildTime;
        b.progress = Math.min(1, b.progress + share * dt / time);
        if (b.progress >= 1) {
          if (b.upgrading) {
            b.upgrading = false; b.level++;
            this.log(p, `${d.name} покращено до ${b.level} рівня.`, 'good');
            if (b.type === 'hall') { ownChanged = true; this.sys(`Ратуша ${p.name} тепер ${b.level} рівня!`); }
          } else this.log(p, `${d.name}: будівництво завершено.`, 'good');
        }
      }
    }
    return ownChanged;
  }

  fixWorkers(p, list) {
    let over = list.reduce((s, b) => s + b.workers, 0) - p.pop;
    if (over <= 0) return;
    const sorted = list.filter(b => b.workers > 0).sort((a, b) => b.id - a.id);
    for (const b of sorted) {
      const take = Math.min(b.workers, over);
      b.workers -= take; over -= take;
      if (over <= 0) break;
    }
  }

  factor(b, p, season) {
    const d = B[b.type], ter = this.w.terrain;
    let f = 1;
    switch (d.factor) {
      case 'forest': f = Math.max(0.25, Math.min(1.5, countNear(ter, b.x, b.y, 2, [T.FOREST]) / 8)); break;
      case 'water': f = Math.max(0.3, Math.min(1.3, countNear(ter, b.x, b.y, 1, [T.WATER]) / 3)); break;
      case 'hill': f = Math.max(0.3, Math.min(1.3, countNear(ter, b.x, b.y, 1, [T.HILL, T.ORE]) / 3)); break;
      case 'ore': f = Math.max(0.3, Math.min(1.5, countNear(ter, b.x, b.y, 1, [T.ORE]) / 2)); break;
      case 'fertile': f = this.ter(b.x, b.y) === T.FERTILE ? 1.5 : 1; break;
    }
    if (d.season) {
      let s = season.farm;
      if (s === 0 && p.techs.includes('rotation')) s = 0.35;
      f *= s;
      if (this.hasEffect('harvest', p.id)) f *= 2;
      if (this.hasEffect('drought', p.id)) f *= 0.5;
      if (p.techs.includes('agriculture')) f *= 1.3;
    }
    if (b.type === 'quarry' && p.techs.includes('masonry')) f *= 1.4;
    if (b.type === 'fisher' && this.hasEffect('fish', p.id)) f *= 2;
    return f;
  }

  // ---------- Військо ----------
  simArmies() {
    const w = this.w;
    for (const a of w.armies.slice()) {
      if (w.time < a.arrive) continue;
      const owner = w.players[a.owner];
      if (a.phase === 'go') this.resolveRaid(a);
      else {
        if (owner) {
          for (const u in a.units) owner.units[u] = (owner.units[u] || 0) + a.units[u];
          const got = [];
          for (const r in a.loot) { owner.res[r] = (owner.res[r] || 0) + a.loot[r]; if (a.loot[r] > 0) got.push(`${Math.floor(a.loot[r])} ${D.RES[r].name.toLowerCase()}`); }
          this.log(owner, 'Військо повернулося додому' + (got.length ? ' зі здобиччю: ' + got.join(', ') : '') + '.', got.length ? 'good' : 'info');
        }
        w.armies.splice(w.armies.indexOf(a), 1);
      }
    }
  }

  resolveRaid(a) {
    const w = this.w, att = w.players[a.owner], def = w.players[a.target];
    let atk = 0, carry = 0, total = 0;
    for (const u in a.units) { atk += a.units[u] * D.UNITS[u].atk; total += a.units[u]; }
    atk *= 0.85 + Math.random() * 0.3;
    const dv = this.defenseOf(def);
    const win = atk > dv;
    const ratio = win ? dv / atk : atk / Math.max(1, dv);
    // втрати нападників
    const attLoss = win ? ratio * 0.5 : 0.5 + 0.4 * (1 - ratio);
    for (const u in a.units) a.units[u] = Math.max(0, a.units[u] - Math.round(a.units[u] * attLoss));
    // втрати захисників
    const defLoss = win ? 0.3 + 0.3 * (1 - ratio) : ratio * 0.35;
    let defLost = 0;
    for (const u of D.UNIT_ORDER) { const l = Math.round((def.units[u] || 0) * defLoss); def.units[u] -= l; defLost += l; }
    for (const u in a.units) carry += a.units[u] * D.UNITS[u].carry;
    const survivors = Object.values(a.units).reduce((s, v) => s + v, 0);
    if (win && survivors > 0) {
      // 25% кожного ресурсу, але не більше вантажопідйомності
      const avail = {};
      let sum = 0;
      for (const r of D.LOOT_RES) { avail[r] = Math.floor(def.res[r] * 0.25); sum += avail[r]; }
      const k = sum > carry ? carry / sum : 1;
      for (const r of D.LOOT_RES) {
        const take = Math.floor(avail[r] * k);
        if (take > 0) { def.res[r] -= take; a.loot[r] = take; }
      }
      def.shieldUntil = w.time + D.RAID_SHIELD;
      att.stats.raidsWon++; def.stats.raidsLost++;
      const lootTxt = Object.keys(a.loot).map(r => `${a.loot[r]} ${D.RES[r].name.toLowerCase()}`).join(', ') || 'нічого';
      this.log(att, `Перемога над ${def.name}! Здобич: ${lootTxt}. Втрачено воїнів: ${total - survivors}.`, 'good');
      this.log(def, `${att.name} розграбував(-ла) село! Втрачено: ${lootTxt}. Загинуло захисників: ${defLost}. Село під захистом 15 хв.`, 'bad');
      this.sys(`${att.name} успішно напав(-ла) на ${def.name}.`);
    } else {
      att.stats.raidsLost++; def.stats.defended++;
      this.log(att, `Напад на ${def.name} відбито. Втрачено воїнів: ${total - survivors}.`, 'bad');
      this.log(def, `Ми відбили напад ${att.name}! Загинуло захисників: ${defLost}.`, 'good');
      this.sys(`${def.name} відбив(-ла) напад ${att.name}.`);
    }
    if (survivors <= 0) { w.armies.splice(w.armies.indexOf(a), 1); return; }
    const dist = Math.hypot(a.tx - a.fx, a.ty - a.fy);
    const travel = Math.max(20, dist / D.ARMY_SPEED);
    Object.assign(a, { phase: 'back', start: w.time, arrive: w.time + travel, fx: a.tx, fy: a.ty, tx: a.fx, ty: a.fy });
  }

  // ---------- Ринок ----------
  simMarket(dt) {
    const m = this.w.market;
    for (const r in m) m[r] += (1 - m[r]) * Math.min(1, 0.004 * dt);
    // старі пропозиції (> 2 год ігрового часу) повертаються власникам
    for (const o of this.w.offers.slice()) {
      if (this.w.time - o.t > 7200) {
        const p = this.w.players[o.owner];
        if (p) { p.res[o.give] += o.giveN; this.log(p, 'Пропозиція на ринку застаріла, товар повернуто.'); }
        this.w.offers.splice(this.w.offers.indexOf(o), 1);
      }
    }
  }

  // ---------- Події ----------
  simEvents() {
    const w = this.w;
    w.effects = w.effects.filter(e => e.until > w.time);
    if (w.time < w.nextEvent) return;
    w.nextEvent = w.time + 240 + Math.random() * 240;
    const players = this.playersList();
    if (!players.length) return;
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const seasonIdx = D.seasonOf(w.time);
    const pool = ['harvest', 'drought', 'plague', 'bandits', 'fire', 'fair', 'scholar', 'fish', 'festival', 'merchant'];
    const ev = pick(pool);
    const target = pick(players);
    switch (ev) {
      case 'harvest':
        if (seasonIdx === 3) return;
        w.effects.push({ type: 'harvest', until: w.time + 120, name: 'Щедрий урожай' });
        this.sys('Щедрий урожай! Поля всіх сіл дають удвічі більше 2 хвилини.'); break;
      case 'drought':
        if (seasonIdx === 3) return;
        w.effects.push({ type: 'drought', until: w.time + 150, name: 'Посуха' });
        this.sys('☀ Посуха! Урожай усіх полів знижено вдвічі на 2,5 хв.'); break;
      case 'fish':
        w.effects.push({ type: 'fish', until: w.time + 120, target: target.id, name: 'Косяк риби' });
        this.log(target, 'Біля ваших берегів косяк риби — улов подвоєно на 2 хв!', 'good'); break;
      case 'festival':
        w.effects.push({ type: 'festival', until: w.time + 180, target: target.id, name: 'Свято' });
        this.log(target, 'У селі свято! Настрій +15 на 3 хв.', 'good'); break;
      case 'plague': {
        if (target.pop < 8 || w.time - target.joined < 900) return;
        const herb = this.myBuildings(target).filter(b => b.type === 'herbalist' && b.workers > 0).length;
        const frac = (0.08 + Math.random() * 0.1) * Math.pow(0.4, herb);
        const lost = Math.max(herb ? 0 : 1, Math.round(target.pop * frac));
        target.pop -= lost;
        w.effects.push({ type: 'plague', until: w.time + 120, target: target.id, name: 'Чума' });
        this.log(target, `Чума! Померло селян: ${lost}.` + (herb ? ' Травники врятували багатьох.' : ' Травник (Травознавство) зменшив би втрати.'), 'bad');
        this.sys(`☠ Чума вразила село ${target.name}.`); break;
      }
      case 'fire': {
        const list = this.myBuildings(target).filter(b => b.type !== 'hall' && b.type !== 'well' && b.progress >= 1);
        if (!list.length || w.time - target.joined < 600) return;
        const b = pick(list);
        const wells = this.myBuildings(target).filter(x => x.type === 'well' && x.progress >= 1 && Math.hypot(x.x - b.x, x.y - b.y) <= 3);
        if (wells.length) { this.log(target, `Пожежа біля «${B[b.type].name}», але селяни загасили її водою з криниці.`, 'good'); return; }
        if (b.level > 1) { b.level--; this.log(target, `Пожежа! «${B[b.type].name}» пошкоджено (рівень знижено). Криниці поруч захищають від вогню.`, 'bad'); }
        else { b.progress = 0.3; this.log(target, `Пожежа! «${B[b.type].name}» згоріло, потрібна відбудова. Криниці поруч захищають від вогню.`, 'bad'); }
        break;
      }
      case 'bandits': {
        const cands = players.filter(p => this.isOnline(p) && p.shieldUntil <= w.time && w.time - p.joined > 1200);
        if (!cands.length) return;
        const v = pick(cands);
        const str = 5 + v.pop * 0.4 + Math.min(60, (w.time - v.joined) / 600);
        const dv = this.defenseOf(v);
        if (dv >= str) {
          const g = Math.round(20 + str);
          v.res.gold += g; v.stats.defended++;
          this.log(v, `Розбійники напали, але ваша оборона (${Math.round(dv)}) їх розбила! Трофеї: ${g} золота.`, 'good');
          this.sys(`⚔ ${v.name} розбив(-ла) зграю розбійників.`);
        } else {
          const lost = [];
          for (const r of ['gold', 'wood', 'stone', 'grain', 'fish', 'bread']) {
            const l = Math.floor(v.res[r] * 0.15);
            if (l > 0) { v.res[r] -= l; lost.push(`${l} ${D.RES[r].name.toLowerCase()}`); }
          }
          v.shieldUntil = w.time + 300;
          this.log(v, `Розбійники (сила ${Math.round(str)}) пограбували село! Втрачено: ${lost.join(', ')}. Потрібна сильніша оборона (${Math.round(dv)}).`, 'bad');
          this.sys(`⚔ Розбійники пограбували ${v.name}.`);
        }
        break;
      }
      case 'fair':
        for (const r in w.market) w.market[r] = Math.max(0.6, w.market[r] * 0.85);
        this.sys('⚖ Ярмарок! Купці знизили ціни на ринку.'); break;
      case 'scholar': {
        const k = 20 + Math.round(Math.random() * 30);
        target.res.knowledge += k;
        this.log(target, `Мандрівний чернець поділився мудрістю: +${k} знань.`, 'good'); break;
      }
      case 'merchant': {
        const r = pick(['iron', 'tools', 'planks', 'stone']);
        w.market[r] = Math.max(0.4, w.market[r] * 0.6);
        this.sys(`Прибув заморський купець — ${D.RES[r].name.toLowerCase()} на ринку значно дешевше.`); break;
      }
    }
  }

  // ---------- Знімок стану для клієнта ----------
  snapshot(p) {
    const w = this.w;
    const players = this.playersList().map(o => ({
      id: o.id, n: o.n, name: o.name, color: o.color, pop: o.pop, online: this.isOnline(o),
      hallId: o.hallId, hall: this.hallLevel(o), shield: Math.max(0, o.shieldUntil - w.time),
      fame: this.fame(o), techs: o.techs.length,
    }));
    const prices = {};
    for (const r of D.MARKET_RES) prices[r] = this.priceOf(r);
    const counts = {};
    for (const b of this.myBuildings(p)) counts[b.type] = (counts[b.type] || 0) + 1;
    return {
      time: w.time, speed: this.speed,
      me: {
        id: p.id, n: p.n, name: p.name, acc: p.acc, color: p.color, res: p.res, caps: this.caps(p), rates: p.rates,
        pop: p.pop, free: p.pop - this.assigned(p), housing: this.housing(p), happy: p.happy, tax: p.tax,
        techs: p.techs, units: p.units, armyCap: this.armyCap(p), armySize: this.armySize(p), defense: this.defenseOf(p),
        shield: Math.max(0, p.shieldUntil - w.time), starving: p.starving, log: p.log.slice(-40), stats: p.stats,
        counts, market: this.hasMarket(p),
      },
      players,
      buildings: Object.values(w.buildings).map(b => [b.id, this.w.players[b.owner] ? this.w.players[b.owner].n : 0, b.type, b.x, b.y, b.level, b.workers, Math.round(b.progress * 1000) / 1000, b.upgrading ? 1 : 0, Math.round((b.eff || 0) * 100) / 100]),
      armies: w.armies.map(a => ({ id: a.id, owner: a.owner, target: a.target, fx: a.fx, fy: a.fy, tx: a.tx, ty: a.ty, start: a.start, arrive: a.arrive, phase: a.phase, n: Object.values(a.units).reduce((s, v) => s + v, 0), mine: a.owner === p.id })),
      prices, offers: w.offers, chat: w.chat.slice(-50),
      effects: w.effects.filter(e => !e.target || e.target === p.id).map(e => ({ name: e.name, left: e.until - w.time })),
      ownVer: w.ownVer,
    };
  }

  housing(p) {
    let h = 0;
    for (const b of this.myBuildings(p)) {
      if (b.progress < 1 && !b.upgrading) continue;
      if (b.type === 'hall') h += 6;
      if (B[b.type].housing) h += B[b.type].housing * b.level;
    }
    return h;
  }

  fame(p) {
    let f = p.pop * 2 + p.techs.length * 10 + p.stats.raidsWon * 15 + p.stats.defended * 10;
    for (const b of this.myBuildings(p)) if (b.progress >= 1 || b.upgrading) f += b.level * 3;
    return Math.round(f);
  }
}

module.exports = { Game, generateMap, findSpawns };
