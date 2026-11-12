// Відмальовування карти: місцевість, території, будівлі, війська.
(function () {
  const D = window.DEFS, T = D.T, W = D.MAP_W, H = D.MAP_H;
  const TS = 32; // базовий розмір клітинки

  function hash(x, y, k) {
    let h = (x * 374761393 + y * 668265263 + (k || 0) * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }
  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------- Місцевість ----------
  function drawTerrain(terrain) {
    const cv = document.createElement('canvas');
    cv.width = W * TS; cv.height = H * TS;
    const c = cv.getContext('2d');
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : terrain[y * W + x];
    const base = { [T.WATER]: '#3f7393', [T.SAND]: '#d9c690', [T.GRASS]: '#7fa24f', [T.FERTILE]: '#6d913a', [T.FOREST]: '#678a43', [T.HILL]: '#8f9a6a', [T.ORE]: '#8f9a6a' };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = at(x, y), px = x * TS, py = y * TS;
      c.fillStyle = shade(base[t], Math.round((hash(x, y) - 0.5) * 10));
      c.fillRect(px, py, TS, TS);
    }
    // берегова лінія та деталі
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = at(x, y), px = x * TS, py = y * TS;
      if (t === T.WATER) {
        // світліша вода біля берега
        const shore = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const n = at(x + dx, y + dy); return n !== T.WATER && n !== -1; });
        if (shore) { c.fillStyle = 'rgba(160,210,220,0.22)'; c.fillRect(px, py, TS, TS); }
        if (hash(x, y, 3) < 0.35) {
          c.strokeStyle = 'rgba(200,230,240,0.45)'; c.lineWidth = 1.2;
          const wx = px + 6 + hash(x, y, 4) * 14, wy = py + 8 + hash(x, y, 5) * 16;
          c.beginPath(); c.arc(wx, wy, 4, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
          c.beginPath(); c.arc(wx + 7, wy, 4, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
        }
      } else if (t === T.SAND) {
        c.fillStyle = 'rgba(150,120,70,0.35)';
        for (let i = 0; i < 5; i++) c.fillRect(px + hash(x, y, i) * 30, py + hash(x, y, i + 9) * 30, 1.5, 1.5);
      } else if (t === T.GRASS || t === T.FERTILE) {
        c.strokeStyle = t === T.FERTILE ? 'rgba(50,80,20,0.55)' : 'rgba(70,100,35,0.5)';
        c.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          const gx = px + 3 + hash(x, y, i) * 26, gy = py + 5 + hash(x, y, i + 7) * 24;
          c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx - 1.5, gy - 4); c.moveTo(gx, gy); c.lineTo(gx + 1.5, gy - 4); c.stroke();
        }
        if (t === T.FERTILE) {
          const cols = ['#f0dc6a', '#e7a1c0', '#f5f0e0'];
          for (let i = 0; i < 3; i++) { c.fillStyle = cols[i]; c.fillRect(px + hash(x, y, i + 20) * 28 + 2, py + hash(x, y, i + 30) * 28 + 2, 2, 2); }
        }
      }
    }
    // пагорби
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = at(x, y);
      if (t !== T.HILL && t !== T.ORE) continue;
      const px = x * TS, py = y * TS, j = (hash(x, y, 11) - 0.5) * 6;
      c.fillStyle = '#7d7a70';
      c.beginPath(); c.moveTo(px + 1, py + 28); c.lineTo(px + 12 + j, py + 6); c.lineTo(px + 20 + j, py + 11); c.lineTo(px + 31, py + 28); c.closePath(); c.fill();
      c.fillStyle = '#a4a095';
      c.beginPath(); c.moveTo(px + 1, py + 28); c.lineTo(px + 12 + j, py + 6); c.lineTo(px + 15 + j, py + 28); c.closePath(); c.fill();
      c.fillStyle = '#e8e6df';
      c.beginPath(); c.moveTo(px + 9.5 + j, py + 11); c.lineTo(px + 12 + j, py + 6); c.lineTo(px + 15 + j, py + 9.5); c.closePath(); c.fill();
      if (t === T.ORE) {
        c.fillStyle = '#b4572c';
        for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(px + 9 + hash(x, y, i + 40) * 15, py + 16 + hash(x, y, i + 50) * 9, 1.8, 0, 7); c.fill(); }
        c.fillStyle = '#3a2f2a';
        c.beginPath(); c.arc(px + 19, py + 22, 1.6, 0, 7); c.fill();
      }
    }
    // ліс (малюємо в порядку зверху вниз, щоб крони перекривались природно)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (at(x, y) !== T.FOREST) continue;
      const px = x * TS, py = y * TS;
      const n = 2 + Math.floor(hash(x, y, 60) * 2);
      for (let i = 0; i < n; i++) {
        const tx = px + 6 + hash(x, y, 61 + i) * 20, ty = py + 8 + hash(x, y, 71 + i) * 16, r = 6 + hash(x, y, 81 + i) * 3;
        c.fillStyle = 'rgba(30,40,15,0.3)'; c.beginPath(); c.ellipse(tx + 2, ty + r * 0.9, r * 0.9, r * 0.35, 0, 0, 7); c.fill();
        c.fillStyle = '#5a3b1e'; c.fillRect(tx - 1, ty, 2.5, r);
        const dark = hash(x, y, 91 + i) < 0.5;
        c.fillStyle = dark ? '#2e5b2a' : '#3a6b2f'; c.beginPath(); c.arc(tx, ty, r, 0, 7); c.fill();
        c.fillStyle = dark ? '#3f7536' : '#4c8a3c'; c.beginPath(); c.arc(tx - r * 0.3, ty - r * 0.3, r * 0.55, 0, 7); c.fill();
      }
    }
    return cv;
  }

  // ---------- Території ----------
  function drawTerritory(own, players) {
    const cv = document.createElement('canvas');
    cv.width = W * TS; cv.height = H * TS;
    const c = cv.getContext('2d');
    const colorOf = {};
    for (const p of players) colorOf[p.n] = p.color;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : own[y * W + x];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = at(x, y);
      if (!o || !colorOf[o]) continue;
      const px = x * TS, py = y * TS, col = colorOf[o];
      c.fillStyle = rgba(col, 0.13); c.fillRect(px, py, TS, TS);
      c.fillStyle = rgba(col, 0.9);
      if (at(x, y - 1) !== o) c.fillRect(px, py, TS, 2);
      if (at(x, y + 1) !== o) c.fillRect(px, py + TS - 2, TS, 2);
      if (at(x - 1, y) !== o) c.fillRect(px, py, 2, TS);
      if (at(x + 1, y) !== o) c.fillRect(px + TS - 2, py, 2, TS);
    }
    return cv;
  }

  // ---------- Будівлі ----------
  function pen(c, px, py, s) {
    const X = (v) => px + v * s, Y = (v) => py + v * s;
    return {
      r(x, y, w, h, col) { c.fillStyle = col; c.fillRect(X(x), Y(y), w * s, h * s); },
      p(pts, col, stroke) { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y))); c.closePath(); c.fillStyle = col; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = Math.max(1, s / 32); c.stroke(); } },
      o(x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(X(x), Y(y), r * s, 0, 7); c.fill(); },
      e(x, y, rx, ry, col) { c.fillStyle = col; c.beginPath(); c.ellipse(X(x), Y(y), rx * s, ry * s, 0, 0, 7); c.fill(); },
      l(x1, y1, x2, y2, col, w) { c.strokeStyle = col; c.lineWidth = (w || 1) * s / 32; c.beginPath(); c.moveTo(X(x1), Y(y1)); c.lineTo(X(x2), Y(y2)); c.stroke(); },
    };
  }
  function hut(g, wall, roof, opts) {
    opts = opts || {};
    g.e(0.5, 0.9, 0.42, 0.08, 'rgba(0,0,0,0.25)');
    g.r(0.18, 0.48, 0.64, 0.4, wall);
    g.r(0.18, 0.48, 0.64, 0.05, shade(wall, -35));
    g.p([[0.08, 0.52], [0.5, 0.14], [0.92, 0.52]], roof, shade(roof, -50));
    g.p([[0.5, 0.14], [0.92, 0.52], [0.7, 0.52]], shade(roof, -22));
    if (!opts.noDoor) g.r(0.44, 0.66, 0.13, 0.22, '#4a2e17');
    if (!opts.noWin) { g.r(0.24, 0.6, 0.12, 0.1, '#f2d27a'); g.r(0.64, 0.6, 0.12, 0.1, '#f2d27a'); }
  }
  const SEASON_FIELD = ['#9dbb54', '#d9b84a', '#c58f35', '#e9eef0'];

  const DRAW = {
    hall(g, lvl, col) {
      g.e(0.5, 0.92, 0.48, 0.08, 'rgba(0,0,0,0.3)');
      g.r(0.06, 0.45, 0.88, 0.46, '#bdb5a2');
      g.r(0.06, 0.45, 0.88, 0.05, '#8d8574');
      for (let i = 0; i < 5; i++) g.r(0.06 + i * 0.19, 0.39, 0.1, 0.07, '#bdb5a2');
      g.r(0.34, 0.1, 0.32, 0.55, '#cfc7b3');
      g.p([[0.3, 0.14], [0.5, -0.06], [0.7, 0.14]], '#3d5a80', '#1f3048');
      g.p([[0.42, 0.91], [0.42, 0.72], [0.5, 0.64], [0.58, 0.72], [0.58, 0.91]], '#4a2e17');
      g.r(0.42, 0.26, 0.06, 0.1, '#2a2a2a'); g.r(0.52, 0.26, 0.06, 0.1, '#2a2a2a');
      g.l(0.5, -0.06, 0.5, -0.32, '#4a3520', 2);
      g.p([[0.5, -0.32], [0.78, -0.25], [0.5, -0.18]], col);
      if (lvl >= 3) { g.r(0.1, 0.52, 0.12, 0.2, '#cfc7b3'); g.r(0.78, 0.52, 0.12, 0.2, '#cfc7b3'); }
    },
    house(g, lvl) {
      hut(g, lvl >= 3 ? '#cfc6b0' : '#d9c49a', lvl >= 2 ? '#8e3b24' : '#a8743a');
      if (lvl >= 2) g.r(0.66, 0.2, 0.08, 0.18, '#6b5a4a');
    },
    farm(g, lvl, col, season) {
      g.r(0.04, 0.06, 0.92, 0.88, '#8a6a3e');
      const crop = SEASON_FIELD[season];
      for (let i = 0; i < 6; i++) g.r(0.08, 0.1 + i * 0.14, 0.84, 0.07, crop);
      if (season !== 3) for (let i = 0; i < 6; i++) g.r(0.08, 0.1 + i * 0.14, 0.84, 0.02, shade(crop, 30));
      g.l(0.04, 0.06, 0.96, 0.06, '#5a3b1e', 2); g.l(0.04, 0.94, 0.96, 0.94, '#5a3b1e', 2);
    },
    lumber(g) {
      hut(g, '#b48a5a', '#6b4a2a', { noWin: true });
      for (let i = 0; i < 3; i++) { g.o(0.12 + i * 0.1, 0.84, 0.06, '#8b5a2b'); g.o(0.12 + i * 0.1, 0.84, 0.03, '#d8b07a'); }
      g.l(0.78, 0.86, 0.94, 0.6, '#5a3b1e', 2); g.p([[0.88, 0.62], [0.97, 0.56], [0.95, 0.7]], '#9aa3ab');
    },
    fisher(g) {
      hut(g, '#c9b38a', '#4f6f80');
      for (let i = 0; i < 4; i++) g.l(0.04, 0.18 + i * 0.06, 0.2, 0.18 + i * 0.06, 'rgba(60,40,20,0.8)', 1);
      for (let i = 0; i < 3; i++) g.l(0.06 + i * 0.06, 0.15, 0.06 + i * 0.06, 0.38, 'rgba(60,40,20,0.8)', 1);
      g.p([[0.66, 0.88], [0.96, 0.88], [0.9, 0.96], [0.72, 0.96]], '#7a5230');
    },
    quarry(g) {
      g.p([[0.06, 0.8], [0.18, 0.2], [0.82, 0.16], [0.95, 0.78], [0.5, 0.95]], '#8e8b84');
      g.p([[0.2, 0.72], [0.28, 0.32], [0.72, 0.3], [0.8, 0.7], [0.5, 0.84]], '#6d6a64');
      g.r(0.32, 0.5, 0.16, 0.12, '#c2beb4'); g.r(0.52, 0.56, 0.14, 0.12, '#b5b1a7'); g.r(0.42, 0.66, 0.12, 0.1, '#cfcbc2');
      g.l(0.7, 0.2, 0.86, 0.06, '#5a3b1e', 2);
    },
    mine(g) {
      g.p([[0.02, 0.92], [0.3, 0.18], [0.7, 0.14], [0.98, 0.92]], '#857868');
      g.p([[0.3, 0.92], [0.3, 0.55], [0.5, 0.42], [0.7, 0.55], [0.7, 0.92]], '#231d19');
      g.l(0.28, 0.92, 0.28, 0.52, '#7a5230', 3); g.l(0.72, 0.92, 0.72, 0.52, '#7a5230', 3); g.l(0.26, 0.52, 0.74, 0.52, '#7a5230', 3);
      g.r(0.74, 0.76, 0.2, 0.12, '#5d666e'); g.o(0.78, 0.9, 0.035, '#222'); g.o(0.9, 0.9, 0.035, '#222');
      g.o(0.4, 0.3, 0.04, '#b4572c'); g.o(0.62, 0.26, 0.035, '#b4572c');
    },
    sawmill(g) {
      hut(g, '#c9a36a', '#7a5230', { noWin: true });
      g.o(0.2, 0.62, 0.15, '#9aa3ab'); g.o(0.2, 0.62, 0.05, '#4a4f55');
      for (let i = 0; i < 3; i++) g.r(0.6, 0.78 - i * 0.05, 0.36, 0.04, i % 2 ? '#d6a76a' : '#c99556');
    },
    bakery(g) {
      hut(g, '#e0cfa8', '#b0603a');
      g.r(0.66, 0.22, 0.08, 0.16, '#7a6a5a');
      g.o(0.3, 0.3, 0.04, '#5a3b1e');
      g.l(0.3, 0.3, 0.06, 0.06, '#efe6d0', 4); g.l(0.3, 0.3, 0.54, 0.54, '#efe6d0', 4);
      g.l(0.3, 0.3, 0.54, 0.06, '#efe6d0', 4); g.l(0.3, 0.3, 0.06, 0.54, '#efe6d0', 4);
    },
    smithy(g) {
      hut(g, '#8e8a84', '#4a4440', { noWin: true });
      g.r(0.66, 0.16, 0.12, 0.24, '#5d5853'); g.o(0.72, 0.14, 0.06, '#f08a2a'); g.o(0.72, 0.12, 0.03, '#ffd27a');
      g.r(0.24, 0.62, 0.14, 0.08, '#f08a2a');
      g.p([[0.02, 0.84], [0.16, 0.84], [0.14, 0.9], [0.04, 0.9]], '#3a4148');
    },
    scriptorium(g) {
      hut(g, '#e6dcc4', '#6a4c8a');
      g.r(0.04, 0.72, 0.12, 0.16, '#efe1bb'); g.r(0.03, 0.7, 0.14, 0.03, '#c9a86a');
    },
    chapel(g) {
      hut(g, '#efe8da', '#7a3b2e', { noWin: true });
      g.r(0.38, 0.0, 0.24, 0.5, '#efe8da'); g.p([[0.34, 0.04], [0.5, -0.16], [0.66, 0.04]], '#7a3b2e');
      g.l(0.5, -0.16, 0.5, -0.36, '#d4a520', 2.5); g.l(0.43, -0.29, 0.57, -0.29, '#d4a520', 2.5);
      g.p([[0.45, 0.4], [0.45, 0.28], [0.5, 0.22], [0.55, 0.28], [0.55, 0.4]], '#3d5a80');
      g.r(0.24, 0.62, 0.08, 0.14, '#3d5a80'); g.r(0.68, 0.62, 0.08, 0.14, '#3d5a80');
    },
    well(g) {
      g.e(0.5, 0.86, 0.36, 0.08, 'rgba(0,0,0,0.25)');
      g.e(0.5, 0.66, 0.3, 0.2, '#9a968c'); g.e(0.5, 0.62, 0.22, 0.13, '#3f6e94');
      g.l(0.22, 0.66, 0.22, 0.2, '#6b4a2a', 3); g.l(0.78, 0.66, 0.78, 0.2, '#6b4a2a', 3);
      g.p([[0.14, 0.26], [0.5, 0.06], [0.86, 0.26]], '#8e3b24');
      g.l(0.5, 0.28, 0.5, 0.48, '#4a3520', 1.5); g.r(0.45, 0.46, 0.1, 0.08, '#7a5230');
    },
    warehouse(g) {
      g.e(0.5, 0.92, 0.48, 0.08, 'rgba(0,0,0,0.25)');
      g.r(0.06, 0.44, 0.88, 0.46, '#a4703c');
      g.p([[0.0, 0.48], [0.2, 0.16], [0.8, 0.16], [1.0, 0.48]], '#6b3d22', '#3e2010');
      g.r(0.34, 0.56, 0.32, 0.34, '#5a3518');
      g.l(0.34, 0.56, 0.66, 0.9, '#a4703c', 2); g.l(0.66, 0.56, 0.34, 0.9, '#a4703c', 2);
    },
    market(g) {
      const stall = (x, c1) => {
        g.r(x, 0.5, 0.4, 0.34, '#a4703c');
        for (let i = 0; i < 4; i++) g.r(x - 0.03 + i * 0.115, 0.32, 0.115, 0.16, i % 2 ? '#f3ead8' : c1);
        g.r(x + 0.05, 0.56, 0.1, 0.08, '#e2b843'); g.r(x + 0.22, 0.58, 0.1, 0.07, '#c0392b');
      };
      g.e(0.5, 0.9, 0.48, 0.08, 'rgba(0,0,0,0.25)');
      stall(0.05, '#c0392b'); stall(0.55, '#2471a3');
    },
    tavern(g) {
      hut(g, '#d4b483', '#8b3a2a');
      g.l(0.86, 0.5, 0.86, 0.66, '#4a3520', 1.5); g.r(0.8, 0.64, 0.14, 0.12, '#e8a33a'); g.r(0.83, 0.66, 0.08, 0.08, '#fff1c4');
    },
    herbalist(g) {
      hut(g, '#cbbf93', '#4f7a3a');
      const cols = ['#7aa64a', '#9b6bb5', '#7aa64a', '#d9c34a'];
      for (let i = 0; i < 4; i++) g.o(0.08 + i * 0.07, 0.9, 0.035, cols[i]);
    },
    barracks(g, lvl, col) {
      g.e(0.5, 0.92, 0.48, 0.08, 'rgba(0,0,0,0.3)');
      g.r(0.06, 0.46, 0.88, 0.44, '#a39e92');
      g.p([[0.02, 0.5], [0.16, 0.2], [0.84, 0.2], [0.98, 0.5]], '#8b2e1f', '#4a150d');
      g.r(0.42, 0.62, 0.16, 0.28, '#4a2e17');
      g.l(0.14, 0.88, 0.34, 0.52, '#6b4a2a', 2); g.l(0.34, 0.88, 0.14, 0.52, '#6b4a2a', 2);
      g.p([[0.66, 0.56], [0.86, 0.56], [0.86, 0.7], [0.76, 0.8], [0.66, 0.7]], col);
    },
    tower(g, lvl, col) {
      g.e(0.5, 0.94, 0.3, 0.06, 'rgba(0,0,0,0.3)');
      g.r(0.28, 0.12, 0.44, 0.82, '#a8a294');
      g.r(0.28, 0.12, 0.12, 0.82, '#bdb7a9');
      for (let i = 0; i < 3; i++) g.r(0.26 + i * 0.18, 0.02, 0.12, 0.12, '#a8a294');
      g.r(0.47, 0.34, 0.06, 0.14, '#2a2a2a'); g.r(0.47, 0.6, 0.06, 0.12, '#2a2a2a');
      g.l(0.5, 0.02, 0.5, -0.24, '#4a3520', 2); g.p([[0.5, -0.24], [0.76, -0.18], [0.5, -0.12]], col);
    },
  };

  function drawBuilding(c, b, px, py, s, col, season) {
    const g = pen(c, px, py, s);
    const built = b.progress >= 1 || b.upgrading;
    if (!built) {
      g.r(0.1, 0.5, 0.8, 0.4, '#b39b74');
      c.globalAlpha = 0.3 + 0.5 * b.progress;
    }
    (DRAW[b.type] || DRAW.house)(g, b.level, col, season);
    c.globalAlpha = 1;
    if (!built || b.upgrading) {
      // риштування
      g.l(0.14, 0.92, 0.14, 0.28, '#7a5a32', 2); g.l(0.86, 0.92, 0.86, 0.28, '#7a5a32', 2);
      g.l(0.14, 0.5, 0.86, 0.5, '#7a5a32', 2); g.l(0.14, 0.3, 0.86, 0.3, '#7a5a32', 2);
      g.l(0.14, 0.92, 0.86, 0.3, '#7a5a32', 1.5);
      g.r(0.08, 0.02, 0.84, 0.1, 'rgba(0,0,0,0.6)');
      g.r(0.1, 0.035, 0.8 * b.progress, 0.07, b.upgrading ? '#f0a030' : '#7ed05a');
    }
    if (b.level > 1 && s >= 22) {
      for (let i = 0; i < b.level; i++) { g.o(0.1 + i * 0.12, 0.96, 0.05, '#3a2a10'); g.o(0.1 + i * 0.12, 0.96, 0.035, '#f0c94a'); }
    }
  }

  // ---------- Головний рендер ----------
  class Renderer {
    constructor(canvas) {
      this.cv = canvas; this.c = canvas.getContext('2d');
      this.zoom = 1; this.cx = W * TS / 2; this.cy = H * TS / 2;
      this.terrainCv = null; this.terrCv = null;
    }
    setTerrain(t) { this.terrain = t; this.terrainCv = drawTerrain(t); }
    setTerritory(own, players) { this.own = own; this.terrCv = drawTerritory(own, players); this.terrKey = players.map(p => p.n + p.color).join(); }
    resize() {
      const r = this.cv.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
      this.vw = r.width; this.vh = r.height; this.dpr = dpr;
    }
    clampCam() {
      const hw = this.vw / 2 / this.zoom, hh = this.vh / 2 / this.zoom;
      this.cx = Math.max(Math.min(hw, W * TS / 2), Math.min(W * TS - Math.min(hw, W * TS / 2), this.cx));
      this.cy = Math.max(Math.min(hh, H * TS / 2), Math.min(H * TS - Math.min(hh, H * TS / 2), this.cy));
    }
    screenToTile(sx, sy) {
      const wx = (sx - this.vw / 2) / this.zoom + this.cx, wy = (sy - this.vh / 2) / this.zoom + this.cy;
      return { x: Math.floor(wx / TS), y: Math.floor(wy / TS) };
    }
    tileToScreen(x, y) {
      return { x: (x * TS - this.cx) * this.zoom + this.vw / 2, y: (y * TS - this.cy) * this.zoom + this.vh / 2 };
    }
    centerOn(x, y) { this.cx = (x + 0.5) * TS; this.cy = (y + 0.5) * TS; this.clampCam(); }

    draw(st) {
      const c = this.c, z = this.zoom, s = TS * z;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.fillStyle = '#2f5670'; c.fillRect(0, 0, this.vw, this.vh);
      if (!this.terrainCv) return;
      const ox = this.vw / 2 - this.cx * z, oy = this.vh / 2 - this.cy * z;
      c.imageSmoothingEnabled = z < 1;
      c.drawImage(this.terrainCv, ox, oy, W * TS * z, H * TS * z);
      if (this.terrCv) c.drawImage(this.terrCv, ox, oy, W * TS * z, H * TS * z);

      const x0 = Math.max(0, Math.floor(-ox / s) - 1), y0 = Math.max(0, Math.floor(-oy / s) - 1);
      const x1 = Math.min(W, Math.ceil((this.vw - ox) / s) + 1), y1 = Math.min(H, Math.ceil((this.vh - oy) / s) + 2);
      const colorOf = {};
      for (const p of st.players) colorOf[p.n] = p.color;
      const season = D.seasonOf(st.time);

      // будівлі (зверху вниз)
      const vis = st.blist.filter(b => b.x >= x0 && b.x < x1 && b.y >= y0 && b.y < y1).sort((a, b) => a.y - b.y || a.x - b.x);
      for (const b of vis) drawBuilding(c, b, ox + b.x * s, oy + b.y * s, s, colorOf[b.n] || '#888', season);

      // працівники (лише свої)
      if (s >= 24) {
        for (const b of vis) {
          if (b.n !== st.me.n) continue;
          const slots = (D.B[b.type].workers || 0) * b.level;
          if (!slots || (b.progress < 1 && !b.upgrading)) continue;
          const px = ox + b.x * s, py = oy + b.y * s;
          c.fillStyle = 'rgba(20,14,8,0.75)'; c.fillRect(px + s * 0.1, py + s * 0.98, s * 0.8, 3);
          c.fillStyle = b.workers ? '#e8c547' : '#b84a3a';
          c.fillRect(px + s * 0.1, py + s * 0.98, s * 0.8 * Math.max(b.workers ? b.workers / slots : 1, 0), 3);
        }
      }

      // підписи сіл — текст з обведенням під ратушею, щоб не закривати будівлі
      c.textAlign = 'center'; c.textBaseline = 'top'; c.lineJoin = 'round';
      for (const p of st.players) {
        const h = st.bmap[p.hallId];
        if (!h) continue;
        const fs = Math.max(11, Math.min(15, s * 0.4));
        const px = ox + (h.x + 0.5) * s, py = oy + (h.y + 1) * s + 4;
        c.font = `bold ${fs}px "Palatino Linotype", Georgia, serif`;
        const tw = c.measureText(p.name).width;
        c.strokeStyle = 'rgba(25,15,5,0.85)'; c.lineWidth = 4;
        c.strokeText(p.name, px, py);
        c.fillStyle = p.online ? '#fff3d6' : '#cbbfa4'; c.fillText(p.name, px, py);
        c.fillStyle = p.color; c.fillRect(px - tw / 2, py + fs + 1, tw, 2.5);
        if (p.shield > 0) { // щит захисту
          const sx = px + tw / 2 + 4, sy = py + 1;
          c.fillStyle = '#1d2c40'; c.beginPath(); c.moveTo(sx - 1, sy - 1); c.lineTo(sx + 10, sy - 1); c.lineTo(sx + 10, sy + 6); c.quadraticCurveTo(sx + 10, sy + 12, sx + 4.5, sy + 14); c.quadraticCurveTo(sx - 1, sy + 12, sx - 1, sy + 6); c.closePath(); c.fill();
          c.fillStyle = '#6a9fe0'; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 9, sy); c.lineTo(sx + 9, sy + 6); c.quadraticCurveTo(sx + 9, sy + 11, sx + 4.5, sy + 13); c.quadraticCurveTo(sx, sy + 11, sx, sy + 6); c.closePath(); c.fill();
        }
      }

      // війська
      const now = st.time;
      for (const a of st.armies) {
        const k = Math.max(0, Math.min(1, (now - a.start) / (a.arrive - a.start)));
        const ax = a.fx + (a.tx - a.fx) * k, ay = a.fy + (a.ty - a.fy) * k;
        const px = ox + (ax + 0.5) * s, py = oy + (ay + 0.5) * s;
        const owner = st.players.find(p => p.id === a.owner);
        c.setLineDash([4, 4]); c.strokeStyle = 'rgba(40,20,10,0.6)'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(px, py); c.lineTo(ox + (a.tx + 0.5) * s, oy + (a.ty + 0.5) * s); c.stroke(); c.setLineDash([]);
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(px, py + 8, 9, 3, 0, 0, 7); c.fill();
        c.strokeStyle = '#3a2a10'; c.lineWidth = 2; c.beginPath(); c.moveTo(px - 4, py + 8); c.lineTo(px - 4, py - 14); c.stroke();
        c.fillStyle = owner ? owner.color : '#888';
        c.beginPath(); c.moveTo(px - 4, py - 14); c.lineTo(px + 10, py - 10); c.lineTo(px - 4, py - 5); c.closePath(); c.fill();
        c.font = 'bold 11px Georgia, serif'; c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3;
        c.strokeText(String(a.n), px + 4, py + 6); c.fillText(String(a.n), px + 4, py + 6);
      }

      // наведення / режим будівництва
      if (st.hover) {
        const { x, y } = st.hover;
        const px = ox + x * s, py = oy + y * s;
        if (st.buildMode) {
          const ok = st.hoverOk;
          c.fillStyle = ok ? 'rgba(120,220,100,0.35)' : 'rgba(230,80,60,0.35)';
          c.fillRect(px, py, s, s);
          if (ok) { c.globalAlpha = 0.65; drawBuilding(c, { type: st.buildMode, level: 1, progress: 1 }, px, py, s, st.me.color, season); c.globalAlpha = 1; }
          c.strokeStyle = ok ? '#7ed05a' : '#e05040'; c.lineWidth = 2; c.strokeRect(px + 1, py + 1, s - 2, s - 2);
          const d = D.B[st.buildMode];
          const r = d.factor === 'forest' ? 2 : (d.near || d.factor) ? 1 : 0;
          if (r) { c.strokeStyle = 'rgba(255,255,255,0.6)'; c.setLineDash([3, 3]); c.strokeRect(px - r * s, py - r * s, s * (2 * r + 1), s * (2 * r + 1)); c.setLineDash([]); }
        } else {
          c.strokeStyle = 'rgba(255,255,240,0.7)'; c.lineWidth = 1.5; c.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
        }
      }
      if (st.selected) {
        const b = st.bmap[st.selected];
        if (b) {
          const px = ox + b.x * s, py = oy + b.y * s;
          c.strokeStyle = '#ffd34d'; c.lineWidth = 2.5; c.strokeRect(px - 1, py - 1, s + 2, s + 2);
        }
      }
    }
  }

  window.Renderer = Renderer;
  window.drawBuildingIcon = function (cv, type, color, season) {
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    const s = cv.width * 0.72;
    drawBuilding(c, { type, level: 1, progress: 1 }, (cv.width - s) / 2, cv.height - s * 1.02, s, color || '#c0392b', season || 1);
  };
})();
