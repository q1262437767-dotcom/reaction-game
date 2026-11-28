/* One readable device verb for each of the twenty named sections.
 * Signature rooms keep the verbs already in the engine. New story-device
 * props are optional combat moves: single-player never needs a second person,
 * and none of them add a weapon or an ending. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdventureDevices = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CATALOG = [
    { id: 'chapter1', verb: 'courtyard-wash', kind: 'chapter-wash', room: 1, label: '扳动冷水阀',
      summary: '空放能看见水冲过的地方。巡炉刀兵踩进水里才破绽。', existing: true },
    { id: 'chapter1_2', verb: 'timber-hook', kind: 'timber-winch', room: 5, label: '落吊钩',
      summary: '吊钩落空或卡住吊木守卫，都是这一节的动作。', existing: true },
    { id: 'chapter1_3', verb: 'rail-live', kind: 'rail-route', room: 3, label: '给铜轨通电',
      summary: '巡轨守卫冲过通电区会短路并露出破绽。', existing: true },
    { id: 'chapter1_4', verb: 'raise-or-breach', kind: 'route-bridge', room: 2, label: '升桥或引怪破墙',
      summary: '抬桥和引怪破墙是两条路，都留着。', existing: true },
    { id: 'chapter1_5', verb: 'garage-vent', kind: 'train-vent', room: 8, label: '车库泄压',
      summary: '用场内泄压和招架停下归炉者。', existing: true },
    { id: 'chapter2', verb: 'lamp-ward', kind: 'story-device', room: 1, x: 520, y: 340, label: '点起护火桩',
      summary: '光圈照空地也成立。雾巡卫走进光里才破绽。',
      role: 'snuff', radius: 108, duration: 2.1, cooldown: 5.2, weak: 1.6,
      sprite: 'lamp',
      start: '护火桩亮了。光圈里还没有雾巡卫。',
      hit: '雾巡卫踩进光里，吸气断了。破绽就这一会儿。',
      empty: '光灭了。这一圈没有雾巡卫走进来。' },
    { id: 'chapter2_2', verb: 'gate-slam', kind: 'story-device', room: 1, x: 560, y: 250, label: '落下夹门',
      summary: '夹门可以落空。人在门缝里才会被咬出破绽。',
      radius: 96, duration: 1.6, cooldown: 5, weak: 1.6, stun: 0.45,
      sprite: 'gate',
      start: '夹门落下来了。门缝里现在是空的。',
      hit: '夹门咬住了。破绽露出来。',
      empty: '夹门抬回去了。这一下落空。' },
    { id: 'chapter2_3', verb: 'shade-lamp', kind: 'story-device', room: 1, x: 300, y: 360, label: '举起塔上的蓝灯',
      summary: '蓝灯只抓暗栖。雾巡卫不吃这一盏。',
      role: 'shade', radius: 112, duration: 2, cooldown: 5.2, weak: 1.6,
      sprite: 'lamp',
      start: '蓝灯举起。台阶亮了，暗栖还在灯外。',
      hit: '暗栖踩进蓝光。破绽露出来。',
      empty: '蓝灯放下了。没有暗栖走进光里。' },
    { id: 'chapter2_4', verb: 'douse-cavity', kind: 'water', room: 2, label: '浇灭灯腔',
      summary: '用水浇回声的灯腔。真焰不闪，假光会抖。', existing: true },
    { id: 'chapter3', verb: 'canal-stage', kind: 'story-valve', room: 0, label: '扳动水位闸',
      summary: '涨水托箱，水满短路，放水见底。', existing: true },
    { id: 'chapter3_2', verb: 'vent-hush', kind: 'story-device', room: 1, x: 680, y: 300, label: '开一声泄压',
      summary: '泄压会惊动听声的机器，安静走过去则不会。',
      role: 'listen', radius: 100, duration: 1.4, cooldown: 6, weak: 1.5, stun: 1.1, alerts: true,
      sprite: 'vent',
      start: '泄压口嘶了一声。听声的还没靠过来。',
      hit: '听声的机器转过头来。脚步已经不算安静。破绽就这一下。',
      empty: '这一声泄空了。廊里没有机器靠近。' },
    { id: 'chapter3_3', verb: 'both-ends', kind: 'story-link', room: 1, label: '两端合闸',
      summary: '两端要在同一窗口里合上。单人时阿禾去对端。', existing: true },
    { id: 'chapter3_4', verb: 'inspection-link', kind: 'story-link', room: 1, label: '外侧合闸',
      summary: '外侧看闸，内侧看人落地。单人时阿禾执行对端。', existing: true },
    { id: 'chapter4', verb: 'low-pillar', kind: 'story-device', room: 1, x: 560, y: 320, label: '低潮撞柱',
      summary: '低潮撞柱露出完整破绽。高潮只有短促碰响。',
      kindMatch: 'pulseling', radius: 100, duration: 1.5, cooldown: 5, weak: 1.6, highWeak: 0.55,
      sprite: 'pillar-west',
      start: '低潮。柱子撞出去了，脉卒还没靠上来。',
      hit: '低潮撞上脉卒。破绽露出来了。',
      empty: '这一撞是空的。柱边没有脉卒。',
      highStart: '高潮。柱子只碰响，护板不开。',
      highHit: '高潮只碰响一下。破绽很短。' },
    { id: 'chapter4_2', verb: 'mouth-vent', kind: 'story-device', room: 4, x: 280, y: 340, label: '低潮泄炉口',
      summary: '低潮才能泄。高潮时炉口吞火，台子打不开。',
      radius: 120, duration: 1.5, cooldown: 5, weak: 1.6, refuseHigh: true,
      sprite: 'vent',
      start: '低潮。炉口泄了一口，台上还没有人。',
      hit: '泄压把炉口的人推开了。破绽露出来。',
      empty: '这一口泄空了。炉口里没有人。',
      refuse: '高潮吞火。泄压台打不开。' },
    { id: 'chapter4_3', verb: 'name-lamp', kind: 'story-device', room: 1, x: 620, y: 400, label: '点亮一格灭掉的营名',
      summary: '点营名会让靠近的脉卒露出破绽。不点也出得去。',
      kindMatch: 'pulseling', radius: 110, duration: 1.6, cooldown: 5.4, weak: 1.6,
      sprite: 'lamp',
      start: '这一格营名亮了。柜间还没有脉卒靠近。',
      hit: '灭掉的营名亮了一下。脉卒露出破绽。',
      empty: '灯灭回原样。这一格旁边没有脉卒。' },
    { id: 'chapter4_4', verb: 'bench-vent', kind: 'story-vent', room: 1, label: '在它近身时泄压',
      summary: '等总归炉者靠近泄压台，或用招架夺回主芯。', existing: true },
    { id: 'chapter5', verb: 'try-lamp', kind: 'story-trial', room: 0, label: '合上试灯闸',
      summary: '有限重明只是一次试灯。中继亮一下就退回待命，不是结局。', existing: true },
    { id: 'chapter5_2', verb: 'pulse-vent', kind: 'story-device', room: 0, x: 180, y: 470, label: '低潮泄压',
      summary: '衡石靠近、并且是低潮或授权窗口时，泄压台才给出破绽。',
      boss: true, radius: 168, duration: 1.4, cooldown: 5.5, weak: 1.6, refuseHigh: true, allowWindow: true,
      sprite: 'vent',
      start: '泄压台打开了。衡石还没站到口上。',
      hit: '衡石被泄压按住一拍。破绽露出来。',
      empty: '口上没有人。泄压白响了一声。',
      refuse: '高潮。泄压台只响，衡石不露破绽。' },
    { id: 'chapter5_3', verb: 'answer-lamps', kind: 'story-cabinet', room: 1, label: '点亮这一站',
      summary: '沿路哪些灯还回应，取决于已经写下的那一句。没有追兵。', existing: true }
  ];

  var BY_ID = {};
  CATALOG.forEach(function (entry) { BY_ID[entry.id] = entry; });

  function verb(id) { return BY_ID[id] || null; }
  function sheet(entry) { return entry && entry.sprite || 'lamp'; }

  function qualifies(enemy, spec) {
    if (!enemy || enemy.hp <= 0 || enemy.dead) return false;
    if (spec.boss) return enemy.storyBoss === true || enemy.kind === 'wardenblade';
    if (spec.role) return enemy.storyRole === spec.role;
    if (spec.kindMatch) return enemy.kind === spec.kindMatch;
    return true;
  }

  function arm(s, device, player, api) {
    var spec = BY_ID[s.chapter && s.chapter.id];
    if (!spec || spec.verb !== device.verb || spec.existing) return false;
    if (s.time < (device.readyAt || 0)) {
      s.message = '还在回压。等这一拍过去再试。';
      s.messageTime = 2;
      return false;
    }
    var high = !!(api && api.pulseHigh && api.pulseHigh());
    var windowOpen = !!(api && api.window && api.window());
    if (spec.refuseHigh && high && !(spec.allowWindow && windowOpen)) {
      s.message = spec.refuse;
      s.messageTime = 3;
      return false;
    }
    device.zoneUntil = s.time + spec.duration;
    device.readyAt = s.time + spec.cooldown;
    device.hitIds = [];
    device.flowNoted = 0;
    device.emptyNoted = 0;
    device.high = !!(spec.highWeak && high);
    device.owner = player && player.id || 'p1';
    s.message = device.high ? spec.highStart : spec.start;
    s.messageTime = 3;
    return true;
  }

  function tick(s, api) {
    if (!s || !s.chapter || !api) return;
    var devices = (s.interactables || []).filter(function (item) { return item && item.kind === 'story-device'; });
    devices.forEach(function (device) {
      var spec = BY_ID[s.chapter.id];
      if (!spec || spec.verb !== device.verb || !(device.zoneUntil > 0)) return;
      if (s.time < device.zoneUntil) {
        (s.enemies || []).forEach(function (enemy) {
          if (!qualifies(enemy, spec)) return;
          if (device.hitIds.indexOf(enemy.id) >= 0) return;
          if (api.dist(enemy, device) > spec.radius) return;
          device.hitIds.push(enemy.id);
          var weak = device.high && spec.highWeak ? spec.highWeak : spec.weak;
          api.open(enemy, device.owner || 'p1', 'device', weak);
          if (spec.stun) enemy.stun = Math.max(enemy.stun || 0, spec.stun);
          if (spec.alerts) s.chapter.alerted = true;
          if (!enemy.storyBoss) {
            var lean = enemy.x >= device.x ? 14 : -14;
            enemy.x = Math.max(48, Math.min(912, enemy.x + lean));
          }
        });
        if (device.hitIds.length && device.flowNoted !== device.zoneUntil) {
          device.flowNoted = device.zoneUntil;
          s.message = device.high && spec.highHit ? spec.highHit : spec.hit;
          s.messageTime = 3;
        }
        return;
      }
      if (device.flowNoted === device.zoneUntil || device.emptyNoted === device.zoneUntil) return;
      device.emptyNoted = device.zoneUntil;
      if (!device.hitIds.length) {
        s.message = spec.empty;
        s.messageTime = 3;
      }
    });
  }

  return { CATALOG: CATALOG, verb: verb, sheet: sheet, arm: arm, tick: tick, qualifies: qualifies };
});
