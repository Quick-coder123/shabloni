// Спільні визначення гри: використовуються і сервером (Node), і клієнтом (браузер).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DEFS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAP_W = 84;
  const MAP_H = 60;

  // Типи місцевості
  const T = { WATER: 0, SAND: 1, GRASS: 2, FERTILE: 3, FOREST: 4, HILL: 5, ORE: 6 };
  const TERRAIN_NAMES = ['Вода', 'Пісок', 'Лука', 'Родючий ґрунт', 'Ліс', 'Пагорб', 'Рудна жила'];
  const LAND = [T.SAND, T.GRASS, T.FERTILE, T.FOREST];

  // Ресурси
  const RES_ORDER = ['gold', 'wood', 'stone', 'grain', 'fish', 'bread', 'planks', 'iron', 'tools', 'knowledge'];
  const RES = {
    gold: { name: 'Золото' },
    wood: { name: 'Деревина' },
    stone: { name: 'Камінь' },
    grain: { name: 'Зерно' },
    fish: { name: 'Риба' },
    bread: { name: 'Хліб' },
    planks: { name: 'Дошки' },
    iron: { name: 'Залізо' },
    tools: { name: 'Інструменти' },
    knowledge: { name: 'Знання' },
  };
  // Поживність їжі (скільки «порцій» дає одиниця)
  const FOOD = { grain: 1, fish: 1.2, bread: 2.5 };

  // Базові ліміти складу
  const BASE_CAP = 200;
  const GOLD_CAP = 1000;

  // Пори року (кожна триває SEASON_LEN ігрових секунд)
  const SEASON_LEN = 300;
  const SEASONS = [
    { name: 'Весна', farm: 0.8, food: 1.0 },
    { name: 'Літо', farm: 1.25, food: 1.0 },
    { name: 'Осінь', farm: 1.0, food: 1.0 },
    { name: 'Зима', farm: 0, food: 1.25 },
  ];

  // Економічні константи (за ігрову секунду)
  const EAT_PER_VILLAGER = 0.05;
  const EAT_PER_SOLDIER = 0.04;
  const GOLD_PER_SOLDIER = 0.012;
  const TAX = {
    low: { name: 'Низькі', gold: 0.01, happy: 10 },
    normal: { name: 'Звичайні', gold: 0.02, happy: 0 },
    high: { name: 'Високі', gold: 0.035, happy: -15 },
  };
  const TOOL_BONUS = 1.5;
  const TOOL_USE = 0.002; // інструментів на працівника за секунду

  // Будівлі.
  // workers — місць на рівень; out/in — на одного працівника за секунду.
  // factor — від чого залежить видобуток (місцевість навколо).
  const B = {
    hall: {
      name: 'Ратуша', cat: 'Громада', maxLevel: 5, unique: true, buildTime: 1,
      cost: {}, desc: 'Серце села. Рівень ратуші визначає розмір володінь, склад і відкриває нові будівлі.',
      on: [T.GRASS, T.FERTILE, T.SAND],
    },
    house: {
      name: 'Хата', cat: 'Житло', maxLevel: 3, buildTime: 25, scale: 1.15,
      cost: { wood: 20 }, housing: 4,
      desc: 'Дає житло 4 селянам за рівень.',
      on: [T.GRASS, T.FERTILE, T.SAND, T.FOREST],
    },
    farm: {
      name: 'Поле', cat: 'Видобуток', maxLevel: 3, buildTime: 15, scale: 1.08,
      cost: { wood: 15 }, workers: 3, out: { grain: 0.2 }, factor: 'fertile', season: true, tools: true,
      desc: 'Селяни вирощують зерно. На родючому ґрунті +50%. Взимку нічого не росте.',
      on: [T.GRASS, T.FERTILE],
    },
    lumber: {
      name: 'Хатина лісоруба', cat: 'Видобуток', maxLevel: 3, buildTime: 20, scale: 1.1,
      cost: { wood: 10, gold: 10 }, workers: 2, out: { wood: 0.15 }, factor: 'forest', tools: true,
      desc: 'Рубає деревину. Чим більше лісу поруч (радіус 2), тим краще.',
      on: [T.GRASS, T.FERTILE, T.SAND, T.FOREST],
    },
    fisher: {
      name: 'Рибальня', cat: 'Видобуток', maxLevel: 3, buildTime: 20, scale: 1.1,
      cost: { wood: 25 }, workers: 2, out: { fish: 0.16 }, factor: 'water', tools: true,
      desc: 'Ловить рибу. Ставиться біля води; більше води поруч — більше улов.',
      on: [T.GRASS, T.FERTILE, T.SAND],
      near: { t: [T.WATER], r: 1, min: 1, text: 'потрібна вода поруч' },
    },
    quarry: {
      name: 'Каменоломня', cat: 'Видобуток', maxLevel: 3, buildTime: 30, scale: 1.12,
      cost: { wood: 30, gold: 20 }, workers: 3, out: { stone: 0.12 }, factor: 'hill', tools: true,
      desc: 'Добуває камінь. Ставиться на пагорб або поруч із ним.',
      on: [T.GRASS, T.FERTILE, T.SAND, T.HILL],
      near: { t: [T.HILL, T.ORE], r: 1, min: 1, text: 'потрібен пагорб поруч' },
    },
    mine: {
      name: 'Копальня', cat: 'Видобуток', maxLevel: 3, buildTime: 45, scale: 1.15, tech: 'mining',
      cost: { wood: 40, stone: 30, gold: 40 }, workers: 3, out: { iron: 0.08 }, factor: 'ore', tools: true,
      desc: 'Добуває залізо з рудних жил. Ставиться на жилу або поруч.',
      on: [T.GRASS, T.FERTILE, T.SAND, T.HILL, T.ORE],
      near: { t: [T.ORE], r: 1, min: 1, text: 'потрібна рудна жила поруч' },
    },
    sawmill: {
      name: 'Тартак', cat: 'Виробництво', maxLevel: 3, buildTime: 40, scale: 1.15, tech: 'carpentry',
      cost: { wood: 50, stone: 20, gold: 30 }, workers: 2, in: { wood: 0.2 }, out: { planks: 0.12 },
      desc: 'Розпилює деревину на дошки.',
      on: [T.GRASS, T.FERTILE, T.SAND],
    },
    bakery: {
      name: 'Млин і пекарня', cat: 'Виробництво', maxLevel: 3, buildTime: 40, scale: 1.15, tech: 'milling',
      cost: { wood: 40, stone: 40, gold: 40 }, workers: 2, in: { grain: 0.3 }, out: { bread: 0.2 },
      desc: 'Перемелює зерно і пече хліб — найпоживнішу їжу.',
      on: [T.GRASS, T.FERTILE, T.SAND],
    },
    smithy: {
      name: 'Кузня', cat: 'Виробництво', maxLevel: 3, buildTime: 50, scale: 1.15, tech: 'smithing',
      cost: { planks: 30, stone: 50, gold: 60 }, workers: 2, in: { iron: 0.1, wood: 0.1 }, out: { tools: 0.05 },
      desc: 'Кує інструменти із заліза. Інструменти дають +50% видобутку.',
      on: [T.GRASS, T.FERTILE, T.SAND],
    },
    scriptorium: {
      name: 'Скрипторій', cat: 'Громада', maxLevel: 3, buildTime: 35, scale: 1.2,
      cost: { wood: 40, gold: 30 }, workers: 2, out: { knowledge: 0.04 },
      desc: 'Писарі накопичують знання для досліджень.',
      on: [T.GRASS, T.FERTILE, T.SAND],
    },
    chapel: {
      name: 'Каплиця', cat: 'Громада', maxLevel: 3, buildTime: 40, scale: 1.3,
      cost: { wood: 30, stone: 40, gold: 50 }, workers: 1, out: { knowledge: 0.02 }, happy: 7,
      desc: 'Підіймає настрій (+7 за рівень). Священник трохи навчає людей.',
      on: [T.GRASS, T.FERTILE, T.SAND],
    },
    well: {
      name: 'Криниця', cat: 'Громада', maxLevel: 1, buildTime: 15, scale: 1.2,
      cost: { stone: 20 }, happy: 3,
      desc: '+3 до настрою. Захищає сусідні будівлі (радіус 3) від пожеж.',
      on: [T.GRASS, T.FERTILE, T.SAND],
    },
    warehouse: {
      name: 'Комора', cat: 'Громада', maxLevel: 3, buildTime: 30, scale: 1.2,
      cost: { wood: 40, stone: 20 }, storage: 300,
      desc: 'Збільшує місткість складу на 300 за рівень.',
      on: [T.GRASS, T.FERTILE, T.SAND],
    },
    market: {
      name: 'Ринок', cat: 'Громада', maxLevel: 1, unique: true, buildTime: 45, tech: 'trade',
      cost: { planks: 30, stone: 30, gold: 60 }, happy: 3,
      desc: 'Відкриває торгівлю з купцями та іншими гравцями. Податки +10%.',
      on: [T.GRASS, T.FERTILE, T.SAND],
    },
    tavern: {
      name: 'Корчма', cat: 'Громада', maxLevel: 3, buildTime: 40, scale: 1.3, tech: 'brewing',
      cost: { planks: 30, stone: 20, gold: 40 }, happy: 10, in: { grain: 0.03 }, passive: true,
      desc: '+10 до настрою за рівень, поки є зерно на пиво.',
      on: [T.GRASS, T.FERTILE, T.SAND],
    },
    herbalist: {
      name: 'Травник', cat: 'Громада', maxLevel: 1, buildTime: 30, scale: 1.3, tech: 'medicine',
      cost: { wood: 30, gold: 40 }, workers: 1, happy: 2,
      desc: 'Кожен травник із працівником зменшує втрати від чуми.',
      on: [T.GRASS, T.FERTILE, T.SAND],
    },
    barracks: {
      name: 'Казарма', cat: 'Військо', maxLevel: 3, unique: true, buildTime: 60, tech: 'military', hall: 2,
      cost: { planks: 40, stone: 60, gold: 80 },
      desc: 'Дозволяє наймати воїнів. Кожен рівень +12 місць для війська.',
      on: [T.GRASS, T.FERTILE, T.SAND],
    },
    tower: {
      name: 'Сторожова вежа', cat: 'Військо', maxLevel: 3, buildTime: 45, scale: 1.2, tech: 'fortification',
      cost: { stone: 60, planks: 20 }, workers: 2, defense: 8,
      desc: 'Кожен вартовий дає +8 до захисту села.',
      on: [T.GRASS, T.FERTILE, T.SAND, T.HILL],
    },
  };
  const B_ORDER = Object.keys(B);
  const CATS = ['Житло', 'Видобуток', 'Виробництво', 'Громада', 'Військо'];

  // Ратуша: вартість покращення до рівня L
  const HALL_UP = {
    2: { cost: { wood: 150, stone: 100, gold: 200 } },
    3: { cost: { planks: 250, stone: 350, gold: 700 }, tech: 'masonry' },
    4: { cost: { planks: 500, stone: 700, tools: 60, gold: 1500 }, tech: 'architecture' },
    5: { cost: { planks: 900, stone: 1200, tools: 150, gold: 2500 }, tech: 'architecture' },
  };
  function hallRadius(level) { return 3 + level * 2; }
  function hallStorage(level) { return 150 * (level - 1); }

  // Технології
  const TECH = {
    carpentry: { name: 'Теслярство', cost: 80, req: [], desc: 'Тартак. Покращення будівель до 2 рівня.' },
    agriculture: { name: 'Важкий плуг', cost: 120, req: [], desc: 'Поля дають +30% зерна.' },
    masonry: { name: 'Каменярство', cost: 200, req: [], desc: 'Каменоломні +40%. Будівлі 3 рівня, ратуша 3 рівня.' },
    trade: { name: 'Торгівля', cost: 220, req: ['carpentry'], desc: 'Ринок, торгівля з купцями та гравцями.' },
    mining: { name: 'Гірництво', cost: 220, req: ['carpentry'], desc: 'Копальні заліза.' },
    milling: { name: 'Млинарство', cost: 200, req: ['agriculture'], desc: 'Млин і пекарня.' },
    smithing: { name: 'Ковальство', cost: 350, req: ['mining'], desc: 'Кузня. Інструменти підсилюють видобуток.' },
    brewing: { name: 'Пивоваріння', cost: 300, req: ['milling'], desc: 'Корчма.' },
    medicine: { name: 'Травознавство', cost: 380, req: ['trade'], desc: 'Травник захищає від чуми.' },
    rotation: { name: 'Сівозміна', cost: 650, req: ['agriculture', 'milling'], desc: 'Поля дають 35% урожаю навіть узимку.' },
    military: { name: 'Військова справа', cost: 400, req: ['smithing'], desc: 'Казарма, ополченці та мечники.' },
    archery: { name: 'Стрільба з лука', cost: 500, req: ['military'], desc: 'Лучники — найкращі захисники.' },
    fortification: { name: 'Укріплення', cost: 500, req: ['military', 'masonry'], desc: 'Сторожові вежі.' },
    walls: { name: "Кам'яні мури", cost: 950, req: ['fortification'], desc: 'Захист села +30%.' },
    banking: { name: 'Лихварство', cost: 1000, req: ['trade'], desc: 'Податки +50%.' },
    architecture: { name: 'Архітектура', cost: 1250, req: ['masonry', 'carpentry', 'trade'], desc: 'Будівництво на 15% дешевше. Ратуша 4–5 рівня.' },
  };
  const TECH_ORDER = Object.keys(TECH);

  // Військо
  const UNITS = {
    militia: { name: 'Ополченець', atk: 2, def: 2, carry: 10, cost: { gold: 15, grain: 10 }, tech: 'military' },
    swordsman: { name: 'Мечник', atk: 6, def: 4, carry: 15, cost: { gold: 40, iron: 3, tools: 2 }, tech: 'military' },
    archer: { name: 'Лучник', atk: 4, def: 7, carry: 8, cost: { gold: 30, wood: 15, tools: 1 }, tech: 'archery' },
  };
  const UNIT_ORDER = Object.keys(UNITS);
  const BARRACKS_SLOTS = 12;
  const ARMY_SPEED = 0.35; // клітинок за секунду
  const NEWBIE_SHIELD = 1800; // секунд
  const RAID_SHIELD = 900;
  const LOOT_RES = ['gold', 'wood', 'stone', 'grain', 'fish', 'bread', 'planks', 'iron', 'tools'];

  // Ринок: базові ціни в золоті
  const PRICES = { wood: 1, stone: 1.5, grain: 1, fish: 1.2, bread: 3, planks: 3, iron: 5, tools: 14 };
  const MARKET_RES = Object.keys(PRICES);

  const PLAYER_COLORS = ['#c0392b', '#2471a3', '#d4ac0d', '#7d3c98', '#1e8449', '#ca6f1e', '#17a589', '#a93226'];

  // Вартість будівництва / покращення
  function buildCost(type, count, techs) {
    const d = B[type];
    const mult = Math.pow(d.scale || 1, count || 0) * (techs && techs.includes('architecture') ? 0.85 : 1);
    const c = {};
    for (const k in d.cost) c[k] = Math.ceil(d.cost[k] * mult);
    return c;
  }
  function upgradeCost(type, toLevel, techs) {
    if (type === 'hall') return Object.assign({}, HALL_UP[toLevel].cost);
    const d = B[type];
    const mult = 1.6 * (toLevel - 1) * (techs && techs.includes('architecture') ? 0.85 : 1);
    const c = {};
    for (const k in d.cost) c[k] = Math.ceil(d.cost[k] * mult);
    if (toLevel === 2) c.planks = (c.planks || 0) + 10;
    if (toLevel === 3) c.stone = (c.stone || 0) + 25;
    return c;
  }
  function upgradeTech(type, toLevel) {
    if (type === 'hall') return HALL_UP[toLevel] && HALL_UP[toLevel].tech;
    if (toLevel === 2) return 'carpentry';
    if (toLevel === 3) return 'masonry';
    return null;
  }
  function seasonOf(time) { return Math.floor(time / SEASON_LEN) % 4; }
  function yearOf(time) { return Math.floor(time / (SEASON_LEN * 4)) + 1; }

  return {
    MAP_W, MAP_H, T, TERRAIN_NAMES, LAND, RES, RES_ORDER, FOOD, BASE_CAP, GOLD_CAP,
    SEASON_LEN, SEASONS, EAT_PER_VILLAGER, EAT_PER_SOLDIER, GOLD_PER_SOLDIER, TAX, TOOL_BONUS, TOOL_USE,
    B, B_ORDER, CATS, HALL_UP, hallRadius, hallStorage, TECH, TECH_ORDER,
    UNITS, UNIT_ORDER, BARRACKS_SLOTS, ARMY_SPEED, NEWBIE_SHIELD, RAID_SHIELD, LOOT_RES,
    PRICES, MARKET_RES, PLAYER_COLORS,
    buildCost, upgradeCost, upgradeTech, seasonOf, yearOf,
  };
});
