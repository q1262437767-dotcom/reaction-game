(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IdleGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_OFFLINE_MS = 8 * 60 * 60 * 1000;
  var MAX_EVENTS = 40000;
  var MAX_AMOUNT = 1000000000;
  var MAX_COINS = 1000000000000;
  var SKILLS = {
    cultivation: { name: '修炼', icon: '☯', color: '#b3a4e5', description: '吐纳天地灵气，积累修为，突破修仙境界。' },
    woodcutting: { name: '采药', icon: '🌿', color: '#7fbc92', description: '采集灵草与朱果，为炼丹和炼器准备灵材。' },
    mining: { name: '采矿', icon: '⛏️', color: '#9db4ce', description: '开采灵矿，将矿石炼成护身法器。' },
    fishing: { name: '灵植', icon: '💧', color: '#78bfd0', description: '养护灵植，收集凝结的灵露与灵泉。' },
    smithing: { name: '炼器', icon: '⚒️', color: '#e2ad73', description: '熔炼灵矿，打造飞剑与法袍。' },
    cooking: { name: '炼丹', icon: '🧪', color: '#e9c785', description: '将灵材炼成疗伤丹药，历练时自动服用。' },
    combat: { name: '历练', icon: '⚔️', color: '#db8580', description: '斩妖历练，获取灵石与秘境灵材。' }
  };
  var ITEMS = {
    wood: { name: '灵草', icon: '🌿', value: 2 },
    oak_log: { name: '朱果', icon: '🍒', value: 6 },
    copper_ore: { name: '青铜矿', icon: '🟠', value: 3 },
    iron_ore: { name: '玄铁矿', icon: '🪨', value: 6 },
    copper_bar: { name: '青铜锭', icon: '🔶', value: 8 },
    iron_bar: { name: '玄铁锭', icon: '🔩', value: 20 },
    raw_fish: { name: '灵露', icon: '💧', value: 4 },
    raw_trout: { name: '灵泉', icon: '🫧', value: 9 },
    cooked_fish: { name: '回血丹', icon: '🔴', value: 8, heal: 40 },
    cooked_trout: { name: '回春丹', icon: '🟢', value: 18, heal: 65 },
    rusty_sword: { name: '木剑', icon: '🗡️', value: 5, slot: 'weapon', attack: 2 },
    bronze_sword: { name: '青铜剑', icon: '⚔️', value: 45, slot: 'weapon', attack: 10 },
    bronze_armor: { name: '青铜法袍', icon: '🥋', value: 65, slot: 'armor', defense: 5 },
    iron_sword: { name: '玄铁剑', icon: '⚔️', value: 110, slot: 'weapon', attack: 23 },
    iron_armor: { name: '玄铁法袍', icon: '🥋', value: 155, slot: 'armor', defense: 11 },
    forest_token: { name: '妖灵晶', icon: '💚', value: 6 },
    beast_hide: { name: '妖兽皮', icon: '🐾', value: 12 },
    ancient_shard: { name: '秘境残玉', icon: '💠', value: 35 }
  };
  var ACTIONS = [
    { id: 'meditate', name: '打坐吐纳', kind: 'gather', skill: 'cultivation', level: 1, duration: 2400, xp: 10, cultivation: 4, description: '凝神静坐，吸纳天地灵气。境界越高，修为收益越多。', inputs: {}, outputs: {} },
    { id: 'meditate_cycle', name: '运转周天', kind: 'gather', skill: 'cultivation', level: 5, duration: 3000, xp: 20, cultivation: 10, description: '引灵气游走经脉，周天循环，修为积累更快。', inputs: {}, outputs: {} },
    { id: 'meditate_spirit', name: '聚灵修炼', kind: 'gather', skill: 'cultivation', level: 12, duration: 4000, xp: 40, cultivation: 24, description: '聚拢浓郁灵气，长久闭关，为高境界积累修为。', inputs: {}, outputs: {} },
    { id: 'chop_wood', name: '采集灵草', kind: 'gather', skill: 'woodcutting', level: 1, duration: 2200, xp: 8, description: '灵山脚下的常见灵草，可用于炼丹与引动炉火。', inputs: {}, outputs: { wood: 1 } },
    { id: 'chop_oak', name: '采集朱果', kind: 'gather', skill: 'woodcutting', level: 5, duration: 3000, xp: 18, description: '百年灵木结下的朱果，可炼制灵丹、助燃器炉。', inputs: {}, outputs: { oak_log: 1 } },
    { id: 'mine_copper', name: '开采青铜矿', kind: 'gather', skill: 'mining', level: 1, duration: 2400, xp: 10, description: '开采灵山浅层矿脉，准备炼制入门法器。', inputs: {}, outputs: { copper_ore: 2 } },
    { id: 'mine_iron', name: '开采玄铁矿', kind: 'gather', skill: 'mining', level: 5, duration: 3100, xp: 20, description: '深藏于灵脉中的玄铁，是上乘法器的原料。', inputs: {}, outputs: { iron_ore: 2 } },
    { id: 'catch_fish', name: '凝集灵露', kind: 'gather', skill: 'fishing', level: 1, duration: 2400, xp: 10, description: '养护洞府灵植，收集叶上凝结的灵露。', inputs: {}, outputs: { raw_fish: 1 } },
    { id: 'catch_trout', name: '汇聚灵泉', kind: 'gather', skill: 'fishing', level: 5, duration: 3300, xp: 22, description: '以灵植聚拢泉水，获得炼制高阶丹药的灵泉。', inputs: {}, outputs: { raw_trout: 1 } },
    { id: 'smelt_copper', name: '熔炼青铜锭', kind: 'craft', skill: 'smithing', level: 1, duration: 2600, xp: 12, description: '以灵草引动炉火，将矿石熔炼成青铜锭。', inputs: { copper_ore: 2, wood: 1 }, outputs: { copper_bar: 1 } },
    { id: 'forge_bronze_sword', name: '炼制青铜剑', kind: 'craft', skill: 'smithing', level: 1, duration: 3500, xp: 38, description: '为剑身注入灵气，提升斩妖攻击。', inputs: { copper_bar: 4, wood: 2 }, outputs: { bronze_sword: 1 } },
    { id: 'forge_bronze_armor', name: '炼制青铜法袍', kind: 'craft', skill: 'smithing', level: 3, duration: 3800, xp: 55, description: '编织护身灵纹，减轻妖兽攻击。', inputs: { copper_bar: 6, wood: 1 }, outputs: { bronze_armor: 1 } },
    { id: 'smelt_iron', name: '熔炼玄铁锭', kind: 'craft', skill: 'smithing', level: 5, duration: 3000, xp: 24, description: '借朱果灵火，将坚硬玄铁熔炼成器材。', inputs: { iron_ore: 2, oak_log: 1 }, outputs: { iron_bar: 1 } },
    { id: 'forge_iron_sword', name: '炼制玄铁剑', kind: 'craft', skill: 'smithing', level: 5, duration: 3800, xp: 75, description: '淬炼玄铁剑锋，深入秘境斩妖除魔。', inputs: { iron_bar: 4, oak_log: 2 }, outputs: { iron_sword: 1 } },
    { id: 'forge_iron_armor', name: '炼制玄铁法袍', kind: 'craft', skill: 'smithing', level: 8, duration: 4000, xp: 100, description: '凝练玄铁护身灵纹，抵挡秘境傀儡的重击。', inputs: { iron_bar: 6, oak_log: 2 }, outputs: { iron_armor: 1 } },
    { id: 'cook_fish', name: '炼制回血丹', kind: 'craft', skill: 'cooking', level: 1, duration: 2400, xp: 12, description: '恢复 40 气血。历练中气血不足时自动服丹。', inputs: { raw_fish: 1, wood: 1 }, outputs: { cooked_fish: 1 } },
    { id: 'cook_trout', name: '炼制回春丹', kind: 'craft', skill: 'cooking', level: 5, duration: 3000, xp: 28, description: '恢复 65 气血，也可用于辅助境界突破。', inputs: { raw_trout: 1, oak_log: 1 }, outputs: { cooked_trout: 1 } },
    { id: 'forest_slime', name: '灵山妖藤', kind: 'combat', skill: 'combat', level: 1, duration: 2400, xp: 8, description: '斩除灵山妖藤，熟悉历练并收集妖灵晶。', inputs: {}, outputs: {}, enemy: { name: '灵山妖藤', icon: '🌱', hp: 24, attack: 5, coins: 12, loot: { forest_token: 1 } } },
    { id: 'wild_boar', name: '赤瞳妖猪', kind: 'combat', skill: 'combat', level: 3, duration: 2700, xp: 12, description: '建议携带青铜法器与丹药，获取灵石和妖兽皮。', inputs: {}, outputs: {}, enemy: { name: '赤瞳妖猪', icon: '🐗', hp: 58, attack: 10, coins: 25, loot: { beast_hide: 1 } } },
    { id: 'marsh_wolf', name: '幽谷妖狼', kind: 'combat', skill: 'combat', level: 5, duration: 2900, xp: 18, description: '建议穿戴法袍，妖狼利爪会消耗不少疗伤丹。', inputs: {}, outputs: {}, enemy: { name: '幽谷妖狼', icon: '🐺', hp: 105, attack: 18, coins: 40, loot: { beast_hide: 2, forest_token: 1 } } },
    { id: 'ruin_guardian', name: '秘境傀儡', kind: 'combat', skill: 'combat', level: 8, duration: 3200, xp: 28, description: '秘境深处的上古傀儡。备好玄铁法器与足够的丹药。', inputs: {}, outputs: {}, enemy: { name: '秘境傀儡', icon: '🗿', hp: 185, attack: 27, coins: 75, loot: { ancient_shard: 1 } } }
  ];
  var SHOP = [
    { id: 'keen_axe', name: '采药玉镰', icon: '🌿', description: '所有采药行动所需时间减少 25%。永久生效。', cost: 100, type: 'upgrade', skill: 'woodcutting', multiplier: 0.75 },
    { id: 'miner_pick', name: '寻脉灵镐', icon: '⛏️', description: '所有采矿行动所需时间减少 25%。永久生效。', cost: 110, type: 'upgrade', skill: 'mining', multiplier: 0.75 },
    { id: 'fishing_rod', name: '聚露灵壶', icon: '🏺', description: '所有灵植行动所需时间减少 25%。永久生效。', cost: 90, type: 'upgrade', skill: 'fishing', multiplier: 0.75 },
    { id: 'food_bundle', name: '回血丹包', icon: '🔴', description: '以 30 灵石购买 5 枚回血丹，可重复购买。', cost: 30, type: 'item', item: 'cooked_fish', qty: 5 }
  ];
  var REALMS = [
    { id: 'qi_1', name: '炼气一层', cost: { cultivation: 0, coins: 0, items: {} }, attack: 0, defense: 0, maxHp: 100, multiplier: 1 },
    { id: 'qi_2', name: '炼气二层', cost: { cultivation: 80, coins: 0, items: {} }, attack: 1, defense: 0, maxHp: 106, multiplier: 1.25 },
    { id: 'qi_3', name: '炼气三层', cost: { cultivation: 220, coins: 0, items: {} }, attack: 2, defense: 1, maxHp: 112, multiplier: 1.6 },
    { id: 'qi_4', name: '炼气四层', cost: { cultivation: 600, coins: 0, items: {} }, attack: 3, defense: 1, maxHp: 118, multiplier: 2 },
    { id: 'qi_5', name: '炼气五层', cost: { cultivation: 1600, coins: 0, items: {} }, attack: 5, defense: 2, maxHp: 126, multiplier: 2.6 },
    { id: 'qi_6', name: '炼气六层', cost: { cultivation: 4500, coins: 0, items: {} }, attack: 7, defense: 3, maxHp: 135, multiplier: 3.4 },
    { id: 'qi_7', name: '炼气七层', cost: { cultivation: 12000, coins: 0, items: {} }, attack: 9, defense: 4, maxHp: 145, multiplier: 4.6 },
    { id: 'qi_8', name: '炼气八层', cost: { cultivation: 32000, coins: 0, items: {} }, attack: 12, defense: 5, maxHp: 158, multiplier: 6.2 },
    { id: 'qi_9', name: '炼气九层', cost: { cultivation: 85000, coins: 0, items: {} }, attack: 15, defense: 7, maxHp: 175, multiplier: 8.5 },
    { id: 'foundation', name: '筑基', cost: { cultivation: 250000, coins: 0, items: {} }, attack: 24, defense: 10, maxHp: 220, multiplier: 14 },
    { id: 'golden_core', name: '金丹', cost: { cultivation: 1000000, coins: 0, items: {} }, attack: 40, defense: 15, maxHp: 300, multiplier: 25 },
    { id: 'nascent_soul', name: '元婴', cost: { cultivation: 5000000, coins: 0, items: {} }, attack: 65, defense: 22, maxHp: 420, multiplier: 45 },
    { id: 'spirit', name: '化神', cost: { cultivation: 25000000, coins: 0, items: {} }, attack: 100, defense: 35, maxHp: 600, multiplier: 85 }
  ];
  var SIMPLE_GEAR_STEPS = [
    { id: 'easy_bronze_sword', name: '青铜剑', icon: '⚔️', description: '提升攻击，历练更快。购买后自动装备。', cost: 60, item: 'bronze_sword' },
    { id: 'easy_bronze_armor', name: '青铜法袍', icon: '🥋', description: '减少受到的伤害。购买后自动装备。', cost: 90, item: 'bronze_armor' },
    { id: 'easy_iron_sword', name: '玄铁剑', icon: '⚔️', description: '进一步提升攻击，挑战更强妖兽。购买后自动装备。', cost: 220, item: 'iron_sword' },
    { id: 'easy_iron_armor', name: '玄铁法袍', icon: '🥋', description: '以玄铁灵纹护身。购买后自动装备。', cost: 300, item: 'iron_armor' }
  ];
  var ACTION_BY_ID = Object.create(null);
  var SHOP_BY_ID = Object.create(null);
  ACTIONS.forEach(function (action) { ACTION_BY_ID[action.id] = action; });
  SHOP.forEach(function (offer) { SHOP_BY_ID[offer.id] = offer; });
  var XP_CAP = 0;
  for (var xpLevel = 1; xpLevel < 50; xpLevel++) XP_CAP += 20 + xpLevel * 10;
  var TOTAL_KEYS = ['actions', 'gathered', 'crafted', 'kills', 'foodUsed', 'defeats', 'time'];

  function emptySummary(elapsed) {
    return { elapsed: elapsed || 0, actions: 0, items: {}, coins: 0, cultivation: 0, xp: {}, kills: 0, stopped: null };
  }
  function fresh(now) {
    if (now === undefined) now = Date.now();
    var xp = {};
    Object.keys(SKILLS).forEach(function (skill) { xp[skill] = 0; });
    var totals = {};
    TOTAL_KEYS.forEach(function (key) { totals[key] = 0; });
    return {
      version: 1, updatedAt: now, coins: 25, cultivation: 0, realm: 0,
      inventory: { cooked_fish: 5, rusty_sword: 1 }, xp: xp,
      equipment: { weapon: 'rusty_sword', armor: null },
      active: null, progress: 0, hp: 100, enemyHp: 0, kills: 0,
      log: ['你踏入仙途，携一柄木剑与五枚回血丹，开始在洞府修行。'], upgrades: {}, totals: totals
    };
  }
  function level(xp) { return xpInfo(xp).level; }
  function xpInfo(xp) {
    var remaining = Math.min(XP_CAP, Math.max(0, Number(xp) || 0));
    var currentLevel = 1;
    while (currentLevel < 50 && remaining >= 20 + currentLevel * 10) {
      remaining -= 20 + currentLevel * 10;
      currentLevel++;
    }
    if (currentLevel === 50) return { level: 50, current: 0, needed: 0, percent: 100 };
    var needed = 20 + currentLevel * 10;
    return { level: currentLevel, current: remaining, needed: needed, percent: remaining / needed * 100 };
  }
  function stats(state) {
    var weapon = ITEMS[state.equipment.weapon];
    var armor = ITEMS[state.equipment.armor];
    var combatLevel = level(state.xp.combat);
    var realm = REALMS[state.realm];
    return {
      attack: 5 + realm.attack + (weapon ? weapon.attack || 0 : 0) + Math.floor((combatLevel - 1) / 3),
      defense: realm.defense + (armor ? armor.defense || 0 : 0) + Math.floor((combatLevel - 1) / 10),
      maxHp: realm.maxHp + Math.floor((combatLevel - 1) / 5) * 8
    };
  }
  function cultivationGain(state, action) {
    if (typeof action === 'string') action = ACTION_BY_ID[action];
    if (!action || !action.cultivation) return 0;
    return Math.round(action.cultivation * REALMS[state.realm].multiplier * (1 + Math.min(0.5, (level(state.xp.cultivation) - 1) * 0.01)));
  }
  function realmInfo(state) {
    var current = REALMS[state.realm];
    var next = REALMS[state.realm + 1] || null;
    var reason = '';
    if (!next) reason = '已达化神之境。';
    else if (state.cultivation < next.cost.cultivation) reason = '修为不足，还需 ' + (next.cost.cultivation - state.cultivation) + ' 修为。';
    else if (state.coins < next.cost.coins) reason = '灵石不足，还需 ' + (next.cost.coins - state.coins) + ' 灵石。';
    else {
      Object.keys(next.cost.items).some(function (id) {
        if ((state.inventory[id] || 0) < next.cost.items[id]) {
          reason = '突破需' + ITEMS[id].name + ' × ' + next.cost.items[id] + '。';
          return true;
        }
        return false;
      });
    }
    return {
      index: state.realm, current: current, next: next, cost: next ? next.cost : null,
      canBreakthrough: !!next && !reason, reason: reason,
      percent: next ? Math.min(100, state.cultivation / next.cost.cultivation * 100) : 100
    };
  }
  function breakthrough(state) {
    var info = realmInfo(state);
    if (!info.canBreakthrough) return { ok: false, reason: info.reason };
    state.cultivation -= info.cost.cultivation;
    state.coins -= info.cost.coins;
    Object.keys(info.cost.items).forEach(function (id) {
      state.inventory[id] -= info.cost.items[id];
      if (!state.inventory[id]) delete state.inventory[id];
    });
    state.realm++;
    state.hp = stats(state).maxHp;
    var message = '突破成功！你已踏入' + info.next.name + '，气血全满，修炼收益与历练属性提升。';
    addLog(state, message);
    return { ok: true, reason: message };
  }
  function duration(state, action) {
    if (typeof action === 'string') action = ACTION_BY_ID[action];
    if (!action) return 0;
    var factor = 1 - Math.min(0.15, (level(state.xp[action.skill]) - 1) * 0.005);
    SHOP.forEach(function (offer) {
      if (offer.type === 'upgrade' && offer.skill === action.skill && state.upgrades[offer.id]) factor *= offer.multiplier;
    });
    return Math.max(1000, Math.round(action.duration * factor));
  }
  function bestCultivation(state) {
    var best = null;
    var bestRate = -1;
    ACTIONS.forEach(function (action) {
      if (!action.cultivation || !canStart(state, action.id).ok) return;
      var rate = cultivationGain(state, action) / duration(state, action);
      if (rate > bestRate) { best = action; bestRate = rate; }
    });
    return best;
  }
  function recommendedCombat(state) {
    var currentStats = stats(state);
    var recovery = currentStats.maxHp * 0.2;
    var best = null;
    var bestRate = -1;
    ACTIONS.forEach(function (action) {
      if (action.kind !== 'combat' || !canStart(state, action.id).ok) return;
      var rounds = Math.ceil(action.enemy.hp / currentStats.attack);
      var damage = (rounds - 1) * Math.max(1, action.enemy.attack - currentStats.defense);
      // Each victory restores this amount, so these encounters remain sustainable without pills.
      if (damage > recovery || damage >= state.hp) return;
      var rate = action.enemy.coins / (rounds * duration(state, action));
      if (rate > bestRate) { best = action; bestRate = rate; }
    });
    return best;
  }
  function startExpedition(state) {
    // The simple home-screen action includes preparation; manual combat keeps its existing health rules.
    state.hp = stats(state).maxHp;
    var action = recommendedCombat(state);
    if (!action) return { ok: false, reason: '暂时没有适合的历练目标，提升境界或法器后再来。' };
    var result = start(state, action.id);
    if (!result.ok) return result;
    return { ok: true, reason: '已整备气血，开始历练' + action.name + '。' };
  }
  function gearPower(id) {
    var item = ITEMS[id];
    return item ? (item.attack || 0) + (item.defense || 0) : 0;
  }
  function strongestOwned(state, slot) {
    var best = state.equipment[slot] || null;
    Object.keys(ITEMS).forEach(function (id) {
      if (ITEMS[id].slot === slot && state.inventory[id] > 0 && gearPower(id) > gearPower(best)) best = id;
    });
    return best;
  }
  function upgradeInfo(state) {
    var step = 0;
    SIMPLE_GEAR_STEPS.forEach(function (offer) {
      var slot = ITEMS[offer.item].slot;
      if (gearPower(state.equipment[slot]) >= gearPower(offer.item)) step++;
    });
    // Claiming an already-owned upgrade takes priority over spending more spirit stones.
    var slots = ['weapon', 'armor'];
    for (var slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      var slot = slots[slotIndex];
      var owned = strongestOwned(state, slot);
      if (owned && gearPower(owned) > gearPower(state.equipment[slot])) {
        var ownedOffer = SIMPLE_GEAR_STEPS.filter(function (offer) { return offer.item === owned; })[0];
        if (ownedOffer) {
          return {
            next: Object.assign({}, ownedOffer, { cost: 0, owned: true }),
            canUpgrade: true, reason: '背包中已有' + ITEMS[owned].name + '，可免费穿戴。', step: step, total: SIMPLE_GEAR_STEPS.length
          };
        }
      }
    }
    for (var offerIndex = 0; offerIndex < SIMPLE_GEAR_STEPS.length; offerIndex++) {
      var offer = SIMPLE_GEAR_STEPS[offerIndex];
      var itemSlot = ITEMS[offer.item].slot;
      if (gearPower(strongestOwned(state, itemSlot)) >= gearPower(offer.item)) continue;
      var canUpgrade = state.coins >= offer.cost;
      return {
        next: Object.assign({}, offer, { owned: false }), canUpgrade: canUpgrade,
        reason: canUpgrade ? '花费 ' + offer.cost + ' 灵石，购买后自动装备。' : '还需 ' + (offer.cost - state.coins) + ' 灵石。',
        step: step, total: SIMPLE_GEAR_STEPS.length
      };
    }
    return { next: null, canUpgrade: false, reason: '法器已全部升至玄铁。', step: step, total: SIMPLE_GEAR_STEPS.length };
  }
  function upgradeEquipment(state) {
    var info = upgradeInfo(state);
    if (!info.canUpgrade || !info.next) return { ok: false, reason: info.reason };
    var offer = info.next;
    if (!offer.owned) {
      state.coins -= offer.cost;
      state.inventory[offer.item] = (state.inventory[offer.item] || 0) + 1;
    }
    var result = equip(state, offer.item);
    if (!result.ok) return result;
    var message = offer.owned ? '已免费装备' + offer.name + '。' : '花费 ' + offer.cost + ' 灵石，已装备' + offer.name + '。';
    return { ok: true, reason: message };
  }
  function addLog(state, message) {
    state.log.push(message);
    if (state.log.length > 8) state.log.splice(0, state.log.length - 8);
  }
  function canStart(state, id) {
    var action = ACTION_BY_ID[id];
    if (!action) return { ok: false, reason: '这个行动不存在。' };
    if (level(state.xp[action.skill]) < action.level) return { ok: false, reason: '需要' + SKILLS[action.skill].name + '达到 ' + action.level + ' 级。' };
    var keys = Object.keys(action.inputs);
    for (var i = 0; i < keys.length; i++) {
      var itemId = keys[i];
      if ((state.inventory[itemId] || 0) < action.inputs[itemId]) return { ok: false, reason: '材料不足：需要' + ITEMS[itemId].name + ' × ' + action.inputs[itemId] + '。' };
    }
    return { ok: true, reason: '' };
  }
  function start(state, id) {
    var allowed = canStart(state, id);
    if (!allowed.ok) return allowed;
    if (state.active && state.active.id === id) return { ok: true, reason: '正在进行这个行动。' };
    var action = ACTION_BY_ID[id];
    state.active = { kind: action.kind, id: id };
    state.progress = 0;
    state.enemyHp = action.enemy ? action.enemy.hp : 0;
    state.hp = Math.min(state.hp, stats(state).maxHp);
    addLog(state, '开始' + action.name + '。');
    return { ok: true, reason: '开始' + action.name + '。' };
  }
  function stop(state) {
    state.active = null;
    state.progress = 0;
    state.enemyHp = 0;
  }
  function changeItem(state, summary, id, amount) {
    var before = state.inventory[id] || 0;
    var after = Math.min(MAX_AMOUNT, Math.max(0, before + amount));
    var actual = after - before;
    if (after === 0) delete state.inventory[id];
    else state.inventory[id] = after;
    if (actual) summary.items[id] = (summary.items[id] || 0) + actual;
  }
  function awardXp(state, summary, skill, amount) {
    var before = state.xp[skill];
    var oldLevel = level(before);
    state.xp[skill] = Math.min(XP_CAP, before + amount);
    var actual = state.xp[skill] - before;
    if (actual) summary.xp[skill] = (summary.xp[skill] || 0) + actual;
    var newLevel = level(state.xp[skill]);
    if (newLevel > oldLevel) addLog(state, SKILLS[skill].icon + ' ' + SKILLS[skill].name + '提升至 ' + newLevel + ' 级。');
  }
  function autoEat(state, summary) {
    var maxHp = stats(state).maxHp;
    if (state.hp > maxHp * 0.55 || state.hp <= 0) return;
    var foods = ['cooked_fish', 'cooked_trout'];
    // At most a few meals are needed even at the maximum combat level.
    for (var consumed = 0; consumed < 12 && state.hp <= maxHp * 0.55; consumed++) {
      var food = null;
      for (var i = 0; i < foods.length; i++) {
        if ((state.inventory[foods[i]] || 0) > 0) { food = foods[i]; break; }
      }
      if (!food) break;
      changeItem(state, summary, food, -1);
      state.hp = Math.min(maxHp, state.hp + ITEMS[food].heal);
      state.totals.foodUsed++;
    }
  }
  function halt(state, summary, reason) {
    stop(state);
    summary.stopped = reason;
    addLog(state, reason);
  }
  function advance(state, elapsedMs) {
    var elapsed = Number(elapsedMs);
    if (!Number.isFinite(elapsed) || elapsed <= 0) return emptySummary(0);
    elapsed = Math.min(MAX_OFFLINE_MS, elapsed);
    var summary = emptySummary(elapsed);
    state.updatedAt += elapsed;
    state.totals.time = Math.min(MAX_COINS, state.totals.time + elapsed);
    if (!state.active) return summary;
    state.progress += elapsed;
    var processed = 0;
    while (state.active && processed < MAX_EVENTS) {
      var action = ACTION_BY_ID[state.active.id];
      if (!action) { halt(state, summary, '未知行动已停止。'); break; }
      var actionDuration = duration(state, action);
      if (state.progress < actionDuration) break;
      var allowed = canStart(state, action.id);
      if (!allowed.ok) { halt(state, summary, allowed.reason + '自动行动已停止。'); break; }
      state.progress -= actionDuration;
      processed++;
      state.totals.actions++;
      summary.actions++;
      if (action.kind === 'combat') {
        autoEat(state, summary);
        var currentStats = stats(state);
        state.enemyHp = Math.max(0, state.enemyHp - currentStats.attack);
        awardXp(state, summary, 'combat', action.xp);
        if (state.enemyHp === 0) {
          state.kills++;
          state.totals.kills++;
          summary.kills++;
          var gainedCoins = Math.min(MAX_COINS - state.coins, action.enemy.coins);
          state.coins += gainedCoins;
          summary.coins += gainedCoins;
          Object.keys(action.enemy.loot).forEach(function (id) { changeItem(state, summary, id, action.enemy.loot[id]); });
          awardXp(state, summary, 'combat', action.xp * 2);
          state.hp = Math.min(stats(state).maxHp, state.hp + Math.ceil(stats(state).maxHp * 0.2));
          addLog(state, '击败' + action.enemy.name + '，获得 ' + gainedCoins + ' 灵石。');
          state.enemyHp = action.enemy.hp;
        } else {
          state.hp = Math.max(0, state.hp - Math.max(1, action.enemy.attack - currentStats.defense));
          if (state.hp === 0) {
            state.totals.defeats++;
            state.hp = stats(state).maxHp;
            halt(state, summary, '你被' + action.enemy.name + '击退，已回洞府调息恢复气血。备好法器与丹药后再历练。');
          } else autoEat(state, summary);
        }
      } else {
        if (action.cultivation) {
          var gainedCultivation = Math.min(MAX_COINS - state.cultivation, cultivationGain(state, action));
          state.cultivation += gainedCultivation;
          summary.cultivation += gainedCultivation;
        }
        Object.keys(action.inputs).forEach(function (id) { changeItem(state, summary, id, -action.inputs[id]); });
        Object.keys(action.outputs).forEach(function (id) { changeItem(state, summary, id, action.outputs[id]); });
        awardXp(state, summary, action.skill, action.xp);
        if (action.kind === 'gather') state.totals.gathered++;
        else state.totals.crafted++;
        // Stop as soon as a recipe uses its last complete set of ingredients.
        var next = canStart(state, action.id);
        if (!next.ok) halt(state, summary, next.reason + '自动制作已停止。');
      }
    }
    if (processed >= MAX_EVENTS && state.active) halt(state, summary, '本次结算已达到上限，行动已暂停。');
    return summary;
  }
  function equip(state, itemId) {
    var item = ITEMS[itemId];
    if (!item || !item.slot) return { ok: false, reason: '这件物品不能装备。' };
    if (!(state.inventory[itemId] > 0)) return { ok: false, reason: '背包中没有这件装备。' };
    state.equipment[item.slot] = itemId;
    state.hp = Math.min(state.hp, stats(state).maxHp);
    addLog(state, '装备了' + item.name + '。');
    return { ok: true, reason: '已装备' + item.name + '。' };
  }
  function sell(state, itemId, qty) {
    var item = ITEMS[itemId];
    if (!item) return { ok: false, reason: '物品不存在。' };
    if (qty === undefined) qty = 1;
    if (!Number.isFinite(qty) || qty < 1) return { ok: false, reason: '出售数量需要是正整数。' };
    qty = Math.floor(qty);
    var equipped = state.equipment.weapon === itemId || state.equipment.armor === itemId ? 1 : 0;
    var available = Math.max(0, (state.inventory[itemId] || 0) - equipped);
    if (!available) return { ok: false, reason: equipped ? '正在穿戴的装备不能出售。' : '背包中没有这件物品。' };
    var sold = Math.min(available, qty);
    var gained = sold * item.value;
    if (state.coins + gained > MAX_COINS) return { ok: false, reason: '灵石已达到储存上限。' };
    state.inventory[itemId] -= sold;
    if (!state.inventory[itemId]) delete state.inventory[itemId];
    state.coins += gained;
    addLog(state, '出售' + item.name + ' × ' + sold + '，获得 ' + gained + ' 灵石。');
    return { ok: true, reason: '获得 ' + gained + ' 灵石。', sold: sold, coins: gained };
  }
  function buy(state, shopId) {
    var offer = SHOP_BY_ID[shopId];
    if (!offer) return { ok: false, reason: '商品不存在。' };
    if (offer.type === 'upgrade' && state.upgrades[shopId]) return { ok: false, reason: '这项升级已经购买。' };
    if (state.coins < offer.cost) return { ok: false, reason: '灵石不足，还需要 ' + (offer.cost - state.coins) + ' 灵石。' };
    if (offer.type === 'item' && (state.inventory[offer.item] || 0) + offer.qty > MAX_AMOUNT) return { ok: false, reason: '背包已达到这件物品的储存上限。' };
    state.coins -= offer.cost;
    if (offer.type === 'upgrade') state.upgrades[shopId] = true;
    else state.inventory[offer.item] = (state.inventory[offer.item] || 0) + offer.qty;
    addLog(state, '购买了' + offer.name + '。');
    return { ok: true, reason: '已购买' + offer.name + '。' };
  }

  function plainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  function numberField(value, name, max) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('存档中的' + name + '无效。');
    return Math.min(max, value);
  }
  function hydrate(raw, now) {
    if (now === undefined) now = Date.now();
    if (!Number.isFinite(now) || now < 0) throw new Error('当前时间无效。');
    if (raw == null) return { state: fresh(now), summary: emptySummary(0) };
    if (!plainObject(raw) || raw.version !== 1) throw new Error('不是受支持的修仙存档。');
    ['inventory', 'xp', 'equipment', 'upgrades', 'totals'].forEach(function (key) {
      if (!plainObject(raw[key])) throw new Error('存档缺少有效的' + key + '。');
    });
    if (!Array.isArray(raw.log) || raw.log.some(function (entry) { return typeof entry !== 'string'; })) throw new Error('存档中的日志无效。');
    var state = {
      version: 1,
      updatedAt: Math.min(now, numberField(raw.updatedAt, '保存时间', Number.MAX_SAFE_INTEGER)),
      coins: Math.floor(numberField(raw.coins, '灵石', MAX_COINS)),
      cultivation: Math.floor(numberField(raw.cultivation, '修为', MAX_COINS)),
      realm: numberField(raw.realm, '修仙境界', REALMS.length),
      inventory: {}, xp: {}, equipment: { weapon: null, armor: null },
      active: null, progress: numberField(raw.progress, '行动进度', MAX_OFFLINE_MS),
      hp: numberField(raw.hp, '气血', MAX_AMOUNT), enemyHp: numberField(raw.enemyHp, '妖兽气血', MAX_AMOUNT),
      kills: Math.floor(numberField(raw.kills, '击败数量', MAX_COINS)),
      log: raw.log.slice(-8).map(function (entry) { return entry.slice(0, 240); }), upgrades: {}, totals: {}
    };
    if (!Number.isInteger(raw.realm) || raw.realm < 0 || raw.realm >= REALMS.length) throw new Error('存档中的修仙境界无效。');
    Object.keys(raw.inventory).forEach(function (id) {
      if (!Object.prototype.hasOwnProperty.call(ITEMS, id)) throw new Error('存档含有未知物品。');
      var count = Math.floor(numberField(raw.inventory[id], '物品数量', MAX_AMOUNT));
      if (count > 0) state.inventory[id] = count;
    });
    Object.keys(SKILLS).forEach(function (skill) { state.xp[skill] = numberField(raw.xp[skill], '技能经验', XP_CAP); });
    ['weapon', 'armor'].forEach(function (slot) {
      var id = raw.equipment[slot];
      if (id === null) return;
      if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(ITEMS, id) || ITEMS[id].slot !== slot || !(state.inventory[id] > 0)) throw new Error('存档中的穿戴装备无效。');
      state.equipment[slot] = id;
    });
    Object.keys(raw.upgrades).forEach(function (id) {
      var offer = SHOP_BY_ID[id];
      if (!offer || offer.type !== 'upgrade' || typeof raw.upgrades[id] !== 'boolean') throw new Error('存档中的商店升级无效。');
      if (raw.upgrades[id]) state.upgrades[id] = true;
    });
    TOTAL_KEYS.forEach(function (key) { state.totals[key] = Math.floor(numberField(raw.totals[key], '累计记录', MAX_COINS)); });
    state.hp = Math.min(stats(state).maxHp, state.hp);
    if (state.hp <= 0) state.hp = stats(state).maxHp;
    if (raw.active !== null) {
      if (!plainObject(raw.active) || typeof raw.active.id !== 'string') throw new Error('存档中的行动无效。');
      var action = ACTION_BY_ID[raw.active.id];
      if (!action || raw.active.kind !== action.kind || level(state.xp[action.skill]) < action.level) throw new Error('存档中的行动尚未解锁或不存在。');
      state.active = { kind: action.kind, id: action.id };
      state.progress = Math.min(state.progress, duration(state, action) - 0.001);
      if (action.enemy) state.enemyHp = Math.min(action.enemy.hp, Math.max(1, state.enemyHp));
      else state.enemyHp = 0;
    } else {
      state.progress = 0;
      state.enemyHp = 0;
    }
    var summary = advance(state, Math.max(0, now - state.updatedAt));
    state.updatedAt = now;
    return { state: state, summary: summary };
  }

  return {
    MAX_OFFLINE_MS: MAX_OFFLINE_MS, SKILLS: SKILLS, ITEMS: ITEMS, ACTIONS: ACTIONS, SHOP: SHOP, REALMS: REALMS, SIMPLE_GEAR_STEPS: SIMPLE_GEAR_STEPS,
    fresh: fresh, level: level, xpInfo: xpInfo, stats: stats, duration: duration,
    cultivationGain: cultivationGain, realmInfo: realmInfo, breakthrough: breakthrough,
    bestCultivation: bestCultivation, recommendedCombat: recommendedCombat, startExpedition: startExpedition, upgradeInfo: upgradeInfo, upgradeEquipment: upgradeEquipment,
    canStart: canStart, start: start, stop: stop, advance: advance,
    hydrate: hydrate, equip: equip, sell: sell, buy: buy
  };
});
