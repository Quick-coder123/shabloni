// Клієнт гри «Феод»: зв'язок із сервером, інтерфейс, керування картою.
(function () {
  'use strict';
  const D = window.DEFS, T = D.T, W = D.MAP_W, H = D.MAP_H, B = D.B;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v) => { v = Math.floor(v + 1e-6); return v >= 10000 ? (v / 1000).toFixed(1).replace('.0', '') + 'k' : String(v); };
  const fmt1 = (v) => (Math.abs(v) < 10 ? (Math.round(v * 10) / 10).toString().replace('.', ',') : String(Math.round(v)));
  const mmss = (s) => { s = Math.max(0, Math.ceil(s)); const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)} год ${m % 60} хв` : m ? `${m} хв ${String(s % 60).padStart(2, '0')} с` : `${s} с`; };

  // ---------- Стан ----------
  const S = {
    token: null, me: null, players: [], blist: [], bmap: {}, grid: new Int32Array(W * H), own: null, terrain: null,
    armies: [], prices: {}, offers: [], chat: [], effects: [], time: 0, speed: 1, recvAt: 0, serverTime: 0,
    hover: null, hoverOk: false, buildMode: null, selected: null, tab: 'build',
    seenLog: -1, seenChat: 0, unreadChat: 0, inputs: { mAmt: '10', hireN: '1', offGive: 'wood', offGiveN: '50', offWant: 'gold', offWantN: '50', giftTo: '', giftRes: 'wood', giftN: '20' },
  };
  window.S = S;
  const renderer = new Renderer($('#map'));
  window.__renderer = renderer; // для налагодження

  // ---------- Вхід ----------
  const params = new URLSearchParams(location.search);
  if (params.get('acc')) {
    try { localStorage.setItem('feod.acc', params.get('acc')); localStorage.setItem('feod.key', params.get('key') || ''); } catch (_) { /* ignore */ }
    history.replaceState(null, '', location.pathname);
  }
  let acc = params.get('acc'), key = params.get('key') || '';
  try { if (!acc) { acc = localStorage.getItem('feod.acc'); key = localStorage.getItem('feod.key') || ''; } } catch (_) { /* ignore */ }

  async function login(a, k) {
    $('#loginErr').textContent = '';
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acc: a, key: k }) });
      const j = await r.json();
      if (!r.ok) { $('#loginErr').textContent = j.error || 'Помилка входу'; $('#login').classList.remove('hidden'); return false; }
      S.token = j.token;
      try { localStorage.setItem('feod.acc', a); localStorage.setItem('feod.key', k || ''); } catch (_) { /* ignore */ }
      $('#login').classList.add('hidden');
      connect();
      return true;
    } catch (e) {
      $('#loginErr').textContent = 'Сервер недоступний. Переконайтеся, що start-server.bat запущено.';
      $('#login').classList.remove('hidden');
      setTimeout(() => login(a, k), 3000);
      return false;
    }
  }
  $('#loginBtn').onclick = () => { const a = $('#loginAcc').value.trim(); if (a) { acc = a; key = ''; login(a, ''); } };
  $('#loginAcc').onkeydown = (e) => { if (e.key === 'Enter') $('#loginBtn').click(); };
  if (acc) { $('#loginAcc').value = acc; login(acc, key); } else $('#login').classList.remove('hidden');

  // ---------- Потік стану ----------
  let es = null;
  function connect() {
    if (es) es.close();
    es = new EventSource('/api/stream?token=' + S.token);
    es.addEventListener('init', (e) => {
      const d = JSON.parse(e.data);
      S.terrain = Uint8Array.from(d.terrain);
      renderer.setTerrain(S.terrain);
      S.firstTick = true;
    });
    es.addEventListener('tick', (e) => onTick(JSON.parse(e.data)));
    es.onopen = () => $('#conn').classList.add('hidden');
    es.onerror = () => {
      $('#conn').classList.remove('hidden');
      if (es.readyState === EventSource.CLOSED) { es = null; setTimeout(() => login(acc, key), 2000); }
    };
  }

  function onTick(d) {
    S.time = d.time; S.speed = d.speed; S.recvAt = performance.now();
    S.me = d.me; S.players = d.players; S.armies = d.armies; S.prices = d.prices; S.offers = d.offers; S.effects = d.effects;
    if (d.terrain) { S.terrain = Uint8Array.from(d.terrain); renderer.setTerrain(S.terrain); }
    S.blist = d.buildings.map(a => ({ id: a[0], n: a[1], type: a[2], x: a[3], y: a[4], level: a[5], workers: a[6], progress: a[7], upgrading: !!a[8], eff: a[9] }));
    S.bmap = {}; S.grid.fill(0);
    for (const b of S.blist) { S.bmap[b.id] = b; S.grid[b.y * W + b.x] = b.id; }
    const terrKey = S.players.map(p => p.n + p.color).join();
    if (d.own) { S.own = Uint8Array.from(d.own); renderer.setTerritory(S.own, S.players); }
    else if (S.own && renderer.terrKey !== terrKey) renderer.setTerritory(S.own, S.players);
    // нові повідомлення чату
    const lastChat = S.chat.length ? S.chat[S.chat.length - 1].id : 0;
    S.chat = d.chat;
    const fresh = S.chat.filter(m => m.id > lastChat);
    if (lastChat && fresh.length && S.tab !== 'realm') S.unreadChat += fresh.filter(m => m.from).length;
    if (lastChat) for (const m of fresh) if (!m.from) toast(m.text, 'sys');
    // нові записи журналу
    const log = S.me.log;
    const lastId = log.length ? log[log.length - 1].id || 0 : 0;
    if (S.seenLog >= 0) for (const l of log) if ((l.id || 0) > S.seenLog) toast(l.text, l.kind);
    S.seenLog = Math.max(S.seenLog, lastId);
    if (S.firstTick) {
      S.firstTick = false;
      const h = S.bmap[S.players.find(p => p.id === S.me.id).hallId];
      renderer.resize(); renderer.centerOn(h.x, h.y);
    }
    if (S.selected && !S.bmap[S.selected]) S.selected = null;
    updateHover();
    renderTop(); renderPanel(); renderSel(); draw();
  }

  // Плавне відображення часу (для руху військ)
  function gameNow() { return S.time + (performance.now() - S.recvAt) / 1000 * S.speed; }

  // ---------- Дії ----------
  async function act(a) {
    try {
      const r = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: S.token, a }) });
      const j = await r.json();
      if (j.error) toast(j.error, 'bad');
      return j;
    } catch (e) { toast("Немає зв'язку з сервером", 'bad'); return { error: 'net' }; }
  }

  // ---------- Сповіщення ----------
  function toast(text, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), kind === 'bad' ? 7000 : 4500);
    setTimeout(() => el.remove(), kind === 'bad' ? 7600 : 5100);
    while ($('#toasts').children.length > 5) $('#toasts').firstChild.remove();
  }

  // ---------- Допоміжне ----------
  const ter = (x, y) => S.terrain[y * W + x];
  function countNear(x, y, r, types) {
    let n = 0;
    for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (types.includes(ter(xx, yy))) n++;
    }
    return n;
  }
  function placementError(type, x, y) {
    const d = B[type];
    if (x < 0 || y < 0 || x >= W || y >= H) return 'За межами карти';
    if (S.grid[y * W + x]) return 'Клітинка зайнята';
    if (!S.own || S.own[y * W + x] !== S.me.n) return 'Можна будувати лише на своїх землях';
    if (!d.on.includes(ter(x, y))) return 'Тут не можна: ' + D.TERRAIN_NAMES[ter(x, y)].toLowerCase();
    if (d.near && countNear(x, y, d.near.r, d.near.t) < d.near.min) return 'Не підходить: ' + d.near.text;
    return null;
  }
  function factorPreview(type, x, y) {
    const d = B[type];
    switch (d.factor) {
      case 'forest': return { label: 'Ліс поруч', n: countNear(x, y, 2, [T.FOREST]), f: Math.max(0.25, Math.min(1.5, countNear(x, y, 2, [T.FOREST]) / 8)) };
      case 'water': return { label: 'Вода поруч', n: countNear(x, y, 1, [T.WATER]), f: Math.max(0.3, Math.min(1.3, countNear(x, y, 1, [T.WATER]) / 3)) };
      case 'hill': return { label: 'Пагорби поруч', n: countNear(x, y, 1, [T.HILL, T.ORE]), f: Math.max(0.3, Math.min(1.3, countNear(x, y, 1, [T.HILL, T.ORE]) / 3)) };
      case 'ore': return { label: 'Рудні жили поруч', n: countNear(x, y, 1, [T.ORE]), f: Math.max(0.3, Math.min(1.5, countNear(x, y, 1, [T.ORE]) / 2)) };
      case 'fertile': return { label: ter(x, y) === T.FERTILE ? 'Родючий ґрунт' : 'Звичайний ґрунт', f: ter(x, y) === T.FERTILE ? 1.5 : 1 };
    }
    return null;
  }
  function costHTML(cost, mine) {
    const parts = [];
    for (const k of D.RES_ORDER) if (cost[k]) {
      const lack = mine && (S.me.res[k] || 0) < cost[k];
      parts.push(`<span class="cost${lack ? ' lack' : ''}">${icon(k)}${cost[k]}</span>`);
    }
    return parts.join('') || '<span class="cost">безкоштовно</span>';
  }
  const canAfford = (cost) => Object.keys(cost).every(k => (S.me.res[k] || 0) >= cost[k]);
  const myCount = (type) => S.me.counts[type] || 0;
  function lockReason(type) {
    const d = B[type];
    if (d.tech && !S.me.techs.includes(d.tech)) return 'Потрібно: ' + D.TECH[d.tech].name;
    const hall = S.players.find(p => p.id === S.me.id);
    if (d.hall && hall.hall < d.hall) return 'Потрібна ратуша ' + d.hall + ' рівня';
    if (d.unique && myCount(type) > 0) return 'Вже збудовано';
    return null;
  }
  function seasonIcon(i) { return ['leaf', 'sun', 'maple', 'snow'][i]; }

  // ---------- Верхня панель ----------
  function renderTop() {
    const m = S.me;
    let html = '';
    for (const r of D.RES_ORDER) {
      const v = m.res[r], cap = m.caps[r], rate = m.rates[r] || 0;
      const full = cap !== null && cap !== undefined && isFinite(cap) && v >= cap - 0.5;
      const rateTxt = Math.abs(rate) < 0.05 ? '' : `<small class="${rate > 0 ? 'up' : 'down'}">${rate > 0 ? '+' : ''}${fmt1(rate)}</small>`;
      const tip = `${D.RES[r].name}: ${Math.floor(v)}${isFinite(cap) && cap ? ' / ' + cap : ''}${rate ? ` (${rate > 0 ? '+' : ''}${fmt1(rate)} за хв)` : ''}${full ? ' — склад повний!' : ''}`;
      html += `<div class="chip${full ? ' full' : ''}" title="${esc(tip)}">${icon(r)}<b>${fmt(v)}</b>${rateTxt}</div>`;
    }
    $('#res').innerHTML = html;
    const si = D.seasonOf(S.time), season = D.SEASONS[si];
    const sp = (S.time % D.SEASON_LEN) / D.SEASON_LEN;
    const happyCls = m.happy >= 65 ? 'up' : m.happy < 35 ? 'down' : '';
    let st = `<div class="chip" title="Населення: ${m.pop} / житло ${m.housing}. Вільні селяни будують і чекають на роботу.">${icon('pop')}<b>${m.pop}/${m.housing}</b><small>вільних ${Math.max(0, m.free)}</small></div>`;
    st += `<div class="chip" title="Настрій впливає на продуктивність (70–130%) і приріст населення">${happyFace(m.happy)}<b class="${happyCls}">${Math.round(m.happy)}%</b></div>`;
    st += `<div class="chip" title="Сила оборони села">${icon('shield')}<b>${Math.round(m.defense)}</b>${m.shield > 0 ? `<small title="Захист від нападів">захист ${mmss(m.shield / S.speed)}</small>` : ''}</div>`;
    st += `<div class="chip season" title="${season.name}: поля ×${season.farm}${si === 3 ? ', їжі потрібно більше' : ''}. До наступної пори: ${mmss(D.SEASON_LEN * (1 - sp) / S.speed)}">${icon(seasonIcon(si))}<b>${season.name}</b><small>рік ${D.yearOf(S.time)}</small><i class="sbar"><i style="width:${Math.round(sp * 100)}%"></i></i></div>`;
    for (const e of S.effects) st += `<div class="chip effect" title="Діє ще ${mmss(e.left / S.speed)}">${esc(e.name)} <small>${mmss(e.left / S.speed)}</small></div>`;
    if (m.starving) st += '<div class="chip alarm">Голод!</div>';
    $('#status').innerHTML = st;
  }
  function happyFace(h) {
    const col = h >= 65 ? '#6aa84f' : h >= 35 ? '#d9a520' : '#c0392b';
    const mouth = h >= 65 ? 'M5 9.5 Q8 12.5 11 9.5' : h >= 35 ? 'M5 10.5 H11' : 'M5 11.5 Q8 8.5 11 11.5';
    return `<svg class="ico" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="${col}" stroke="#3a2a10"/><circle cx="5.8" cy="6.5" r="1" fill="#2a1a08"/><circle cx="10.2" cy="6.5" r="1" fill="#2a1a08"/><path d="${mouth}" stroke="#2a1a08" stroke-width="1.2" fill="none"/></svg>`;
  }

  // ---------- Бічна панель ----------
  const TABS = [
    ['build', 'Будівництво'], ['people', 'Селяни'], ['science', 'Наука'], ['market', 'Ринок'], ['army', 'Військо'], ['realm', 'Королівства'], ['log', 'Хроніка'],
  ];
  function renderTabs() {
    $('#tabs').innerHTML = TABS.map(([id, name]) => `<button data-tab="${id}" class="${S.tab === id ? 'on' : ''}">${name}${id === 'realm' && S.unreadChat ? `<span class="badge">${S.unreadChat}</span>` : ''}</button>`).join('');
  }
  let lastPanel = '';
  function renderPanel() {
    renderTabs();
    const fn = PANELS[S.tab];
    const html = fn ? fn() : '';
    if (html === lastPanel) return;
    const panel = $('#panel');
    const scroll = panel.scrollTop;
    const ae = document.activeElement;
    const focusId = ae && panel.contains(ae) ? ae.id : null;
    const selS = focusId && ae.selectionStart, selE = focusId && ae.selectionEnd;
    panel.innerHTML = html;
    lastPanel = html;
    panel.scrollTop = scroll;
    panel.querySelectorAll('canvas[data-bicon]').forEach(cv => drawBuildingIcon(cv, cv.dataset.bicon, S.me.color, D.seasonOf(S.time)));
    if (S.tab === 'realm') { const cl = $('#chatLog'); if (cl && S.chatAtBottom !== false) cl.scrollTop = cl.scrollHeight; }
    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); try { el.setSelectionRange(selS, selE); } catch (_) { /* ignore */ } } }
  }
  const inp = (id, type, extra) => `<input id="${id}" data-inp="${id}" type="${type || 'number'}" min="1" value="${esc(S.inputs[id] || '')}" ${extra || ''}>`;
  const resSelect = (id, list) => `<select id="${id}" data-inp="${id}">${list.map(r => `<option value="${r}" ${S.inputs[id] === r ? 'selected' : ''}>${D.RES[r].name}</option>`).join('')}</select>`;

  const PANELS = {
    build() {
      let h = `<p class="hint">Оберіть будівлю, потім клацніть на клітинку своїх земель. Будують <b>вільні селяни</b> — що їх більше, то швидше. <kbd>Esc</kbd> — скасувати.</p>`;
      for (const cat of D.CATS) {
        const types = D.B_ORDER.filter(t => B[t].cat === cat && t !== 'hall');
        h += `<h3>${cat}</h3><div class="cards">`;
        for (const t of types) {
          const d = B[t], lock = lockReason(t), cost = D.buildCost(t, myCount(t), S.me.techs);
          const ok = !lock && canAfford(cost);
          h += `<div class="card bcard${lock ? ' locked' : ''}${S.buildMode === t ? ' active' : ''}${ok ? '' : ' poor'}" data-build="${t}" title="${esc(d.desc)}">
            <canvas data-bicon="${t}" width="44" height="44"></canvas>
            <div class="bc-body"><div class="bc-name">${d.name}${myCount(t) ? ` <small>×${myCount(t)}</small>` : ''}</div>
            ${lock ? `<div class="lock">${esc(lock)}</div>` : `<div class="costs">${costHTML(cost, true)}</div>`}
            <div class="bc-desc">${esc(d.desc)}</div></div></div>`;
        }
        h += '</div>';
      }
      return h;
    },

    people() {
      const m = S.me;
      const eat = (m.pop * D.EAT_PER_VILLAGER + (m.armySize) * D.EAT_PER_SOLDIER) * D.SEASONS[D.seasonOf(S.time)].food * 60;
      const foodRate = ['grain', 'fish', 'bread'].reduce((s, r) => s + (m.rates[r] || 0) * D.FOOD[r], 0);
      const foodStock = ['grain', 'fish', 'bread'].reduce((s, r) => s + m.res[r] * D.FOOD[r], 0);
      let h = `<div class="stats">
        <div><span>Населення</span><b>${m.pop} / ${m.housing}</b></div>
        <div><span>Вільні (будівельники)</span><b>${Math.max(0, m.free)}</b></div>
        <div><span>З'їдають за хв</span><b>${fmt1(eat)} порцій</b></div>
        <div><span>Запас їжі</span><b class="${foodRate < 0 && foodStock / -foodRate < 3 ? 'down' : ''}">${fmt(foodStock)} порцій${foodRate < -0.1 ? ` (~${mmss(foodStock / -foodRate * 60 / S.speed)})` : ''}</b></div>
      </div>`;
      if (m.pop >= m.housing) h += '<p class="warn">Житло заповнене — будуйте або покращуйте хати, щоб село росло.</p>';
      h += `<h3>Податки</h3><div class="seg">${Object.keys(D.TAX).map(k => `<button data-tax="${k}" class="${m.tax === k ? 'on' : ''}">${D.TAX[k].name}<small>${D.TAX[k].gold * 60} зол./хв з людини, настрій ${D.TAX[k].happy > 0 ? '+' : ''}${D.TAX[k].happy}</small></button>`).join('')}</div>`;
      h += '<h3>Розподіл праці</h3><p class="hint">Селяни працюють вручну: призначте їх на роботу. Кнопки розподіляють людей між усіма будівлями цього типу.</p><table class="tbl"><tr><th>Робота</th><th>Люди</th><th></th></tr>';
      const mine = S.blist.filter(b => b.n === m.n);
      for (const t of D.B_ORDER) {
        const d = B[t];
        if (!d.workers) continue;
        const list = mine.filter(b => b.type === t && (b.progress >= 1 || b.upgrading));
        if (!list.length) continue;
        const w = list.reduce((s, b) => s + b.workers, 0), slots = list.reduce((s, b) => s + d.workers * b.level, 0);
        let out = '';
        if (d.out) {
          const r = Object.keys(d.out)[0];
          const per = list.reduce((s, b) => s + b.workers * d.out[r] * (b.eff || 0), 0) * 60;
          out = `<small>${icon(r)}~${fmt1(per)}/хв</small>`;
        } else if (t === 'tower') out = `<small>${icon('shield')}+${w * d.defense}</small>`;
        h += `<tr><td>${d.name} <small>×${list.length}</small><br>${out}</td><td><b>${w}</b>/${slots}</td>
          <td class="btns"><button data-wt="${t}" data-d="-5">−5</button><button data-wt="${t}" data-d="-1">−</button><button data-wt="${t}" data-d="1">+</button><button data-wt="${t}" data-d="5">+5</button></td></tr>`;
      }
      h += '</table>';
      return h;
    },

    science() {
      const m = S.me;
      let h = `<div class="stats"><div><span>Знання</span><b>${icon('knowledge')} ${fmt(m.res.knowledge)}</b></div><div><span>Приріст</span><b>${fmt1(m.rates.knowledge || 0)} / хв</b></div></div>
        <p class="hint">Знання дають писарі у скрипторії та священники в каплицях.</p>`;
      const depth = {};
      const dep = (t) => depth[t] !== undefined ? depth[t] : (depth[t] = D.TECH[t].req.length ? 1 + Math.max(...D.TECH[t].req.map(dep)) : 0);
      D.TECH_ORDER.forEach(dep);
      const tiers = Math.max(...Object.values(depth));
      const roman = ['I', 'II', 'III', 'IV', 'V', 'VI'];
      for (let i = 0; i <= tiers; i++) {
        h += `<h3>Епоха ${roman[i]}</h3><div class="cards">`;
        for (const t of D.TECH_ORDER.filter(x => depth[x] === i)) {
          const d = D.TECH[t], done = m.techs.includes(t), avail = d.req.every(r => m.techs.includes(r));
          const can = !done && avail && m.res.knowledge >= d.cost;
          h += `<div class="card tcard ${done ? 'done' : avail ? '' : 'locked'}">
            <div class="bc-name">${d.name}</div><div class="bc-desc">${esc(d.desc)}</div>
            ${done ? '<div class="ok">✓ Вивчено</div>' : avail ? `<button data-research="${t}" ${can ? '' : 'disabled'}>${icon('knowledge')} ${d.cost} — дослідити</button>` : `<div class="lock">Потрібно: ${d.req.filter(r => !m.techs.includes(r)).map(r => D.TECH[r].name).join(', ')}</div>`}
          </div>`;
        }
        h += '</div>';
      }
      return h;
    },

    market() {
      const m = S.me;
      if (!m.market) {
        return `<p class="hint">Ринок дозволяє купувати й продавати товари в мандрівних купців (ціни спільні для всіх гравців і змінюються від попиту), а також обмінюватися з іншими гравцями й надсилати дарунки.</p>
          <p class="warn">${m.techs.includes('trade') ? 'Збудуйте Ринок (вкладка «Будівництво» → Громада).' : 'Спершу дослідіть «Торгівлю» (вкладка «Наука»), потім збудуйте Ринок.'}</p>`;
      }
      let h = `<h3>Купці</h3><div class="row">Кількість: ${inp('mAmt')}</div><table class="tbl"><tr><th>Товар</th><th>Є</th><th>Купити</th><th>Продати</th></tr>`;
      const amt = Math.max(1, parseInt(S.inputs.mAmt, 10) || 1);
      for (const r of D.MARKET_RES) {
        const p = S.prices[r];
        const trend = p.sell / (D.PRICES[r] * 0.8);
        h += `<tr><td>${icon(r)} ${D.RES[r].name} <small class="${trend > 1.05 ? 'up' : trend < 0.95 ? 'down' : ''}">${trend > 1.05 ? '▲' : trend < 0.95 ? '▼' : ''}</small></td><td>${fmt(m.res[r])}</td>
          <td><button data-mk="buy" data-r="${r}" title="За ${Math.ceil(p.buy * amt)} золота">${fmt1(p.buy)}</button></td>
          <td><button data-mk="sell" data-r="${r}" title="Отримаєте ${Math.floor(p.sell * amt)} золота">${fmt1(p.sell)}</button></td></tr>`;
      }
      h += '</table><p class="hint">Ціна — у золоті за одиницю. Продаж знижує ціну для всіх, купівля — підвищує.</p>';
      h += '<h3>Пропозиції гравців</h3>';
      if (!S.offers.length) h += '<p class="hint">Поки що пропозицій немає.</p>';
      else {
        h += '<table class="tbl">';
        for (const o of S.offers) {
          const owner = S.players.find(p => p.id === o.owner);
          h += `<tr><td><span class="dot" style="background:${owner ? owner.color : '#888'}"></span>${esc(owner ? owner.name : '?')}</td>
            <td>дає ${icon(o.give)}${o.giveN}<br>хоче ${icon(o.want)}${o.wantN}</td>
            <td>${o.owner === m.id ? `<button data-cancel="${o.id}">Скасувати</button>` : `<button data-accept="${o.id}" ${m.res[o.want] >= o.wantN ? '' : 'disabled'}>Прийняти</button>`}</td></tr>`;
        }
        h += '</table>';
      }
      h += `<h3>Нова пропозиція</h3><div class="form">
        <label>Віддаю ${resSelect('offGive', D.LOOT_RES)} ${inp('offGiveN')}</label>
        <label>Хочу ${resSelect('offWant', D.LOOT_RES)} ${inp('offWantN')}</label>
        <button data-offer="1">Виставити на ринок</button></div>`;
      const others = S.players.filter(p => p.id !== m.id);
      if (others.length) {
        if (!others.find(p => p.id === S.inputs.giftTo)) S.inputs.giftTo = others[0].id;
        h += `<h3>Дарунок</h3><div class="form">
          <label>Кому <select id="giftTo" data-inp="giftTo">${others.map(p => `<option value="${p.id}" ${S.inputs.giftTo === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
          <label>Що ${resSelect('giftRes', D.LOOT_RES)} ${inp('giftN')}</label>
          <button data-gift="1">Надіслати</button></div>`;
      }
      return h;
    },

    army() {
      const m = S.me;
      let h = `<div class="stats"><div><span>Оборона села</span><b>${icon('shield')} ${Math.round(m.defense)}</b></div>
        <div><span>Військо</span><b>${m.armySize} / ${m.armyCap}</b></div>
        <div><span>Захист від нападів</span><b>${m.shield > 0 ? mmss(m.shield / S.speed) : 'немає'}</b></div></div>`;
      h += `<p class="hint">Оборону дають ратуша (5 за рівень), воїни вдома, вартові на вежах та мури. Нападати можна лише на гравців, які зараз у грі й не під захистом. Напад знімає ваш власний захист. Переможець забирає до 25% запасів (скільки зможуть нести воїни).</p>`;
      if (!m.armyCap) h += `<p class="warn">${m.techs.includes('military') ? 'Збудуйте Казарму (потрібна ратуша 2 рівня).' : 'Дослідіть «Військову справу», щоб збудувати казарму та наймати воїнів.'}</p>`;
      h += `<h3>Воїни</h3><div class="row">Кількість: ${inp('hireN')}</div><table class="tbl"><tr><th>Воїн</th><th>Вдома</th><th></th></tr>`;
      for (const u of D.UNIT_ORDER) {
        const d = D.UNITS[u], has = m.techs.includes(d.tech);
        h += `<tr class="${has ? '' : 'locked'}"><td><b>${d.name}</b><br><small>атака ${d.atk} · захист ${d.def} · несе ${d.carry}</small><br>${costHTML(d.cost, true)}</td><td><b>${m.units[u]}</b></td>
          <td class="btns">${has ? `<button data-hire="${u}" ${m.armyCap ? '' : 'disabled'}>Найняти</button><button data-disband="${u}" ${m.units[u] ? '' : 'disabled'}>Розпустити</button>` : `<small>${D.TECH[d.tech].name}</small>`}</td></tr>`;
      }
      h += '</table><p class="hint">Воїнами стають вільні селяни. Кожен воїн їсть і отримує платню в золоті.</p>';
      const mineArmies = S.armies.filter(a => a.mine);
      if (mineArmies.length) {
        h += '<h3>Походи</h3><table class="tbl">';
        for (const a of mineArmies) {
          const t = S.players.find(p => p.id === a.target);
          h += `<tr><td>${a.phase === 'go' ? 'Іде на' : 'Повертається від'} ${esc(t ? t.name : '?')}</td><td>${a.n} воїн.</td><td>${mmss((a.arrive - S.time) / S.speed)}</td></tr>`;
        }
        h += '</table>';
      }
      const incoming = S.armies.filter(a => a.target === m.id && a.phase === 'go');
      if (incoming.length) {
        h += '<h3 class="down">Напади на нас</h3><table class="tbl">';
        for (const a of incoming) { const o = S.players.find(p => p.id === a.owner); h += `<tr><td>${esc(o ? o.name : '?')}</td><td>${a.n} воїн.</td><td>${mmss((a.arrive - S.time) / S.speed)}</td></tr>`; }
        h += '</table>';
      }
      h += '<h3>Цілі</h3><table class="tbl">';
      for (const p of S.players.filter(p => p.id !== m.id)) {
        const why = !p.online ? 'не в грі' : p.shield > 0 ? 'захист ' + mmss(p.shield / S.speed) : '';
        h += `<tr><td><span class="dot" style="background:${p.color}"></span>${esc(p.name)}<br><small>населення ${p.pop}, ратуша ${p.hall}</small></td>
          <td>${why ? `<small>${why}</small>` : `<button data-attack="${p.id}" ${m.armySize ? '' : 'disabled'}>Напасти</button>`}</td></tr>`;
      }
      h += '</table>';
      return h;
    },

    realm() {
      const m = S.me;
      let h = '<h3>Володарі</h3><table class="tbl">';
      for (const p of S.players.slice().sort((a, b) => b.fame - a.fame)) {
        h += `<tr class="${p.id === m.id ? 'me' : ''}"><td><span class="dot" style="background:${p.color}"></span><b>${esc(p.name)}</b> ${p.online ? '<small class="up">● у грі</small>' : '<small>○ поза грою</small>'}<br><small>населення ${p.pop} · ратуша ${p.hall} · технологій ${p.techs}</small></td>
          <td title="Слава">${icon('crown')} ${p.fame}</td><td><button data-goto="${p.hallId}">На карті</button></td></tr>`;
      }
      h += `</table><h3>Ваше ім'я</h3><div class="row">${inp('rename', 'text', `maxlength="24" placeholder="${esc(m.name)}"`)}<button data-rename="1">Змінити</button></div>
        <p class="hint">Профіль прив'язано до облікового запису Windows <b>${esc(m.acc)}</b>.</p>`;
      h += '<h3>Глашатай і чат</h3><div id="chatLog" class="chat">';
      for (const c of S.chat) {
        h += c.from ? `<div class="msg"><b style="color:${c.color}">${esc(c.from)}:</b> ${esc(c.text)}</div>` : `<div class="msg sys">${esc(c.text)}</div>`;
      }
      h += `</div><div class="row">${inp('chat', 'text', 'maxlength="240" placeholder="Повідомлення..."')}<button data-chat="1">Надіслати</button></div>`;
      return h;
    },

    log() {
      const log = S.me.log.slice().reverse();
      let h = '<h3>Хроніка вашого села</h3><div class="loglist">';
      for (const l of log) {
        const si = D.seasonOf(l.t);
        h += `<div class="logi ${l.kind}"><small>${D.SEASONS[si].name}, рік ${D.yearOf(l.t)}</small>${esc(l.text)}</div>`;
      }
      return h + '</div>';
    },
  };

  // ---------- Картка обраної будівлі ----------
  let lastSel = '';
  function renderSel() {
    const el = $('#sel');
    const b = S.selected && S.bmap[S.selected];
    if (!b) { el.classList.add('hidden'); lastSel = ''; return; }
    const d = B[b.type], owner = S.players.find(p => p.n === b.n);
    const mine = b.n === S.me.n;
    let h = `<button class="x" data-close="1">×</button><div class="sel-head"><canvas data-bicon="${b.type}" width="48" height="48"></canvas><div><b>${d.name}</b> <small>рівень ${b.level}${d.maxLevel > 1 ? '/' + d.maxLevel : ''}</small><br><small><span class="dot" style="background:${owner ? owner.color : '#888'}"></span>${esc(owner ? owner.name : '')}</small></div></div>`;
    if (b.type === 'hall' && !mine && owner) {
      h += `<p>Населення: ${owner.pop} · Слава: ${owner.fame}<br>${owner.online ? 'У грі' : 'Поза грою'}${owner.shield > 0 ? ' · під захистом ' + mmss(owner.shield / S.speed) : ''}</p>`;
      h += `<div class="btns"><button data-attack="${owner.id}" ${S.me.armySize && owner.online && owner.shield <= 0 ? '' : 'disabled'}>Напасти</button>${S.me.market ? `<button data-giftto="${owner.id}">Дарунок</button>` : ''}</div>`;
    } else if (mine) {
      h += `<p class="desc">${esc(d.desc)}</p>`;
      if (b.progress < 1) h += `<p>${b.upgrading ? 'Покращення' : 'Будівництво'}: ${Math.round(b.progress * 100)}%<br><small>Будують вільні селяни (${Math.max(0, S.me.free)}).</small></p>`;
      const slots = (d.workers || 0) * b.level;
      if (slots && (b.progress >= 1 || b.upgrading)) {
        h += `<div class="workers">Працівники: <b>${b.workers}/${slots}</b> <span class="btns"><button data-w="${b.id}" data-d="-1">−</button><button data-w="${b.id}" data-d="1">+</button><button data-w="${b.id}" data-d="${slots}">усі</button></span></div>`;
        if (d.out) {
          const outs = Object.keys(d.out).map(r => `${icon(r)} ${fmt1(d.out[r] * b.workers * b.eff * 60)}/хв`).join(' ');
          const ins = d.in ? ' з ' + Object.keys(d.in).map(r => `${icon(r)} ${fmt1(d.in[r] * b.workers * 60)}/хв`).join(' ') : '';
          h += `<p>Виробляє: ${outs}${ins}<br><small>Ефективність ${Math.round(b.eff * 100)}% (настрій, місцевість, пора року, інструменти)</small></p>`;
        }
        if (b.type === 'tower') h += `<p>Оборона: +${b.workers * d.defense}</p>`;
      }
      if (b.type === 'hall') {
        h += `<p>Володіння: радіус ${D.hallRadius(b.level)} · склад +${D.hallStorage(b.level)}</p>`;
      }
      if (d.housing) h += `<p>Житло: ${d.housing * b.level} осіб</p>`;
      if (d.storage) h += `<p>Склад: +${d.storage * b.level}</p>`;
      if (b.level < d.maxLevel && b.progress >= 1) {
        const to = b.level + 1, cost = D.upgradeCost(b.type, to, S.me.techs), tech = D.upgradeTech(b.type, to);
        const lock = tech && !S.me.techs.includes(tech) ? 'Потрібно: ' + D.TECH[tech].name : '';
        h += `<div class="up-box"><b>Покращити до ${to} рівня</b><div class="costs">${costHTML(cost, true)}</div>${lock ? `<div class="lock">${lock}</div>` : `<button data-upgrade="${b.id}" ${canAfford(cost) ? '' : 'disabled'}>Покращити</button>`}</div>`;
      }
      if (b.type !== 'hall') h += `<div class="btns right"><button class="danger" data-demolish="${b.id}">Знести</button></div>`;
    } else {
      h += `<p class="desc">${esc(d.desc)}</p>`;
    }
    if (h === lastSel) return;
    lastSel = h;
    el.innerHTML = h;
    el.classList.remove('hidden');
    el.querySelectorAll('canvas[data-bicon]').forEach(cv => drawBuildingIcon(cv, cv.dataset.bicon, owner ? owner.color : '#888', D.seasonOf(S.time)));
  }

  // ---------- Модальне вікно нападу ----------
  function openAttack(targetId) {
    const t = S.players.find(p => p.id === targetId);
    if (!t) return;
    const me = S.players.find(p => p.id === S.me.id);
    const h1 = S.bmap[me.hallId], h2 = S.bmap[t.hallId];
    const travel = Math.max(20, Math.hypot(h1.x - h2.x, h1.y - h2.y) / D.ARMY_SPEED) / S.speed;
    let h = `<h2>Похід на ${esc(t.name)}</h2><p class="hint">Дорога в один бік: ~${mmss(travel)}. Сила оборони цілі невідома — розвідка не встигла. Взимку воїни їдять більше.</p><table class="tbl">`;
    for (const u of D.UNIT_ORDER) {
      if (!S.me.units[u]) continue;
      h += `<tr><td>${D.UNITS[u].name} <small>(атака ${D.UNITS[u].atk})</small></td><td><input type="number" min="0" max="${S.me.units[u]}" value="${S.me.units[u]}" data-au="${u}"></td><td>з ${S.me.units[u]}</td></tr>`;
    }
    h += `</table><p>Сила атаки: <b id="atkSum"></b> · Несуть: <b id="carrySum"></b></p><div class="btns right"><button data-modal-close="1">Скасувати</button><button class="danger" data-attack-go="${t.id}">Вирушати!</button></div>`;
    $('#modalBox').innerHTML = h;
    $('#modal').classList.remove('hidden');
    const upd = () => {
      let a = 0, c = 0;
      document.querySelectorAll('[data-au]').forEach(i => { const n = Math.max(0, Math.min(+i.max, +i.value || 0)); a += n * D.UNITS[i.dataset.au].atk; c += n * D.UNITS[i.dataset.au].carry; });
      $('#atkSum').textContent = a; $('#carrySum').textContent = c;
    };
    $('#modalBox').oninput = upd; upd();
  }

  // ---------- Події інтерфейсу ----------
  document.addEventListener('input', (e) => { const id = e.target.dataset && e.target.dataset.inp; if (id) S.inputs[id] = e.target.value; });
  document.addEventListener('change', (e) => { const id = e.target.dataset && e.target.dataset.inp; if (id) { S.inputs[id] = e.target.value; renderPanel(); } });
  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'chat' && e.key === 'Enter') { sendChat(); e.preventDefault(); }
    if (e.target.id === 'rename' && e.key === 'Enter') { $('[data-rename]').click(); e.preventDefault(); }
  });
  async function sendChat() {
    const text = (S.inputs.chat || '').trim();
    if (!text) return;
    S.inputs.chat = '';
    const el = $('#chat'); if (el) el.value = '';
    S.chatAtBottom = true;
    await act({ type: 'chat', text });
  }

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('button, [data-build]');
    if (!t) return;
    const ds = t.dataset;
    if (ds.tab) { S.tab = ds.tab; if (ds.tab === 'realm') S.unreadChat = 0; lastPanel = ''; renderPanel(); $('#panel').scrollTop = 0; return; }
    if (ds.build) {
      if (lockReason(ds.build)) { toast(lockReason(ds.build), 'bad'); return; }
      S.buildMode = S.buildMode === ds.build ? null : ds.build; S.selected = null;
      lastPanel = ''; renderPanel(); renderSel(); updateHint(); draw(); return;
    }
    if (ds.close) { S.selected = null; renderSel(); draw(); return; }
    if (ds.modalClose) { $('#modal').classList.add('hidden'); return; }
    if (ds.tax) return act({ type: 'tax', level: ds.tax });
    if (ds.wt) return act({ type: 'workersType', b: ds.wt, delta: +ds.d });
    if (ds.w) return act({ type: 'workers', id: +ds.w, delta: +ds.d });
    if (ds.research) return act({ type: 'research', tech: ds.research });
    if (ds.upgrade) return act({ type: 'upgrade', id: +ds.upgrade });
    if (ds.demolish) {
      const b = S.bmap[ds.demolish];
      if (b && confirm(`Знести «${B[b.type].name}»? Повернеться 40% вартості.`)) { S.selected = null; act({ type: 'demolish', id: +ds.demolish }); }
      return;
    }
    if (ds.mk) return act({ type: 'market', op: ds.mk, res: ds.r, amount: Math.max(1, parseInt(S.inputs.mAmt, 10) || 1) });
    if (ds.offer) return act({ type: 'offer', give: S.inputs.offGive, giveN: +S.inputs.offGiveN, want: S.inputs.offWant, wantN: +S.inputs.offWantN });
    if (ds.accept) return act({ type: 'acceptOffer', id: +ds.accept });
    if (ds.cancel) return act({ type: 'cancelOffer', id: +ds.cancel });
    if (ds.gift) return act({ type: 'gift', to: S.inputs.giftTo, res: S.inputs.giftRes, amount: +S.inputs.giftN });
    if (ds.giftto) { S.inputs.giftTo = ds.giftto; S.tab = 'market'; lastPanel = ''; renderPanel(); return; }
    if (ds.hire) return act({ type: 'hire', unit: ds.hire, n: Math.max(1, parseInt(S.inputs.hireN, 10) || 1) });
    if (ds.disband) return act({ type: 'disband', unit: ds.disband, n: Math.max(1, parseInt(S.inputs.hireN, 10) || 1) });
    if (ds.attack) return openAttack(ds.attack);
    if (ds.attackGo) {
      const units = {};
      document.querySelectorAll('[data-au]').forEach(i => { units[i.dataset.au] = Math.max(0, +i.value || 0); });
      const r = await act({ type: 'attack', target: ds.attackGo, units });
      if (r.ok) $('#modal').classList.add('hidden');
      return;
    }
    if (ds.goto) { const b = S.bmap[ds.goto]; if (b) { renderer.centerOn(b.x, b.y); S.selected = b.id; renderSel(); draw(); } return; }
    if (ds.rename) { const r = await act({ type: 'rename', name: S.inputs.rename }); if (r.ok) S.inputs.rename = ''; return; }
    if (ds.chat) return sendChat();
    if (t.id === 'btnHome') { const me = S.players.find(p => p.id === S.me.id); const h = me && S.bmap[me.hallId]; if (h) renderer.centerOn(h.x, h.y); draw(); return; }
    if (t.id === 'btnZin') { zoomAt(1.25); return; }
    if (t.id === 'btnZout') { zoomAt(0.8); return; }
  });
  $('#panel').addEventListener('scroll', (e) => {
    const cl = $('#chatLog'); if (cl && e.target === cl) S.chatAtBottom = cl.scrollTop + cl.clientHeight >= cl.scrollHeight - 10;
  }, true);

  // ---------- Карта: миша і клавіатура ----------
  const cv = $('#map');
  let drag = null;
  cv.addEventListener('mousedown', (e) => {
    if (e.button === 2) { cancelBuild(); return; }
    drag = { x: e.clientX, y: e.clientY, cx: renderer.cx, cy: renderer.cy, moved: false };
  });
  window.addEventListener('mousemove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) { renderer.cx = drag.cx - dx / renderer.zoom; renderer.cy = drag.cy - dy / renderer.zoom; renderer.clampCam(); draw(); }
    }
    if (e.target === cv) {
      const r = cv.getBoundingClientRect();
      S.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      const prev = S.hover;
      updateHover();
      if (!prev || !S.hover || prev.x !== S.hover.x || prev.y !== S.hover.y) { updateHint(); draw(); }
    }
  });
  cv.addEventListener('mouseleave', () => { S.mouse = null; S.hover = null; updateHint(); draw(); });
  window.addEventListener('mouseup', async (e) => {
    if (!drag) return;
    const wasDrag = drag.moved; drag = null;
    if (wasDrag || e.target !== cv || !S.hover || !S.me) return;
    const { x, y } = S.hover;
    if (S.buildMode) {
      const type = S.buildMode;
      const err = placementError(type, x, y);
      if (err) { toast(err, 'bad'); return; }
      const r = await act({ type: 'build', b: type, x, y });
      if (r.ok && !e.shiftKey) cancelBuild();
      return;
    }
    const id = S.grid[y * W + x];
    S.selected = id || null;
    renderSel(); draw();
  });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, S.mouse); }, { passive: false });
  function zoomAt(k, at) {
    const z0 = renderer.zoom, z1 = Math.max(0.4, Math.min(2.2, z0 * k));
    if (at) {
      const wx = (at.x - renderer.vw / 2) / z0 + renderer.cx, wy = (at.y - renderer.vh / 2) / z0 + renderer.cy;
      renderer.cx = wx - (at.x - renderer.vw / 2) / z1; renderer.cy = wy - (at.y - renderer.vh / 2) / z1;
    }
    renderer.zoom = z1; renderer.clampCam(); updateHover(); draw();
  }
  function cancelBuild() { if (S.buildMode) { S.buildMode = null; lastPanel = ''; renderPanel(); updateHint(); draw(); } }
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'Escape') { if (!$('#modal').classList.contains('hidden')) $('#modal').classList.add('hidden'); else if (S.buildMode) cancelBuild(); else { S.selected = null; renderSel(); draw(); } }
    if (e.key === 'h' || e.key === 'р' || e.key === 'Home') $('#btnHome').click();
    if (e.key === '+' || e.key === '=') zoomAt(1.2);
    if (e.key === '-') zoomAt(1 / 1.2);
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  function panLoop() {
    let dx = 0, dy = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;
    if (dx || dy) { renderer.cx += dx * 14 / renderer.zoom; renderer.cy += dy * 14 / renderer.zoom; renderer.clampCam(); updateHover(); draw(); }
    // війська рухаються плавно — перемальовуємо кілька разів на секунду, лише коли вони є
    if (S.armies.length && performance.now() - (S.lastArmyDraw || 0) > 250) { S.lastArmyDraw = performance.now(); draw(); }
    requestAnimationFrame(panLoop);
  }
  requestAnimationFrame(panLoop);

  function updateHover() {
    if (!S.mouse || !S.me || !S.terrain) { S.hover = null; return; }
    const t = renderer.screenToTile(S.mouse.x, S.mouse.y);
    if (t.x < 0 || t.y < 0 || t.x >= W || t.y >= H) { S.hover = null; return; }
    S.hover = t;
    S.hoverOk = S.buildMode ? !placementError(S.buildMode, t.x, t.y) : false;
  }
  function updateHint() {
    const el = $('#hint');
    if (!S.hover || !S.terrain || !S.me) { el.classList.add('hidden'); return; }
    const { x, y } = S.hover;
    let h = `<b>${D.TERRAIN_NAMES[ter(x, y)]}</b>`;
    const o = S.own && S.own[y * W + x];
    if (o) { const p = S.players.find(q => q.n === o); if (p) h += ` · <span style="color:${p.color}">■</span> ${esc(p.name)}`; }
    const id = S.grid[y * W + x];
    if (id) h += ` · ${B[S.bmap[id].type].name}`;
    if (S.buildMode) {
      const err = placementError(S.buildMode, x, y);
      h += `<br>${err ? `<span class="down">${esc(err)}</span>` : '<span class="up">Можна будувати</span>'}`;
      const f = factorPreview(S.buildMode, x, y);
      if (f && !err) h += `<br>${f.label}${f.n !== undefined ? ': ' + f.n : ''} → видобуток ×${f.f.toFixed(2).replace('.', ',')}`;
      h += '<br><small>Shift+клік — будувати кілька · ПКМ/Esc — скасувати</small>';
    }
    el.innerHTML = h;
    el.classList.remove('hidden');
  }

  function draw() {
    if (!S.me) return;
    renderer.draw({
      me: S.me, players: S.players, blist: S.blist, bmap: S.bmap, grid: S.grid, armies: S.armies, time: gameNow(),
      hover: S.hover, hoverOk: S.hoverOk, buildMode: S.buildMode, selected: S.selected,
    });
  }
  window.addEventListener('resize', () => { renderer.resize(); renderer.clampCam(); draw(); });
  renderer.resize();
})();
