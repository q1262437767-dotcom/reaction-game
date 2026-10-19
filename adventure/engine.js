(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdventureEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // A deterministic, JSON-safe simulation. Positions and aim points are world pixels;
  // step's dt is seconds. Shoot is held; dash and interact are rising-edge actions.
  var W = 960, H = 600, TAU = Math.PI * 2;
  var MISSIONS = {
    ember: { id: 'ember', name: '熄灭炉心', goal: '穿过遗迹，击败炉心守卫，带回营地灯芯', total: 1, coins: 40 },
    salvage: { id: 'salvage', name: '物资回收', goal: '搜集 3 箱补给，再到水闸撤离点按 E 撤离', total: 3, coins: 30 },
    holdout: { id: 'holdout', name: '信标守夜', goal: '启动庭院信标，守住 3 波敌人，再按 E 撤离', total: 3, coins: 35 },
    chapter1: { id: 'chapter1', name: '第一章 · 第一节 · 借火归营', goal: '进入苔火工坊，借回火种，重新点亮营地归途灯', total: 1, coins: 40 }
  };
  var CHAPTER_NOTES = {
    trail: { title: '采集队的刻痕', text: '新刻下的箭头指向工坊。字迹还很清楚：“灯灭了，我们去找备用火。若有人来，请把归途灯点亮。”' },
    cooling: { title: '停炉维修记录', text: '“主炉芯移走后，备用炉心持续过热。先打开南侧冷却水闸，再接近炉心。守卫仍执行旧命令，无法辨认来人。”' },
    'missing-core': { title: '空置的主炉芯座', text: '主炉芯座只剩被切断的铜扣，地上的搬运轨迹还很新。备用炉心代替它运转，直至过热失控。有人先一步带走了主炉芯。' }
  };
  var BUFFS = {
    pierce: { label: '穿透棱镜', description: '子弹穿透 2 个敌人；近战伤害 +1' },
    swift: { label: '疾风羽饰', description: '全队移动速度 +15%，闪避冷却缩短至 0.75 秒' },
    vigor: { label: '生命苔石', description: '全队生命上限 +1，并恢复 2 点生命；本局最多 7 点生命' },
    resonance: { label: '鸣震核心', description: '主动反击产生冲击，伤害并推开附近敌人' },
    riposte: { label: '回刃纹章', description: '连续成功招架 2 次，下一次主动反击附带范围斩击' },
    decoy: { label: '留影灯芯', description: '精准闪避或看破后留下残影，吸引敌人的下一招' }
  };
  var ROOM_DEFS = [
    { id: 'camp', name: '苔灯营地', kind: 'camp', next: 1 },
    { id: 'courtyard', name: '回声庭院', kind: 'battle', next: 2 },
    { id: 'foundry', name: '余烬工坊', kind: 'battle', next: 3 },
    { id: 'arsenal', name: '交叉军械库', kind: 'battle', next: 4 },
    { id: 'sluice', name: '水闸机关室', kind: 'puzzle', next: 6 },
    { id: 'vault', name: '隐藏星藏室', kind: 'secret', next: 6 },
    { id: 'warden', name: '炉心守卫', kind: 'boss', next: null }
  ];

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function finite(n, fallback) { return Number.isFinite(n) ? n : fallback; }
  function len(x, y) { return Math.sqrt(x * x + y * y); }
  function dist(a, b) { return len(a.x - b.x, a.y - b.y); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function random(s) {
    s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
    return s.rng / 4294967296;
  }
  function id(s, prefix) { s.serial += 1; return prefix + s.serial; }
  function event(s, type, extra) {
    var e = Object.assign({ id: id(s, 'event-'), type: type, time: s.time }, extra || {});
    s.events.push(e);
    if (s.events.length > 32) s.events.shift();
    if (/^(rhythm-windup|rhythm-beat|perfect-parry|perfect-dodge|mikiri|counterattack|guard-break|fireball-reflected|boss-phase|event-start|event-complete|supply-collected|decoy|core-throw|core-catch|core-deliver|core-knock|hunt-arrival|hunt-lured|hunt-defeated|weapon-switch|weapon-broken|ranged-block|melee-block|player-hit|enemy-hit|weakpoint-open|weakpoint-hit|posture-break|scatter-push|environment-hit)$/.test(type)) {
      s.combatEvents = s.combatEvents || [];
      s.combatEvents.push(clone(e));
      // A shotgun can land five pellets at once. Routine damage feedback may
      // never evict every precision cue before a slower guest snapshot arrives.
      if (type === 'enemy-hit') {
        var hits = s.combatEvents.filter(function (entry) { return entry.type === 'enemy-hit'; });
        if (hits.length > 6) s.combatEvents = s.combatEvents.filter(function (entry) { return entry !== hits[0]; });
      }
      if (s.combatEvents.length > 24) s.combatEvents.shift();
    }
    return e;
  }
  function particle(s, kind, x, y, extra) {
    s.particles.push(Object.assign({ id: id(s, 'fx-'), kind: kind, x: x, y: y,
      r: 10, ttl: 0.45, life: 0.45, vx: 0, vy: 0, color: '#ffd77c' }, extra || {}));
    if (s.particles.length > 180) s.particles.splice(0, s.particles.length - 180);
  }
  function burst(s, kind, x, y, color, count) {
    for (var i = 0; i < (count || 7); i += 1) {
      var a = random(s) * TAU, speed = 30 + random(s) * 100;
      particle(s, kind, x, y, { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        r: 2 + random(s) * 4, color: color });
    }
  }
  function rect(x, y, w, h) { return { x: x, y: y, w: w, h: h }; }
  function circleRect(c, r) {
    var x = clamp(c.x, r.x, r.x + r.w), y = clamp(c.y, r.y, r.y + r.h);
    return (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y) < c.r * c.r;
  }
  function alivePlayers(s) {
    return Object.keys(s.players).map(function (k) { return s.players[k]; })
      .filter(function (p) { return !p.downed; });
  }
  function solidProp(p) { return !p.destroyed && (p.kind === 'crate' || p.kind === 'barrel'); }
  function collides(s, x, y, r, ignoreId, ignoreProps) {
    var c = { x: x, y: y, r: r };
    if (x < 28 + r || x > W - 28 - r || y < 28 + r || y > H - 28 - r) return true;
    if (s.walls.some(function (wall) { return circleRect(c, wall); })) return true;
    if (s.doors.some(function (door) { return door.locked && circleRect(c, door); })) return true;
    return !ignoreProps && s.props.some(function (prop) {
      return solidProp(prop) && prop.id !== ignoreId && prop.carriedBy !== ignoreId &&
        !prop.thrown && len(x - prop.x, y - prop.y) < r + prop.r - 1;
    });
  }
  function move(s, entity, dx, dy, ignoreProps) {
    // Short substeps prevent fast dashes and thrown objects from passing thin walls.
    var n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 9));
    var moved = false;
    for (var i = 0; i < n; i += 1) {
      if (!collides(s, entity.x + dx / n, entity.y, entity.r, entity.id, ignoreProps)) {
        entity.x += dx / n; moved = true;
      }
      if (!collides(s, entity.x, entity.y + dy / n, entity.r, entity.id, ignoreProps)) {
        entity.y += dy / n; moved = true;
      }
    }
    return moved;
  }
  function player(idValue, index, weapon, rangedWeapon) {
    return { id: idValue, name: index ? '萤火搭档' : '探险队长', x: 128, y: 275 + index * 52,
      r: 14, hp: 6, maxHp: 6, weapon: weapon, color: index ? '#f5b655' : '#72dfc7',
      weapons: { melee: 'blade', ranged: rangedWeapon === 'scatter' ? 'scatter' : 'pistol' },
      activeSlot: weapon === 'blade' ? 'melee' : 'ranged', rangedBroken: false,
      prevSwitch: false, switchCd: 0, sneaking: false,
      facing: 0, vx: 0, vy: 0, moving: false, dashCd: 0, dashTime: 0, dashX: 1, dashY: 0, invuln: 0,
      fireCd: 0, downed: false, carry: null, kills: 0, prevDash: false, prevInteract: false,
      prevGuard: false, prevShoot: false, guarding: false, guardWindow: 0, guardCd: 0, guardStrain: 0,
      dashWindow: 0, dashOriginX: 0, dashOriginY: 0, counterTime: 0, counterEnemy: null,
      counterKind: '', meleeTime: 0, guardLoad: 0, guardAttackLock: 0, parryChain: 0, ward: 0, relayBoost: 0 };
  }
  function addPlayer(s, requestedId) {
    var key = requestedId || (s.players.p1 ? 'p2' : 'p1');
    if (s.players[key]) return s.players[key];
    if (Object.keys(s.players).length >= 2) return null;
    var index = Object.keys(s.players).length;
    var p = player(key, index, s.loadout === 'blade' ? 'blade' : s.rangedLoadout, s.rangedLoadout);
    if (s.runBuffs && s.runBuffs.indexOf('vigor') >= 0) p.hp = p.maxHp = 7;
    var anchor = alivePlayers(s)[0];
    if (anchor) { p.x = anchor.x; p.y = clamp(anchor.y + 40, 50, H - 50); }
    s.players[key] = p;
    s.playerCount = Object.keys(s.players).length;
    event(s, 'player-joined', { playerId: key });
    return p;
  }
  function removePlayer(s, key) {
    var p = s.players[key];
    if (!p) return false;
    releaseCarry(s, p, false, true);
    delete s.players[key];
    s.playerCount = Object.keys(s.players).length;
    event(s, 'player-left', { playerId: key });
    if (s.status === 'playing' && !alivePlayers(s).length) finish(s, 'lost');
    return true;
  }
  function create(options) {
    options = options || {};
    var seed = finite(Number(options.seed), Date.now()) >>> 0;
    var mode = options.mode === 'chapter' ? 'chapter' : options.mode === 'hunt' ? 'hunt' : options.mode === 'relay' ? 'relay' : options.mode === 'random' ? 'random' : 'story';
    var missionId = mode === 'chapter' ? 'chapter1' : mode === 'hunt' || mode === 'relay' ? 'salvage' : mode === 'random' ? 'ember' : /^(ember|salvage|holdout)$/.test(options.mission) ? options.mission : 'ember';
    var missionDef = MISSIONS[missionId];
    var s = { version: 1, combatVersion: 1, contentVersion: 1, weaponVersion: 1, tacticsVersion: 1, practice: !!options.practice, mode: mode, width: W, height: H, seed: seed, rng: seed || 1, serial: 0,
      time: 0, elapsed: 0, status: 'playing', loadout: options.practice || options.loadout === 'blade' ? 'blade' : options.loadout === 'scatter' ? 'scatter' : 'pistol',
      rangedLoadout: options.rangedLoadout === 'scatter' ? 'scatter' : options.rangedLoadout === 'pistol' ? 'pistol' : options.loadout === 'scatter' ? 'scatter' : 'pistol',
      difficulty: mode === 'chapter' || mode === 'hunt' || mode === 'relay' ? 1 : Number(options.difficulty) === 2 ? 2 : 1,
      mission: { id: missionId, name: missionDef.name, goal: missionDef.goal, progress: 0,
        total: missionDef.total, phase: 'travel', wave: 0, waves: 3, caches: [], started: false, prep: 0 },
      runBuffs: [], relicRooms: [], interactables: [], decoys: [], roomEvent: null,
      unlocks: clone(options.unlocks || {}), playerCount: 0, players: {}, enemies: [], bullets: [], props: [],
      particles: [], events: [], combatEvents: [], walls: [], doors: [], portals: [], fires: [], switches: [], pickups: [], fountains: [],
      room: null, roomData: {}, rooms: ROOM_DEFS.map(function (r, i) {
        return { index: i, id: r.id, name: r.name, kind: r.kind,
          cleared: r.kind === 'camp', visited: false, discovered: r.kind !== 'secret' };
      }), travelCd: 0, secretOpened: false, secretCleared: false, reward: null, rewardGranted: false,
      stats: { kills: 0, damage: 0, revives: 0, barrels: 0, fires: 0, rooms: 0 },
      hint: '', objective: '', message: '', messageTime: 0 };
    if (missionId === 'salvage') { s.rooms[4].name = '水闸撤离点'; s.rooms[4].kind = 'extraction'; }
    if (missionId === 'holdout') { s.rooms[1].name = '长夜信标庭院'; s.rooms[1].kind = 'holdout'; }
    addPlayer(s, 'p1');
    if (options.players === 2) addPlayer(s, 'p2');
    if (s.practice) {
      s.mode = 'story';
      s.practiceParries = 0;
      s.rooms = [{ index: 0, id: 'blade-trial', name: '听刃试炼', kind: 'practice', cleared: false, visited: false, discovered: true }];
      var master = enemy(s, 'duelist', 590, 300); master.elite = true; master.hp = master.maxHp = 36;
      s.roomData[0] = { walls: [rect(0, 0, W, 28), rect(0, H - 28, W, 28), rect(0, 0, 28, H), rect(W - 28, 0, 28, H)],
        doors: [], portals: [], props: [], enemies: [master], fires: [], switches: [], pickups: [], fountains: [], interactables: [] };
      s.mission.name = '听刃试炼'; s.mission.goal = '击败持刀守卫';
    } else if (mode === 'chapter') createChapter(s);
    else if (mode === 'hunt') createHunt(s);
    else if (mode === 'relay') createRelay(s);
    else if (mode === 'random') createExploration(s);
    enterRoom(s, 0, true);
    return s;
  }
  function createChapter(s) {
    var definitions = [
      ['归途灯营地', 'camp', 0, 0, [1]], ['工坊外庭', 'battle', 1, 0, [0, 2, 6]],
      ['苔火工坊', 'battle', 2, 0, [1, 3, 5]], ['冷却水闸', 'puzzle', 2, 1, [2, 4]],
      ['备用炉心大厅', 'boss', 3, 1, [3]], ['旧物资仓', 'battle', 2, -1, [2, 6]],
      ['失联信号台', 'battle', 1, -1, [1, 5]]
    ];
    s.chapter = { id: 'chapter1', version: 1, phase: 'depart', clues: [], sluiceOpen: false,
      bossDefeated: false, fireTaken: false, lampLit: false, suppliesTaken: false, beaconLit: false };
    s.rooms = definitions.map(function (d, i) {
      return { index: i, id: 'chapter1-' + i, name: d[0], kind: d[1], gx: d[2], gy: d[3],
        neighbors: d[4], cleared: !i, visited: false, discovered: true };
    });
    function item(data, kind, x, y, label, extra) {
      data.interactables.push(Object.assign({ id: 'chapter1-' + kind, kind: 'chapter-' + kind,
        x: x, y: y, r: 23, label: label, active: true, used: false }, extra || {}));
    }
    function note(data, clue, x, y) {
      var def = CHAPTER_NOTES[clue];
      item(data, 'note', x, y, '查看' + def.title, { id: 'chapter1-note-' + clue,
        clueId: clue, title: def.title, text: def.text });
    }
    function guard(data, kind, x, y, elite, relic) {
      var names = { chaser: '巡炉刀兵', shooter: '炉火枪兵', shield: '执盾守卫', charger: '搬运撞兽',
        duelist: '守刃监工', brute: '重装炉卫', pyromancer: '提灯司炉者', boss: '炉心守卫' };
      var foe = enemy(s, kind, x, y); foe.name = names[kind];
      if (elite) { foe.elite = true; foe.relicBuff = relic; }
      data.enemies.push(foe); return foe;
    }
    s.rooms.forEach(function (room) {
      var data = { walls: [], doors: [], portals: [], props: [], enemies: [], fires: [],
        switches: [], pickups: [], fountains: [], interactables: [] }, exits = {};
      room.neighbors.forEach(function (index) {
        var next = s.rooms[index], dx = next.gx - room.gx, dy = next.gy - room.gy;
        var direction = dx > 0 ? 'east' : dx < 0 ? 'west' : dy > 0 ? 'south' : 'north';
        exits[direction] = true;
        data.portals.push({ id: 'chapter-path-' + room.index + '-' + index, x: dx ? dx > 0 ? 884 : 76 : 480,
          y: dy ? dy > 0 ? 524 : 76 : 300, r: 27, target: index, direction: direction,
          active: index !== 4, label: next.name });
        data.doors.push({ id: 'door-' + direction, x: dx ? dx > 0 ? 916 : 28 : 436,
          y: dy ? dy > 0 ? 556 : 28 : 256, w: dx ? 16 : 88, h: dy ? 16 : 88,
          locked: index === 4, label: index === 4 ? '冷却水闸未开' : '工坊通道' });
      });
      ['north', 'south'].forEach(function (edge) {
        var y = edge === 'north' ? 0 : H - 28;
        if (exits[edge]) data.walls.push(rect(0, y, 424, 28), rect(536, y, W - 536, 28));
        else data.walls.push(rect(0, y, W, 28));
      });
      ['west', 'east'].forEach(function (edge) {
        var x = edge === 'west' ? 0 : W - 28;
        if (exits[edge]) data.walls.push(rect(x, 0, 28, 244), rect(x, 356, 28, H - 356));
        else data.walls.push(rect(x, 0, 28, H));
      });
      if (room.index === 0) {
        data.walls.push(rect(390, 120, 120, 45), rect(390, 435, 120, 45));
        item(data, 'lamp', 450, 300, '点亮归途灯', { active: false,
          description: '守灯人：请从苔火工坊借回备用火，给采集队照亮回来的路。' });
      } else if (room.index === 1) {
        data.walls.push(rect(390, 130, 55, 100));
        data.props.push(prop(s, 'crate', 370, 390), prop(s, 'barrel', 670, 425));
        guard(data, 'chaser', 610, 140); guard(data, 'shooter', 745, 440);
        guard(data, 'duelist', 710, 290, true, 'riposte');
        note(data, 'trail', 290, 150);
      } else if (room.index === 2) {
        data.walls.push(rect(330, 140, 65, 105), rect(600, 365, 65, 105));
        data.props.push(prop(s, 'crate', 330, 325), prop(s, 'barrel', 650, 250));
        guard(data, 'shield', 680, 165); guard(data, 'shooter', 760, 440); guard(data, 'charger', 480, 180);
        note(data, 'cooling', 440, 425);
      } else if (room.index === 3) {
        data.walls.push(rect(350, 130, 80, 70));
        data.props.push(prop(s, 'crate', 420, 450), prop(s, 'barrel', 670, 350));
        guard(data, 'pyromancer', 720, 170, true, 'resonance');
        data.fires.push({ id: 'chapter-cooling-fire', x: 810, y: 300, r: 38, active: true, chapterCooling: true });
        item(data, 'sluice', 480, 355, '打开冷却水闸', { description: '冷却水道干涸，炉心通路被热浪封住。' });
      } else if (room.index === 4) {
        data.walls.push(rect(300, 145, 66, 70), rect(604, 385, 66, 70));
        data.props.push(prop(s, 'barrel', 360, 420), prop(s, 'barrel', 650, 170));
        guard(data, 'boss', 680, 300);
        note(data, 'missing-core', 370, 165);
        item(data, 'fire', 680, 300, '借取备用火种', { active: false,
          description: '先稳定暴走的炉心守卫，再取出可携带的备用火种。' });
      } else if (room.index === 5) {
        data.walls.push(rect(310, 160, 65, 95), rect(580, 365, 65, 95));
        data.props.push(prop(s, 'crate', 320, 360), prop(s, 'barrel', 650, 300));
        guard(data, 'brute', 700, 210, true, 'vigor');
        item(data, 'supplies', 470, 370, '取用药物补给', { description: '全队恢复 3 点生命，只能取用一次。' });
      } else {
        data.walls.push(rect(360, 125, 70, 100));
        data.props.push(prop(s, 'crate', 570, 380), prop(s, 'barrel', 680, 200));
        guard(data, 'chaser', 690, 420); guard(data, 'shooter', 730, 160);
        item(data, 'beacon', 440, 350, '接通信号台', { description: '全队获得一次护盾；旧线路通向营地。' });
      }
      data.enemies.forEach(function (foe) { placeEnemyInRoom(data, foe); });
      s.roomData[room.index] = data;
    });
  }
  function syncChapter(s) {
    var c = s.chapter;
    if (s.status === 'playing') c.phase = c.fireTaken ? 'return' : c.sluiceOpen ? 'core' :
      c.phase !== 'depart' || s.room.index !== 0 ? 'workshop' : 'depart';
    s.mission.phase = c.phase; s.mission.progress = c.lampLit ? 1 : 0;
    s.portals.forEach(function (gate) { gate.active = gate.target !== 4 || c.sluiceOpen; });
    s.doors.forEach(function (door) { door.locked = s.room.index === 3 && door.id === 'door-east' && !c.sluiceOpen; });
    s.fires.forEach(function (fire) { if (fire.chapterCooling && c.sluiceOpen) fire.active = false; });
    s.interactables.forEach(function (q) {
      if (q.kind === 'chapter-note') q.used = c.clues.indexOf(q.clueId) >= 0;
      if (q.kind === 'chapter-lamp') { q.used = c.lampLit; q.active = c.fireTaken && !q.used; }
      if (q.kind === 'chapter-fire') { q.used = c.fireTaken; q.active = c.bossDefeated && !q.used; }
      if (q.kind === 'chapter-sluice') q.used = c.sluiceOpen;
      if (q.kind === 'chapter-supplies') q.used = c.suppliesTaken;
      if (q.kind === 'chapter-beacon') q.used = c.beaconLit;
      if (q.kind.indexOf('chapter-') === 0 && q.used) q.active = false;
      if (q.kind === 'relic' && s.runBuffs.indexOf(q.buff) >= 0) { q.used = true; q.active = false; }
    });
  }
  function interactChapter(s, p, target) {
    var c = s.chapter;
    if (!c || target.kind.indexOf('chapter-') !== 0 || target.used || !target.active) return false;
    target.used = true; target.active = false;
    if (target.kind === 'chapter-note') {
      if (c.clues.indexOf(target.clueId) < 0) c.clues.push(target.clueId);
      event(s, 'chapter-note', { clueId: target.clueId, title: target.title, text: target.text,
        playerId: p.id, x: target.x, y: target.y });
      s.message = target.title + '：' + target.text;
    } else {
      if (target.kind === 'chapter-sluice') {
        c.sluiceOpen = true;
        s.fires.forEach(function (f) { if (f.chapterCooling && f.active) { f.active = false; s.stats.fires += 1; burst(s, 'steam', f.x, f.y, '#b4d6d6', 14); } });
        s.message = '冷却水重新流动，热浪退去了。备用炉心的轰鸣从东侧传来。';
      } else if (target.kind === 'chapter-fire') {
        c.fireTaken = true;
        s.message = '备用火种已装入提灯。沿原路返回营地，采集队还在等归途灯。';
        burst(s, 'heal', target.x, target.y, '#ffd77c', 16);
      } else if (target.kind === 'chapter-lamp') {
        c.lampLit = true; c.phase = 'complete';
        event(s, 'chapter-lamp', { playerId: p.id, x: target.x, y: target.y });
        burst(s, 'heal', target.x, target.y, '#ffd77c', 30); finish(s, 'won');
        return true;
      } else if (target.kind === 'chapter-supplies') {
        c.suppliesTaken = true;
        alivePlayers(s).forEach(function (q) { q.hp = Math.min(q.maxHp, q.hp + 3); });
        s.message = '取出尚未损坏的药物，全队恢复 3 点生命。这些物资也能帮营地渡过今夜。';
        burst(s, 'heal', target.x, target.y, '#8ce6b0', 15);
      } else if (target.kind === 'chapter-beacon') {
        c.beaconLit = true; alivePlayers(s).forEach(function (q) { q.ward = 1; });
        s.message = '旧线路接通了。守灯人的声音传来：“我们看见信号了，等你们带火回来。”全队获得一次护盾。';
        burst(s, 'heal', target.x, target.y, '#a5f6e4', 15);
      } else return false;
      event(s, target.kind, { playerId: p.id, x: target.x, y: target.y });
    }
    s.messageTime = target.kind === 'chapter-note' ? 8 : 5;
    syncChapter(s); setHint(s); return true;
  }
  function createRelay(s) {
    s.mission.name = '接力夺宝'; s.mission.goal = '带回炉芯，在苔灯撤离站按 E 交付';
    s.mission.total = 1; s.mission.phase = 'search';
    s.rooms = ['苔灯撤离站', '断桥庭院', '炉芯密库'].map(function (name, i) {
      return { index: i, id: 'relay-' + i, name: name, kind: i ? 'battle' : 'extraction',
        gx: i, gy: 0, neighbors: i === 1 ? [0, 2] : [1], cleared: !i,
        visited: false, discovered: true };
    });
    s.relay = { coreId: '', coreRoom: 2, extractionRoom: 0, delivered: false, throws: 0, catches: 0, perfectCatches: 0 };
    s.rooms.forEach(function (room) {
      var data = { walls: [rect(0, 0, W, 28), rect(0, H - 28, W, 28), rect(0, 0, 28, H), rect(W - 28, 0, 28, H)],
        doors: [], portals: [], props: [], enemies: [], fires: [], switches: [], pickups: [], fountains: [], interactables: [] };
      if (room.index < 2) data.portals.push({ id: 'relay-east-' + room.index, x: 884, y: 300, r: 26,
        target: room.index + 1, active: true, label: s.rooms[room.index + 1].name });
      if (room.index > 0) data.portals.push({ id: 'relay-west-' + room.index, x: 76, y: 300, r: 26,
        target: room.index - 1, active: true, back: true, label: s.rooms[room.index - 1].name });
      if (room.index === 0) {
        data.walls.push(rect(410, 130, 120, 45), rect(410, 425, 120, 45));
        data.interactables.push({ id: 'relay-exit', kind: 'relay-extraction', x: 120, y: 300, r: 34,
          active: true, used: false, label: '交付炉芯', description: '携带炉芯时按 E 交付' });
      } else if (room.index === 1) {
        data.walls.push(rect(380, 110, 55, 145), rect(570, 345, 55, 145));
        data.props.push(prop(s, 'crate', 490, 170), prop(s, 'barrel', 480, 445));
        data.enemies.push(enemy(s, 'chaser', 610, 200), enemy(s, 'shooter', 750, 410));
        data.pickups.push({ id: id(s, 'pickup-'), kind: 'heart', x: 500, y: 300, r: 14, amount: 2 });
      } else {
        data.walls.push(rect(360, 105, 70, 115), rect(360, 380, 70, 115));
        data.enemies.push(enemy(s, 'chaser', 610, 165), enemy(s, 'chaser', 620, 440));
        var sentinel = enemy(s, 'duelist', 805, 300); sentinel.hp = sentinel.maxHp = 14;
        data.enemies.push(sentinel);
        var core = prop(s, 'core', 720, 300);
        core.r = 14; core.hp = core.maxHp = 1; core.flightTime = 0; core.catchLock = 0;
        core.knockCd = 0; core.thrower = null; core.hitIds = [];
        data.props.push(core); s.relay.coreId = core.id;
        data.pickups.push({ id: id(s, 'pickup-'), kind: 'heart', x: 500, y: 300, r: 14, amount: 2 });
      }
      s.roomData[room.index] = data;
    });
  }
  function createHunt(s) {
    var cells = [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [0, 1]];
    var names = ['苔灯哨站', '旧木场', '火药回廊', '苔火猎窝', '断柱庭院', '回声水道'];
    s.mission.name = '苔火猎场'; s.mission.goal = '循着足迹与声音，击败逐迹巨兽';
    s.mission.total = 1; s.mission.phase = 'track';
    s.rooms = cells.map(function (cell, i) {
      return { index: i, id: 'hunt-' + i, name: names[i], kind: i ? 'hunt' : 'camp',
        gx: cell[0], gy: cell[1], neighbors: [(i + 5) % 6, (i + 1) % 6],
        cleared: false, visited: false, discovered: true };
    });
    s.hunt = { targetId: '', targetRoom: 3, defeated: false, previousRoom: null,
      lastSeenRoom: null, lastSeenAt: 0, heardFrom: null, tracks: [],
      noiseRoom: null, noiseAt: 0, noiseLevel: 0, roamTimer: 6, lures: 0,
      arrival: null, lastLureAt: 0, stepAt: { p1: 0 } };
    if (s.players.p2) s.hunt.stepAt.p2 = 0;
    s.rooms.forEach(function (room) {
      var data = { walls: [rect(0, 0, W, 28), rect(0, H - 28, W, 28), rect(0, 0, 28, H), rect(W - 28, 0, 28, H)],
        doors: [], portals: [], props: [], enemies: [], fires: [], switches: [], pickups: [], fountains: [], interactables: [] };
      room.neighbors.forEach(function (next) {
        var dest = s.rooms[next], dx = dest.gx - room.gx, dy = dest.gy - room.gy;
        data.portals.push({ id: 'hunt-door-' + room.index + '-' + next,
          x: dx ? dx > 0 ? 884 : 76 : 480, y: dy ? dy > 0 ? 524 : 76 : 300,
          r: 27, target: next, active: true, label: names[next] });
      });
      // Wide central lanes keep every portal reachable for both the players and
      // the large hunter. Cover is useful, but never seals a whole corridor.
      if (room.index % 2) data.walls.push(rect(350, 132, 70, 100), rect(550, 368, 70, 100));
      else data.walls.push(rect(350, 148, 130, 42), rect(480, 410, 130, 42));
      data.props.push(prop(s, 'barrel', 660, 270), prop(s, 'barrel', 300, 330), prop(s, 'crate', 480, 225));
      if (room.index === 2 || room.index === 5) data.enemies.push(enemy(s, 'chaser', 700, 435));
      if (room.index === 0 || room.index === 3 || room.index === 5) {
        data.pickups.push({ id: id(s, 'pickup-'), kind: 'heart', x: 480, y: 345, r: 14, amount: 2 });
      }
      if (room.index === 3) {
        var target = enemy(s, 'brute', 690, 300);
        target.huntTarget = true; target.name = '逐迹巨兽'; target.elite = true;
        target.hp = target.maxHp = s.playerCount > 1 ? 54 : 38;
        target.speed = 82; target.attackCd = 1.1;
        data.enemies.push(target); s.hunt.targetId = target.id;
      }
      data.enemies.forEach(function (foe) { placeEnemyInRoom(data, foe); });
      s.roomData[room.index] = data;
    });
    // An old, readable trail gives the first hunt a direction before the beast
    // starts roaming. New tracks later reveal its actual path, not its future.
    [0, 1, 2].forEach(function (from) { huntTrack(s, from, from + 1, from); });
  }
  function huntDistance(s, from, to) {
    var queue = [{ room: from, distance: 0 }], seen = {};
    seen[from] = true;
    for (var i = 0; i < queue.length; i += 1) {
      var current = queue[i];
      if (current.room === to) return current.distance;
      s.rooms[current.room].neighbors.forEach(function (next) {
        if (!seen[next]) { seen[next] = true; queue.push({ room: next, distance: current.distance + 1 }); }
      });
    }
    return Infinity;
  }
  function huntTrack(s, from, to, roomIndex) {
    var source = s.rooms[from], dest = s.rooms[to], room = s.rooms[roomIndex];
    var dx = dest.gx - source.gx, dy = dest.gy - source.gy;
    var entering = roomIndex === to;
    var x = dx ? dx > 0 ? entering ? 132 : 828 : entering ? 828 : 132 : 480;
    var y = dy ? dy > 0 ? entering ? 132 : 468 : entering ? 468 : 132 : 300;
    if (!room || room.neighbors.indexOf(entering ? from : to) < 0) return;
    s.hunt.tracks.push({ room: roomIndex, from: from, to: to, x: x, y: y, time: s.time });
    if (s.hunt.tracks.length > 24) s.hunt.tracks.shift();
  }
  function huntNoise(s, level, x, y) {
    if (s.mode !== 'hunt' || s.hunt.defeated || s.status !== 'playing') return;
    var run = s.hunt, room = s.room.index;
    if (huntDistance(s, run.targetRoom, room) > level) return;
    // Nearby footsteps cannot erase a shot or explosion from the next room.
    if (level < run.noiseLevel && s.time - run.noiseAt < 2.2) return;
    var newLure = level >= 2 && run.targetRoom !== room &&
      (run.noiseRoom !== room || s.time - run.lastLureAt >= 5);
    run.noiseRoom = room; run.noiseAt = s.time; run.noiseLevel = level;
    if (newLure) {
      run.lures += 1; run.lastLureAt = s.time;
      event(s, 'hunt-lured', { room: room, x: x, y: y, level: level });
    }
  }
  function huntEnemy(s) {
    var data = s.hunt.targetRoom === s.room.index ? s : s.roomData[s.hunt.targetRoom];
    return data && data.enemies.find(function (e) { return e.id === s.hunt.targetId && e.huntTarget && e.hp > 0; });
  }
  function moveHunter(s, to) {
    var run = s.hunt, from = run.targetRoom;
    if (from === s.room.index || s.rooms[from].neighbors.indexOf(to) < 0) return false;
    var source = s.roomData[from], destination = to === s.room.index ? s : s.roomData[to];
    var target = huntEnemy(s);
    if (!source || !destination || !target) return false;
    var oldX = target.x, oldY = target.y;
    var dx = s.rooms[to].gx - s.rooms[from].gx, dy = s.rooms[to].gy - s.rooms[from].gy;
    target.x = dx ? dx > 0 ? 122 : W - 122 : 480;
    target.y = dy ? dy > 0 ? 122 : H - 122 : 300;
    if (!placeEnemyInRoom(destination, target, to === s.room.index ? alivePlayers(s) : [])) {
      target.x = oldX; target.y = oldY; return false;
    }
    source.enemies = source.enemies.filter(function (e) { return e.id !== target.id; });
    target.rhythm = null; target.windup = 0; target.chargeTime = 0; target.stagger = 0; target.weakTime = 0;
    target.attackCd = 1.25; target.navTime = 0; target.navX = target.x; target.navY = target.y;
    destination.enemies.push(target);
    run.previousRoom = from; run.targetRoom = to; run.roamTimer = 6; run.arrival = null;
    huntTrack(s, from, to, from); huntTrack(s, from, to, to);
    run.heardFrom = s.rooms[s.room.index].neighbors.indexOf(to) >= 0 ? to : null;
    if (to === s.room.index) {
      if (alivePlayers(s).some(function (p) { return lineClear(s, p, target, 2); })) {
        run.lastSeenRoom = to; run.lastSeenAt = s.time;
      }
      run.heardFrom = null;
      s.message = '逐迹巨兽循声而至'; s.messageTime = 2;
    }
    return true;
  }
  function updateHunt(s, dt) {
    if (s.mode !== 'hunt' || s.hunt.defeated || s.status !== 'playing') return;
    var run = s.hunt, target = huntEnemy(s);
    run.tracks = run.tracks.filter(function (track) { return s.time - track.time < 90; }).slice(-24);
    if (s.time - run.noiseAt > 8) { run.noiseRoom = null; run.noiseLevel = 0; }
    if (!target) return;
    if (run.targetRoom === s.room.index) {
      run.arrival = null; run.roamTimer = 6; run.heardFrom = null;
      if (alivePlayers(s).some(function (p) { return lineClear(s, p, target, 2); })) {
        run.lastSeenRoom = s.room.index; run.lastSeenAt = s.time;
      }
      return;
    }
    if (run.heardFrom !== null && s.rooms[s.room.index].neighbors.indexOf(run.heardFrom) < 0) run.heardFrom = null;
    if (run.arrival) {
      run.arrival.remaining = Math.max(0, run.arrival.remaining - dt);
      if (run.arrival.remaining <= 0) moveHunter(s, run.arrival.to);
      return;
    }
    run.roamTimer = Math.max(0, run.roamTimer - dt);
    if (run.roamTimer > 0) return;
    var neighbors = s.rooms[run.targetRoom].neighbors;
    var destination;
    if (run.noiseRoom !== null && run.noiseRoom !== run.targetRoom && s.time - run.noiseAt <= 8) {
      destination = neighbors.slice().sort(function (a, b) {
        return huntDistance(s, a, run.noiseRoom) - huntDistance(s, b, run.noiseRoom) || a - b;
      })[0];
    } else {
      var options = neighbors.filter(function (n) { return n !== run.previousRoom; });
      destination = options[Math.floor(random(s) * options.length)];
    }
    if (destination === s.room.index) {
      var door = s.portals.find(function (gate) { return gate.target === run.targetRoom; });
      run.arrival = { from: run.targetRoom, to: destination, remaining: 1.15, duration: 1.15 };
      run.heardFrom = run.targetRoom;
      s.message = '门后传来沉重脚步'; s.messageTime = 1.2;
      event(s, 'hunt-arrival', { from: run.targetRoom, to: destination, room: destination,
        x: door ? door.x : 480, y: door ? door.y : 300, duration: 1.15 });
    } else moveHunter(s, destination);
  }
  function createExploration(s) {
    // A small polyomino begins with one loop, then grows in a different shape
    // for each seed. Every touching pair of cells has a two-way doorway.
    var cells = [[0, 0], [1, 0], [1, 1], [0, 1]], occupied = {};
    var vectors = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    cells.forEach(function (c) { occupied[c.join(',')] = true; });
    while (cells.length < 12) {
      var candidates = [];
      cells.forEach(function (c) {
        vectors.forEach(function (v) {
          var n = [c[0] + v[0], c[1] + v[1]];
          if (!occupied[n.join(',')] && Math.abs(n[0]) <= 3 && Math.abs(n[1]) <= 3) candidates.push(n);
        });
      });
      var selected = candidates[Math.floor(random(s) * candidates.length)];
      occupied[selected.join(',')] = true; cells.push(selected);
    }
    var lookup = {};
    cells.forEach(function (c, i) { lookup[c.join(',')] = i; });
    s.rooms = cells.map(function (c, i) {
      var neighbors = [];
      vectors.forEach(function (v) {
        var n = lookup[[c[0] + v[0], c[1] + v[1]].join(',')];
        if (n !== undefined) neighbors.push(n);
      });
      return { index: i, id: 'ruin-' + i, name: i ? '迷雾遗迹' : '远征入口', kind: i ? 'battle' : 'camp',
        gx: c[0], gy: c[1], neighbors: neighbors, cleared: !i, visited: false, discovered: !i, elite: false };
    });
    var distances = { 0: 0 }, queue = [0];
    for (var head = 0; head < queue.length; head += 1) {
      s.rooms[queue[head]].neighbors.forEach(function (n) {
        if (distances[n] === undefined) { distances[n] = distances[queue[head]] + 1; queue.push(n); }
      });
    }
    s.bossIndex = queue.reduce(function (best, n) { return distances[n] >= distances[best] ? n : best; }, 0);
    s.rooms[s.bossIndex].kind = 'boss'; s.rooms[s.bossIndex].name = '沉眠炉心';
    var battleRooms = s.rooms.filter(function (r) { return r.kind === 'battle'; });
    for (var i = battleRooms.length - 1; i > 0; i -= 1) {
      var j = Math.floor(random(s) * (i + 1)), swap = battleRooms[i]; battleRooms[i] = battleRooms[j]; battleRooms[j] = swap;
    }
    var relicPool = Object.keys(BUFFS);
    for (var b = relicPool.length - 1; b > 0; b -= 1) {
      var k = Math.floor(random(s) * (b + 1)), relic = relicPool[b]; relicPool[b] = relicPool[k]; relicPool[k] = relic;
    }
    battleRooms.slice(0, 3).forEach(function (r, index) {
      r.elite = true; r.eliteKind = ['duelist', 'brute', 'pyromancer'][index]; r.eliteBuff = relicPool[index];
    });
    battleRooms.slice(3, 5).forEach(function (r, index) { r.eventKind = index ? 'lift' : 'sluice'; });
    s.exploration = { kills: 0, target: 0, totalEnemies: 0, bossAwake: false, bossSpawned: false, bossDefeated: false };
    s.rooms.forEach(function (r) {
      var data = randomRoomContent(s, r);
      s.roomData[r.index] = data;
      s.exploration.totalEnemies += data.enemies.length;
    });
    s.exploration.target = Math.ceil(s.exploration.totalEnemies * 0.6);
    s.mission.name = '迷雾远征'; s.mission.goal = '探索遗迹，唤醒并击败炉心守卫';
    s.mission.total = s.exploration.target; s.mission.phase = 'explore';
  }
  function randomRoomContent(s, room) {
    var data = { walls: [],
      doors: [], portals: [], props: [], enemies: [], fires: [], switches: [], pickups: [], fountains: [], interactables: [] };
    var exits = { north: false, east: false, south: false, west: false };
    room.neighbors.forEach(function (index) {
      var next = s.rooms[index], dx = next.gx - room.gx, dy = next.gy - room.gy;
      var direction = dx > 0 ? 'east' : dx < 0 ? 'west' : dy > 0 ? 'south' : 'north';
      exits[direction] = true;
      var x = dx > 0 ? 884 : dx < 0 ? 76 : 480, y = dy > 0 ? 524 : dy < 0 ? 76 : 300;
      data.portals.push({ id: 'path-' + room.index + '-' + index, x: x, y: y, r: 27,
        target: index, direction: direction, active: true, label: next.kind === 'boss' ? '炉心' : '遗迹通道' });
      data.doors.push({ id: 'door-' + direction, x: dx ? dx > 0 ? 916 : 28 : 436,
        y: dy ? dy > 0 ? 556 : 28 : 256, w: dx ? 16 : 88, h: dy ? 16 : 88, locked: false, label: '通道' });
    });
    // The visible wall is genuinely interrupted at each connected doorway.
    ['north', 'south'].forEach(function (edge) {
      var y = edge === 'north' ? 0 : H - 28;
      if (exits[edge]) data.walls.push(rect(0, y, 424, 28), rect(536, y, W - 536, 28));
      else data.walls.push(rect(0, y, W, 28));
    });
    ['west', 'east'].forEach(function (edge) {
      var x = edge === 'west' ? 0 : W - 28;
      if (exits[edge]) data.walls.push(rect(x, 0, 28, 244), rect(x, 356, 28, H - 356));
      else data.walls.push(rect(x, 0, 28, H));
    });
    if (!room.index) {
      data.props.push(prop(s, 'crate', 320, 230), prop(s, 'barrel', 650, 380), prop(s, 'water', 320, 380));
      data.fountains.push({ id: id(s, 'spring-'), x: 320, y: 380, r: 25 });
      return data;
    }
    if (room.kind === 'boss') {
      data.walls.push(rect(290, 150, 66, 70), rect(604, 380, 66, 70));
      data.props.push(prop(s, 'barrel', 340, 400), prop(s, 'barrel', 640, 200));
      return data;
    }
    var variant = Math.floor(random(s) * 4);
    room.template = variant;
    var layouts = [[], [rect(305, 140, 62, 90), rect(593, 370, 62, 90)],
      [rect(260, 150, 130, 45), rect(570, 405, 130, 45)],
      [rect(295, 380, 70, 85), rect(595, 135, 70, 85)]];
    data.walls = data.walls.concat(layouts[variant]);
    data.props.push(prop(s, 'crate', 330, 345), prop(s, 'barrel', 640, 345));
    if (variant === 2) {
      data.props.push(prop(s, 'water', 330, 425));
      data.fountains.push({ id: id(s, 'spring-'), x: 330, y: 425, r: 25 });
      data.fires.push({ id: id(s, 'fire-'), x: 690, y: 215, r: 27, active: true });
      room.name = '漏水工坊';
    } else room.name = ['回声庭院', '破碎回廊', '余烬工坊', '交叉军械库'][variant];
    var spots = [[690, 140], [740, 435], [235, 400], [230, 170]];
    var kinds = ['chaser', 'shooter', 'shield', 'charger'];
    var count = 3 + (random(s) < 0.5 ? 1 : 0);
    for (var n = 0; n < count; n += 1) {
      var foe = enemy(s, room.elite && !n ? room.eliteKind || 'duelist' : kinds[Math.floor(random(s) * kinds.length)], spots[n][0], spots[n][1]);
      if (room.elite && !n) {
        foe.elite = true; foe.relicBuff = room.eliteBuff;
        foe.hp = foe.maxHp = foe.maxHp + 5; foe.r += 4; foe.speed *= 1.08;
      }
      data.enemies.push(foe);
    }
    if (room.eventKind) {
      data.roomEvent = { kind: room.eventKind, stage: 'ready', enemyIds: [], collected: false };
      data.interactables.push({ id: 'event-' + room.index, kind: room.eventKind, x: 480, y: 440, r: 25,
        label: room.eventKind === 'sluice' ? '开启水闸' : '启动升降台', active: true, used: false });
      if (room.eventKind === 'sluice') {
        room.name = '失压水闸';
        var barrier = rect(430, 215, 100, 42); barrier.eventBarrier = true; data.walls.push(barrier);
        data.fires.push({ id: id(s, 'fire-'), x: 480, y: 288, r: 34, active: true, sluiceFire: true });
      } else room.name = '遗落升降台';
    }
    data.enemies.forEach(function (foe) { placeEnemyInRoom(data, foe); });
    return data;
  }
  function placeEnemyInRoom(data, foe, players) {
    function free(x, y) {
      var point = { x: x, y: y, r: foe.r };
      return x >= 30 + foe.r && x <= W - 30 - foe.r && y >= 30 + foe.r && y <= H - 30 - foe.r &&
        !data.walls.some(function (w) { return circleRect(point, w); }) &&
        !data.doors.some(function (w) { return w.locked && circleRect(point, w); }) &&
        !data.props.some(function (q) { return solidProp(q) && dist(point, q) < foe.r + q.r + 3; }) &&
        !data.enemies.some(function (q) { return q !== foe && q.hp > 0 && dist(point, q) < foe.r + q.r + 4; }) &&
        !(players || []).some(function (p) { return dist(point, p) < foe.r + p.r + 48; });
    }
    var x = foe.x, y = foe.y;
    if (free(x, y)) return true;
    for (var radius = 24; radius <= 240; radius += 24) {
      for (var angle = 0; angle < 16; angle += 1) {
        var px = x + Math.cos(angle * TAU / 16) * radius, py = y + Math.sin(angle * TAU / 16) * radius;
        if (free(px, py)) { foe.x = px; foe.y = py; return true; }
      }
    }
    for (var gy = 90; gy <= 510; gy += 40) for (var gx = 90; gx <= 870; gx += 40) {
      if (free(gx, gy)) { foe.x = gx; foe.y = gy; return true; }
    }
    return false;
  }
  function awakenBoss(s) {
    var run = s.exploration;
    if (!run || run.bossAwake || run.kills < run.target) return;
    run.bossAwake = true; run.bossSpawned = true;
    var boss = enemy(s, 'boss', 640, 300);
    if (s.room && s.room.index === s.bossIndex) { placeEnemyInRoom(s, boss, alivePlayers(s)); s.enemies.push(boss); }
    else { placeEnemyInRoom(s.roomData[s.bossIndex], boss); s.roomData[s.bossIndex].enemies.push(boss); }
    s.message = '炉心守卫已苏醒'; s.messageTime = 3;
    event(s, 'boss-awakened', { room: s.bossIndex });
  }
  function prop(s, kind, x, y) {
    return { id: id(s, 'prop-'), kind: kind, x: x, y: y,
      r: kind === 'crate' ? 20 : kind === 'barrel' ? 17 : 13,
      hp: kind === 'crate' ? 9 : 1, maxHp: kind === 'crate' ? 9 : 1,
      carriedBy: null, thrown: false, vx: 0, vy: 0, fuse: 0, lit: false,
      charges: kind === 'water' ? 3 : 0, destroyed: false };
  }
  function enemy(s, kind, x, y) {
    var hp = kind === 'boss' ? (s.playerCount > 1 ? 58 : 42) : kind === 'brute' ? 30 : kind === 'pyromancer' ? 20 : kind === 'duelist' ? 24 : kind === 'shield' || kind === 'charger' ? 4 : 3;
    if (s.difficulty === 2) hp += kind === 'boss' ? 10 : 1;
    return { id: id(s, 'enemy-'), kind: kind, x: x, y: y, r: kind === 'boss' ? 34 : kind === 'brute' ? 27 : kind === 'charger' ? 19 : 16,
      hp: hp, maxHp: hp, speed: (kind === 'duelist' ? 102 : kind === 'brute' ? 72 : kind === 'pyromancer' ? 65 : kind === 'boss' ? 43 : kind === 'chaser' ? 78 : kind === 'charger' ? 64 : 40) * (s.difficulty === 2 ? 1.1 : 1),
      facing: Math.PI, attackCd: 0.65 + random(s) * 0.6, windup: 0, attack: '',
      aimX: 0, aimY: 0, phase: 0, flash: 0, stun: 0, navTime: 0, navX: x, navY: y,
      chargeTime: 0, chargeX: 0, chargeY: 0, shieldOpen: 0,
      rhythm: null, rhythmCycle: 0, stagger: 0, posture: 0, stage: 1, maxPosture: kind === 'boss' ? 7 : 4,
      weakTime: 0, lastScatterVolley: '', scatterVolleys: [], rushHitIds: [] };
  }
  function roomContent(s, index) {
    var data = { walls: [rect(0, 0, W, 28), rect(0, H - 28, W, 28),
      rect(0, 0, 28, H), rect(W - 28, 0, 28, H)],
      doors: [{ id: 'east-door', x: 916, y: 256, w: 16, h: 88, locked: false, label: '出口' }],
      portals: [], props: [], enemies: [], fires: [], switches: [], pickups: [], fountains: [], interactables: [] };
    var defs = ROOM_DEFS[index];
    function addProp(kind, x, y) {
      data.props.push(prop(s, kind, x, y));
      if (kind === 'water') data.fountains.push({ id: id(s, 'spring-'), x: x, y: y, r: 25 });
    }
    function addEnemy(kind, x, y) { data.enemies.push(enemy(s, kind, x, y)); }
    function addFire(x, y, r) { data.fires.push({ id: id(s, 'fire-'), x: x, y: y, r: r, active: true }); }
    if (index === 0) {
      data.walls.push(rect(440, 115, 120, 46), rect(440, 439, 120, 46));
      addProp('crate', 355, 290); addProp('barrel', 520, 300); addProp('water', 355, 380);
    } else if (index === 1) {
      data.walls.push(rect(365, 150, 60, 115), rect(570, 350, 60, 105));
      addProp('crate', 290, 340); addProp('barrel', 550, 245);
      addEnemy('chaser', 660, 160); addEnemy('chaser', 730, 430);
      addEnemy('shooter', 790, 300);
    } else if (index === 2) {
      data.walls.push(rect(360, 120, 66, 122), rect(360, 360, 66, 122), rect(635, 260, 75, 60));
      addProp('crate', 265, 220); addProp('barrel', 500, 175); addProp('barrel', 590, 420);
      addProp('water', 235, 400); addFire(530, 305, 28); addFire(730, 165, 29);
      addEnemy('chaser', 525, 100); addEnemy('chaser', 745, 455);
      addEnemy('shooter', 770, 200); addEnemy('shooter', 790, 385);
    } else if (index === 3) {
      data.walls.push(rect(315, 105, 65, 150), rect(315, 345, 65, 150),
        rect(590, 185, 50, 230));
      addProp('crate', 235, 305); addProp('crate', 460, 455);
      addProp('barrel', 500, 270); addProp('barrel', 745, 340);
      addEnemy('chaser', 480, 120); addEnemy('chaser', 790, 450);
      addEnemy('shooter', 750, 130); addEnemy('shooter', 800, 290); addEnemy('shooter', 720, 480);
    } else if (index === 4) {
      data.walls.push(rect(445, 28, 48, 182), rect(445, 390, 48, 182), rect(735, 92, 145, 26));
      addProp('water', 255, 310); addProp('crate', 330, 410);
      addFire(470, 264, 43); addFire(470, 340, 43);
      data.switches.push({ id: 'vault-switch', x: 710, y: 450, r: 27, pressed: false });
      data.doors.push({ id: 'secret-door', x: 780, y: 118, w: 66, h: 18,
        locked: true, secret: true, label: '星纹暗门' });
      data.portals.push({ id: 'secret-portal', x: 814, y: 163, r: 25, target: 5,
        active: false, secret: true, label: '隐藏星藏室' });
    } else if (index === 5) {
      data.walls.push(rect(420, 115, 110, 44), rect(420, 441, 110, 44));
      addProp('barrel', 560, 300); addProp('crate', 320, 350);
      addEnemy('chaser', 690, 205); addEnemy('shooter', 765, 390);
    } else if (index === 6) {
      data.walls.push(rect(300, 130, 65, 70), rect(300, 400, 65, 70),
        rect(690, 130, 65, 70), rect(690, 400, 65, 70));
      addProp('crate', 235, 300); addProp('barrel', 505, 150); addProp('barrel', 505, 450);
      addEnemy('boss', 740, 300);
    }
    if (index === 2) data.enemies[2] = enemy(s, 'shield', 770, 200);
    if (index === 3) data.enemies[1] = enemy(s, 'charger', 790, 450);
    // Reflect complete, tested layouts rather than sprinkling obstacles into paths.
    // Their gates and spawn area stay fixed and every variant remains connected.
    if (index >= 1 && index <= 3) {
      var variant = Math.floor(random(s) * 3);
      data.variant = variant;
      if (variant === 1 && index > 1) {
        data.walls.slice(4).forEach(function (w) { w.y = H - w.y - w.h; });
        ['props', 'enemies', 'fires', 'fountains'].forEach(function (key) {
          data[key].forEach(function (entity) { entity.y = H - entity.y; if (entity.navY !== undefined) entity.navY = entity.y; });
        });
      } else if (variant === 2 && index > 1) {
        data.enemies.forEach(function (e, i) {
          if (e.kind === 'chaser' && i === 0) { e.kind = 'charger'; e.r = 19; e.hp = e.maxHp = s.difficulty === 2 ? 5 : 4; e.speed = 64; }
        });
      }
    }
    if (s.mission.id === 'salvage' && index >= 1 && index <= 3) {
      data.interactables.push({ id: 'cache-' + index, kind: 'cache', x: 800, y: 300, r: 22,
        label: '营地补给箱', description: '清理守卫后按 E 搜索补给', used: false, active: false });
    }
    if (s.mission.id === 'salvage' && index === 4) {
      data.walls = data.walls.slice(0, 4); data.fires = []; data.switches = []; data.doors = data.doors.slice(0, 1);
      data.portals = []; data.interactables.push({ id: 'salvage-exit', kind: 'extraction', x: 800, y: 300,
        r: 30, label: '补给撤离点', description: '带齐 3 箱补给，按 E 返回营地', used: false, active: false });
    }
    if (s.mission.id === 'holdout' && index === 1) {
      data.enemies = []; data.interactables.push({ id: 'night-beacon', kind: 'beacon', x: 480, y: 300,
        r: 28, label: '长夜信标', description: '按 E 启动第 1 波；波间可提前开始下一波', used: false, active: true });
    }
    if (defs.next !== null && !(s.mission.id === 'salvage' && index === 4) &&
        !(s.mission.id === 'holdout' && index === 1)) data.portals.push({ id: 'next-portal', x: 884, y: 300,
      r: 26, target: defs.next, active: index === 0, label: index === 0 ? '开始探险' : '下一房间' });
    if (index > 0 && !(s.mission.id === 'holdout' && index === 1)) data.portals.push({ id: 'back-portal', x: 70, y: 300, r: 22,
      target: index === 5 || index === 6 ? 4 : index - 1, active: false, back: true, label: '返回' });
    return data;
  }
  function saveRoom(s) {
    if (!s.room) return;
    var data = {};
    ['walls', 'doors', 'portals', 'props', 'enemies', 'fires', 'switches', 'pickups', 'fountains', 'interactables'].forEach(function (key) {
      data[key] = clone(s[key]);
    });
    // Carried objects travel with their owner; don't duplicate them on revisits.
    data.props = data.props.filter(function (p) { return !p.carriedBy; });
    data.roomEvent = s.roomEvent ? clone(s.roomEvent) : null;
    s.roomData[s.room.index] = data;
  }
  function resetCombat(p) {
    p.guarding = false; p.guardWindow = 0; p.guardCd = 0; p.guardStrain = 0; p.guardLoad = 0;
    p.dashWindow = 0; p.dashTime = 0; p.counterTime = 0; p.counterEnemy = null; p.counterKind = '';
    p.meleeTime = 0; p.guardAttackLock = 0; p.prevGuard = false; p.prevShoot = false;
    p.parryChain = 0; p.sneaking = false;
  }
  function enterRoom(s, index, initial) {
    index = Number(index);
    if (!Number.isInteger(index) || !s.rooms[index] || s.status !== 'playing') return false;
    var previous = s.room;
    if (s.mode === 'hunt' && !initial && (!previous || previous.neighbors.indexOf(index) < 0)) return false;
    if ((s.mode === 'random' || s.mode === 'relay' || s.mode === 'chapter') && !initial) {
      if (!previous || previous.neighbors.indexOf(index) < 0) return false;
      if (s.mode === 'chapter' && index === 4 && !s.chapter.sluiceOpen) return false;
      // A carried object belongs to its original room. Place it safely before
      // saving, rather than duplicating it at the next room's entrance.
      var carriers = Object.keys(s.players).map(function (key) { return s.players[key]; }).filter(function (p) { return p.carry; });
      for (var c = 0; c < carriers.length; c += 1) {
        if (s.mode === 'relay' && carriers[c].carry === s.relay.coreId) continue;
        if (!releaseCarry(s, carriers[c], false, false)) return false;
      }
    }
    var carried = s.props.filter(function (p) { return p.carriedBy && !p.destroyed; });
    // Do not cache a pending strike and resume it on a later room visit.
    s.enemies.forEach(function (e) { e.rhythm = null; e.windup = 0; e.chargeTime = 0; e.stagger = 0; e.weakTime = 0; e.attackCd = Math.max(e.attackCd, 0.8); });
    if (!initial) saveRoom(s);
    var data = s.roomData[index] ? clone(s.roomData[index]) : s.mode === 'random' ? randomRoomContent(s, s.rooms[index]) : roomContent(s, index);
    // Relay keeps one authoritative core: its active room is never also cached.
    if (s.mode === 'relay' || s.mode === 'hunt' || s.mode === 'chapter') delete s.roomData[index];
    ['walls', 'doors', 'portals', 'props', 'enemies', 'fires', 'switches', 'pickups', 'fountains', 'interactables'].forEach(function (key) {
      s[key] = data[key] || [];
    });
    s.roomEvent = data.roomEvent || null; s.decoys = [];
    carried.forEach(function (p) { if (!s.props.some(function (q) { return q.id === p.id; })) s.props.push(p); });
    s.rooms[index].visited = true; s.rooms[index].discovered = true;
    if (s.mode === 'random') s.rooms[index].neighbors.forEach(function (n) { s.rooms[n].discovered = true; });
    s.room = clone(s.rooms[index]);
    s.bullets = []; s.particles = []; s.combatEvents = []; s.travelCd = 0.9;
    Object.keys(s.players).forEach(function (key, i) {
      var p = s.players[key]; p.x = 130; p.y = 275 + i * 52;
      resetCombat(p);
      if (s.practice) { p.x = 390; p.y = 300 + i * 48; p.facing = 0; }
      if (s.mode === 'random' || s.mode === 'relay' || s.mode === 'hunt' || s.mode === 'chapter') {
        var dx = previous ? s.rooms[index].gx - previous.gx : 0;
        var dy = previous ? s.rooms[index].gy - previous.gy : 0;
        p.x = dx ? dx > 0 ? 132 : W - 132 : W / 2 + (i ? 28 : -24);
        p.y = dy ? dy > 0 ? 132 : H - 132 : H / 2 + (i ? 28 : -24);
        if (s.mode === 'relay' && initial) { p.x = 170; p.y = 276 + i * 48; }
        if (s.mode === 'chapter' && initial) { p.x = 180; p.y = 276 + i * 48; }
      }
      p.invuln = Math.max(p.invuln, 0.9); p.dashTime = 0;
    });
    if (s.mode === 'relay' && s.props.some(function (q) { return q.id === s.relay.coreId; })) s.relay.coreRoom = index;
    if (s.mode === 'hunt') {
      if (s.hunt.targetRoom === index) {
        s.hunt.arrival = null; s.hunt.heardFrom = null;
        var seen = huntEnemy(s);
        if (seen && alivePlayers(s).some(function (p) { return lineClear(s, p, seen, 2); })) {
          s.hunt.lastSeenRoom = index; s.hunt.lastSeenAt = s.time;
        }
      } else if (s.hunt.heardFrom !== null && s.room.neighbors.indexOf(s.hunt.heardFrom) < 0) s.hunt.heardFrom = null;
    }
    updateCarries(s); refreshProgress(s);
    event(s, 'room-enter', { room: index, name: s.room.name });
    s.message = s.room.name; s.messageTime = 2;
    if (s.mode === 'chapter' && initial) {
      s.message = '守灯人：归途灯熄了，采集队还没回来。去苔火工坊借一簇火，把归路点亮。'; s.messageTime = 8;
    }
    return true;
  }
  function setHint(s) {
    if (s.status !== 'playing') return;
    if (s.practice) { s.objective = '击败持刀守卫'; s.hint = ''; return; }
    if (s.mode === 'chapter') {
      s.objective = s.chapter.fireTaken ? '带火回营 · 点亮归途灯' : s.chapter.bossDefeated ? '取出备用火种' :
        s.chapter.sluiceOpen ? '稳定备用炉心' : s.chapter.phase === 'depart' ? '前往苔火工坊借火' : '寻找冷却水闸';
      s.hint = ''; return;
    }
    if (s.mode === 'hunt') {
      s.objective = s.hunt.targetRoom === s.room.index ? '击败逐迹巨兽' : '追踪逐迹巨兽';
      s.hint = ''; return;
    }
    if (s.mode === 'relay') {
      var carrier = alivePlayers(s).find(function (p) { return p.carry === s.relay.coreId; });
      s.objective = carrier ? '带回炉芯 · 苔灯撤离站交付' : '找到炉芯 · ' + s.rooms[s.relay.coreRoom].name;
      s.hint = ''; return;
    }
    if (s.mode === 'random') {
      s.objective = s.exploration.bossAwake ? '炉心守卫已苏醒' : '守卫 ' + s.exploration.kills + ' / ' + s.exploration.target;
      s.hint = '';
      return;
    }
    var i = s.room.index;
    if (s.mission.id === 'holdout' && i === 1) {
      if (s.mission.phase === 'ready') {
        s.objective = '靠近庭院中央信标，按 E 开始 3 波守卫战';
        s.hint = '先布置箱子和炸药桶，再启动信标；每波结束能选遗物、拾取补给';
      } else if (s.mission.phase === 'prep') {
        s.objective = '已守住 ' + s.mission.progress + ' / 3 波 · ' + Math.ceil(s.mission.prep) + ' 秒后下一波';
        s.hint = '选一件遗物、拾取绿心补给；按 E 操作信标可提前开始下一波';
      } else if (s.mission.phase === 'extract') {
        s.objective = '3 波已全部守住，靠近信标按 E 撤离';
        s.hint = '这次任务需要主动撤离：在中央绿色撤离信标按 E';
      } else {
        s.objective = '守住第 ' + s.mission.wave + ' / 3 波 · 剩余守卫 ' + s.enemies.length;
        s.hint = '红线预警后冲锋；绕到盾卫身后射击，或用炸药桶击破阵形';
      }
      return;
    }
    if (s.mission.id === 'salvage' && i > 0) {
      var cache = s.interactables.find(function (q) { return q.kind === 'cache'; });
      if (i === 4) {
        s.objective = s.mission.progress >= 3 ? '补给 3 / 3 · 靠近绿色撤离点按 E 撤离' :
          '补给 ' + s.mission.progress + ' / 3 · 沿西侧光门返回，搜查遗漏的补给箱';
        s.hint = '每个战斗房有 1 个补给箱，清理守卫后靠近按 E 搜索';
      } else {
        s.objective = '补给 ' + s.mission.progress + ' / 3 · ' + (!s.room.cleared ? '清理守卫' : cache && !cache.used ? '靠近蓝色补给箱按 E 搜索' : '继续前往下一房间');
        s.hint = s.room.cleared ? '蓝箱需按 E 搜索；发光遗物为全队 2 选 1，本局有效' :
          '先清理房间；护盾正面挡弹，绕侧面或利用炸药桶';
      }
      return;
    }
    if (i === 0) {
      s.objective = '穿过东侧光门，开始一次短途探险';
      s.hint = 'WASD 移动 · 鼠标瞄准 / 按住射击 · 空格闪避 · E 搬运与使用';
    } else if (i === 4) {
      s.objective = s.room.cleared ? '进入炉心；木箱压住星纹开关可打开隐藏室' : '拿起蓝色水桶，靠近火焰按 E 浇水，开启水闸';
      s.hint = s.secretOpened ? '星纹暗门已开启：北侧光门通往隐藏星藏室' : '水桶朝瞄准方向浇水，回蓝色泉眼按 E 补满；木箱能压住金色开关';
    } else if (i === 6) {
      s.objective = '击败炉心守卫，把灯芯带回营地';
      s.hint = '红色瞄线与光圈是攻击预警；木箱挡弹，炸药桶可重创守卫';
    } else if (s.room.cleared) {
      s.objective = i === 5 ? '星藏已找到：补给与额外星屑已收集，继续前往炉心' : '房间已清理，穿过东侧光门继续';
      s.hint = '靠近补给恢复生命；搬运中的道具可以带到下一房间';
    } else {
      s.objective = '清理守卫，开启东侧光门';
      s.hint = i === 1 ? 'E 搬起木箱挡弹；再按 E 放下。炸药桶拿起后按 E 投掷' :
        '翻滚穿过弹幕；投掷炸药桶可引发范围爆炸。靠近倒地搭档按 E 救援';
    }
  }
  function offerRelics(s, group) {
    if (s.relicRooms.indexOf(group) >= 0) return;
    s.relicRooms.push(group);
    var available = ['pierce', 'swift', 'vigor'].filter(function (key) { return s.runBuffs.indexOf(key) < 0; });
    for (var i = available.length - 1; i > 0; i -= 1) {
      var j = Math.floor(random(s) * (i + 1)), swap = available[i]; available[i] = available[j]; available[j] = swap;
    }
    available.slice(0, 2).forEach(function (key, index) {
      var def = BUFFS[key];
      s.interactables.push({ id: id(s, 'relic-'), kind: 'relic', buff: key, group: group,
        x: 740, y: index ? 370 : 230, r: 18, label: def.label, description: def.description,
        active: true, used: false });
    });
    if (available.length) event(s, 'relic-offer', { group: group });
  }
  function takeRelic(s, item) {
    if (!item.active || item.used || !BUFFS[item.buff] || s.runBuffs.indexOf(item.buff) >= 0 || s.runBuffs.length >= 6) return false;
    s.runBuffs.push(item.buff);
    s.interactables.forEach(function (q) {
      if (q.kind === 'relic' && (q.group === item.group || q.buff === item.buff)) {
        q.used = true; q.active = false; q.selected = q.id === item.id;
      }
    });
    if (item.buff === 'vigor') Object.keys(s.players).forEach(function (key) {
      var p = s.players[key]; p.maxHp = Math.min(7, p.maxHp + 1);
      if (!p.downed) p.hp = Math.min(p.maxHp, p.hp + 2);
    });
    s.message = '全队获得：' + item.label; s.messageTime = 3;
    event(s, 'relic-selected', { buff: item.buff, label: item.label });
    particle(s, 'text', item.x, item.y - 25, { text: item.label, ttl: 1.6, life: 1.6, color: '#d8bcff' });
    return true;
  }
  function syncMission(s) {
    var m = s.mission;
    if (s.status !== 'playing') return;
    if (s.mode === 'chapter') { syncChapter(s); return; }
    if (s.mode === 'hunt') {
      m.progress = s.hunt.defeated ? 1 : 0; m.total = 1;
      m.phase = s.hunt.targetRoom === s.room.index ? 'hunt' : 'track';
      return;
    }
    if (s.mode === 'relay') {
      m.progress = s.relay.delivered ? 1 : 0; m.total = 1;
      m.phase = alivePlayers(s).some(function (p) { return p.carry === s.relay.coreId; }) ? 'extract' : 'search';
      return;
    }
    // A skipped offer can be revisited after finding the same relic elsewhere.
    // Disable only that already-owned option instead of offering an inert choice.
    s.interactables.forEach(function (q) {
      if (q.kind === 'relic' && s.runBuffs.indexOf(q.buff) >= 0) { q.used = true; q.active = false; }
    });
    if (s.mode === 'random') {
      m.progress = Math.min(s.exploration.kills, s.exploration.target);
      m.total = s.exploration.target; m.phase = s.exploration.bossAwake ? 'defend' : 'explore';
      return;
    }
    if (m.id === 'salvage') {
      m.progress = m.caches.length;
      m.phase = m.progress >= 3 ? 'extract' : s.room.index ? 'search' : 'travel';
      s.interactables.forEach(function (q) {
        if (q.kind === 'cache') q.active = s.room.cleared && !q.used;
        if (q.kind === 'extraction') q.active = m.progress >= 3 && !q.used;
      });
    } else if (m.id === 'holdout') {
      if (s.room.index === 1 && !m.started) m.phase = 'ready';
      s.interactables.forEach(function (q) {
        if (q.id === 'night-beacon') {
          q.kind = m.phase === 'extract' ? 'extraction' : 'beacon';
          q.active = m.phase === 'ready' || m.phase === 'prep' || m.phase === 'extract';
          q.label = m.phase === 'extract' ? '信标撤离点' : m.phase === 'prep' ? '提前开始下一波' : '启动长夜信标';
        }
      });
    } else m.phase = s.room.index === 6 ? 'defend' : 'travel';
  }
  function startWave(s) {
    var m = s.mission;
    if (m.id !== 'holdout' || s.room.index !== 1 || (m.phase !== 'ready' && m.phase !== 'prep')) return false;
    m.started = true; m.wave += 1; m.phase = 'defend'; m.prep = 0;
    var waves = [['chaser', 'chaser', 'shooter'], ['shield', 'charger', 'shooter', 'chaser'],
      ['charger', 'shield', 'shooter', 'charger', 'chaser']];
    var kinds = waves[m.wave - 1].slice();
    if (s.playerCount > 1) kinds.push(m.wave > 1 ? 'shield' : 'chaser');
    if (s.difficulty === 2) kinds.push('shooter');
    var spots = [[750, 140], [810, 300], [740, 480], [500, 100], [500, 500], [265, 470], [810, 445]];
    s.enemies = kinds.map(function (kind, index) { return enemy(s, kind, spots[index][0], spots[index][1]); });
    s.bullets = [];
    alivePlayers(s).forEach(function (p) { p.invuln = Math.max(p.invuln, 1); });
    s.message = '第 ' + m.wave + ' / 3 波来袭！'; s.messageTime = 2.4;
    event(s, 'wave-start', { wave: m.wave }); syncMission(s); setHint(s);
    return true;
  }
  function startRoomEvent(s, item) {
    var state = s.roomEvent;
    if (s.mode !== 'random' || !state || state.kind !== item.kind || state.stage !== 'ready' || item.used) return false;
    item.used = true; item.active = false; state.stage = 'active';
    var kinds = state.kind === 'sluice' ? ['duelist'] : ['chaser', 'shield', 'shooter'];
    var spots = state.kind === 'sluice' ? [[740, 300]] : [[800, 140], [800, 460], [480, 100]];
    kinds.forEach(function (kind, index) {
      var foe = enemy(s, kind, spots[index][0], spots[index][1]);
      if (state.kind === 'sluice') {
        foe.elite = true; foe.patrol = true;
        var available = Object.keys(BUFFS).filter(function (key) { return s.runBuffs.indexOf(key) < 0; });
        foe.relicBuff = available[Math.floor(random(s) * available.length)] || 'resonance';
      }
      placeEnemyInRoom(s, foe, alivePlayers(s));
      state.enemyIds.push(foe.id); s.enemies.push(foe);
    });
    s.exploration.totalEnemies += kinds.length;
    // Awakening keeps the original threshold: optional events never become a compulsory chore.
    if (state.kind === 'sluice') {
      s.walls = s.walls.filter(function (w) { return !w.eventBarrier; });
      s.fires.forEach(function (f) { if (f.sluiceFire && f.active) { f.active = false; s.stats.fires += 1; } });
      s.message = '水路已通 · 一名巡逻守刃者听见了动静';
    } else s.message = '升降台启动 · 守住后可以领取补给';
    s.messageTime = 3;
    event(s, 'event-start', { kind: state.kind, room: s.room.index, x: item.x, y: item.y });
    return true;
  }
  function updateRoomEvent(s) {
    var state = s.roomEvent;
    if (!state || state.stage !== 'active' || state.enemyIds.some(function (key) {
      return s.enemies.some(function (e) { return e.id === key && e.hp > 0; });
    })) return;
    state.stage = 'complete';
    if (state.kind === 'lift') {
      s.interactables.push({ id: 'supply-' + s.room.index, kind: 'supply-cache', x: 480, y: 440, r: 24,
        label: '领取补给与护盾', active: true, used: false });
      s.message = '补给已送达 · 升降台旁按 E 领取'; s.messageTime = 3;
    }
    event(s, 'event-complete', { kind: state.kind, room: s.room.index, x: 480, y: 440 });
  }
  function updateHoldout(s, dt) {
    var m = s.mission;
    if (m.id !== 'holdout' || s.room.index !== 1 || s.status !== 'playing') return;
    if (m.phase === 'prep') {
      m.prep = Math.max(0, m.prep - dt);
      if (m.prep <= 0) startWave(s);
    } else if (m.phase === 'defend' && s.enemies.length === 0) {
      m.progress = m.wave;
      offerRelics(s, 'wave-' + m.wave);
      s.pickups.push({ id: id(s, 'pickup-'), kind: 'heart', x: 420, y: 320, r: 14, amount: 2 });
      event(s, 'wave-clear', { wave: m.wave });
      if (m.wave >= m.waves) {
        m.phase = 'extract'; s.rooms[1].cleared = true; s.room.cleared = true; s.stats.rooms += 1;
        event(s, 'room-clear', { room: 1 });
        s.message = '信标点亮 · 靠近信标按 E 撤离';
      } else { m.phase = 'prep'; m.prep = 8; s.message = '守住这一波！补给并选择一件遗物'; }
      s.messageTime = 3; syncMission(s);
    }
  }
  function refreshProgress(s) {
    if (s.practice) {
      s.room.cleared = !s.enemies.some(function (e) { return e.hp > 0; });
      s.rooms[0].cleared = s.room.cleared;
      if (s.room.cleared && s.status === 'playing') finish(s, 'won');
      setHint(s); return;
    }
    if (s.mode === 'chapter') {
      var clearChapter = !s.enemies.some(function (e) { return e.hp > 0; });
      if (clearChapter && !s.rooms[s.room.index].cleared) {
        s.rooms[s.room.index].cleared = true; s.stats.rooms += 1;
        event(s, 'room-clear', { room: s.room.index });
        if (s.room.index !== 4) s.pickups.push({ id: id(s, 'pickup-'), kind: 'heart', x: 480, y: 300, r: 14, amount: 2 });
      }
      s.room.cleared = s.rooms[s.room.index].cleared;
      syncChapter(s); setHint(s); return;
    }
    if (s.mode === 'hunt') {
      var clearHuntRoom = !s.enemies.some(function (e) { return e.hp > 0; });
      if (clearHuntRoom && !s.rooms[s.room.index].cleared) {
        s.rooms[s.room.index].cleared = true; s.stats.rooms += 1;
      }
      s.room.cleared = s.rooms[s.room.index].cleared;
      s.portals.forEach(function (gate) { gate.active = true; });
      s.doors.forEach(function (door) { door.locked = false; });
      syncMission(s); setHint(s);
      if (s.hunt.defeated && s.status === 'playing') finish(s, 'won');
      return;
    }
    if (s.mode === 'relay') {
      if (!s.enemies.some(function (e) { return e.hp > 0; }) && !s.rooms[s.room.index].cleared) {
        s.rooms[s.room.index].cleared = true; s.stats.rooms += 1;
        event(s, 'room-clear', { room: s.room.index });
      }
      s.room.cleared = s.rooms[s.room.index].cleared;
      s.portals.forEach(function (gate) { gate.active = true; });
      s.doors.forEach(function (door) { door.locked = false; });
      syncMission(s); setHint(s); return;
    }
    if (s.mode === 'random') {
      var clearRandom = s.room.kind === 'boss' ? s.exploration.bossDefeated : !s.enemies.some(function (e) { return e.hp > 0; });
      if (clearRandom && !s.rooms[s.room.index].cleared) {
        s.rooms[s.room.index].cleared = true; s.stats.rooms += 1;
        event(s, 'room-clear', { room: s.room.index });
        if (s.room.kind === 'battle') s.pickups.push({ id: id(s, 'pickup-'), kind: 'heart', x: 480, y: 300, r: 14, amount: 2 });
      }
      s.room.cleared = s.rooms[s.room.index].cleared;
      s.portals.forEach(function (p) { p.active = true; });
      s.doors.forEach(function (d) { d.locked = false; });
      awakenBoss(s); syncMission(s); setHint(s);
      if (s.exploration.bossDefeated && s.status === 'playing') finish(s, 'won');
      return;
    }
    var clear = s.room.kind === 'holdout' ? s.mission.phase === 'extract' : s.room.kind === 'camp' ||
      (s.room.kind === 'puzzle' ? s.fires.every(function (f) { return !f.active; }) : s.enemies.length === 0);
    if (clear && !s.rooms[s.room.index].cleared) {
      s.rooms[s.room.index].cleared = true; s.stats.rooms += 1;
      event(s, 'room-clear', { room: s.room.index });
      s.message = '房间清理完成 · 出口已开启'; s.messageTime = 2.4;
      if (s.room.kind === 'secret') {
        s.secretCleared = true;
        alivePlayers(s).forEach(function (p) { p.hp = p.maxHp; });
        event(s, 'secret-clear', { coins: 12 });
        particle(s, 'text', 480, 285, { text: '星藏补给 +12 星屑', r: 30, ttl: 2, life: 2, color: '#e4c77e' });
      } else if (s.room.kind !== 'boss' && s.room.kind !== 'puzzle') {
        s.pickups.push({ id: id(s, 'pickup-'), kind: 'heart', x: 790, y: 300, r: 14, amount: 2 });
      }
      if (s.room.kind === 'battle' || s.room.kind === 'secret') offerRelics(s, 'room-' + s.room.index);
    }
    s.room.cleared = s.rooms[s.room.index].cleared;
    s.portals.forEach(function (p) { if (!p.secret) p.active = s.room.cleared; });
    s.doors.forEach(function (d) { if (!d.secret) d.locked = !s.room.cleared; });
    if (s.mission.id === 'ember' && s.room.kind === 'boss' && clear && s.status === 'playing') finish(s, 'won');
    syncMission(s);
    setHint(s);
  }
  function finish(s, status) {
    if (s.status !== 'playing') return;
    s.status = status;
    s.bullets = [];
    Object.keys(s.players).forEach(function (key) { resetCombat(s.players[key]); });
    if (s.practice) {
      s.reward = null; s.rewardGranted = false;
      s.mission.phase = status === 'won' ? 'complete' : 'failed';
      s.message = status === 'won' ? '试炼完成' : '再听一次刀锋的节奏'; s.messageTime = 999;
      event(s, status === 'won' ? 'practice-complete' : 'defeat'); return;
    }
    if (s.mode === 'chapter') s.chapter.phase = status === 'won' ? 'complete' : 'failed';
    if (status === 'won' && !s.rewardGranted) {
      s.rewardGranted = true;
      s.mission.phase = 'complete'; s.mission.progress = s.mission.total;
      s.reward = { coins: s.mode === 'hunt' ? 32 : s.mode === 'relay' ? 24 : MISSIONS[s.mission.id].coins + (s.secretCleared ? 12 : 0) + (s.difficulty === 2 ? 20 : 0),
        missionId: s.mission.id, difficulty: s.difficulty,
        secret: s.secretCleared, elapsed: Math.round(s.elapsed), kills: s.stats.kills };
      event(s, 'reward', clone(s.reward));
      s.message = s.mission.name + ' · 任务完成！'; s.objective = '带着战利品返回营地，准备下一次探险';
      if (s.mode === 'chapter') {
        s.message = '归途灯重新亮起，采集队循着灯光回到了营地。旧线路里，另一座废弃哨站传来微弱的求援声。';
        s.objective = '第一节完成 · 今夜的归路重新亮起';
      }
    } else if (status === 'lost') {
      s.mission.phase = 'failed';
      event(s, 'defeat'); s.message = '探险队倒下了'; s.objective = '重整装备，再试一次';
    }
    s.messageTime = 999;
  }
  function releaseCarry(s, p, throwing, force) {
    var item = s.props.find(function (q) { return q.id === p.carry; });
    if (!item) { p.carry = null; return false; }
    var a = p.facing, offset = p.r + item.r + 7;
    var angles = [a, a + Math.PI, a + Math.PI / 2, a - Math.PI / 2,
      a + Math.PI / 4, a - Math.PI / 4, a + Math.PI * 0.75, a - Math.PI * 0.75];
    var candidate = angles.map(function (angle) {
      return { x: p.x + Math.cos(angle) * offset, y: p.y + Math.sin(angle) * offset };
    }).find(function (point) { return !collides(s, point.x, point.y, item.r, item.id, false); });
    if (!candidate && !force) {
      s.message = '前方太拥挤，请移到空地再放下'; s.messageTime = 1.8;
      return false;
    }
    var x = candidate ? candidate.x : p.x, y = candidate ? candidate.y : p.y;
    p.carry = null; item.carriedBy = null;
    item.x = clamp(x, 28 + item.r, W - 28 - item.r);
    item.y = clamp(y, 28 + item.r, H - 28 - item.r);
    if (throwing && item.kind === 'core') {
      item.thrown = true; item.flightTime = 1.25; item.catchLock = 0.3; item.knockCd = 0.5;
      item.thrower = p.id; item.hitIds = []; item.vx = Math.cos(a) * 430; item.vy = Math.sin(a) * 430;
      s.relay.throws += 1;
      event(s, 'core-throw', { playerId: p.id, propId: item.id, x: item.x, y: item.y });
    } else if (throwing && item.kind === 'barrel') {
      item.thrown = true; item.lit = true; item.fuse = 1.15; item.thrower = p.id;
      item.vx = Math.cos(a) * 360; item.vy = Math.sin(a) * 360;
      event(s, 'throw', { playerId: p.id, propId: item.id });
    } else {
      item.thrown = false; item.vx = 0; item.vy = 0;
      if (item.kind === 'core') { item.flightTime = 0; item.catchLock = 0; item.knockCd = 0.8; }
      event(s, 'drop', { playerId: p.id, propId: item.id });
    }
    return true;
  }
  function activateRelayAlarm(s) {
    if (s.mode !== 'relay' || s.mission.started) return;
    s.mission.started = true;
    var data = s.room.index === 1 ? s : s.roomData[1];
    if (data) {
      [['charger', 670, 300], ['shooter', 500, 350]].forEach(function (entry) {
        var foe = enemy(s, entry[0], entry[1], entry[2]);
        if (placeEnemyInRoom(data, foe, data === s ? alivePlayers(s) : [])) data.enemies.push(foe);
      });
      s.rooms[1].cleared = false;
      if (s.room.index === 1) s.room.cleared = false;
    }
    s.message = '炉芯已启动 · 回程巡逻队正在集结'; s.messageTime = 3;
  }
  function interact(s, playerId) {
    if (s.status !== 'playing') return false;
    var p = s.players[playerId];
    if (!p || p.downed) return false;
    var downed = Object.keys(s.players).map(function (key) { return s.players[key]; })
      .find(function (q) { return q.downed && q.id !== p.id && dist(p, q) < 78; });
    if (downed) {
      downed.downed = false; downed.hp = 3; downed.invuln = 1.8; resetCombat(downed);
      downed.prevInteract = true; s.stats.revives += 1;
      event(s, 'revive', { playerId: downed.id, by: p.id });
      burst(s, 'heal', downed.x, downed.y, '#83f2b5', 12);
      return true;
    }
    if (p.carry) {
      var held = s.props.find(function (q) { return q.id === p.carry && !q.destroyed; });
      if (held && held.kind === 'core') {
        var pad = s.interactables.find(function (q) { return q.kind === 'relay-extraction' && !q.used && dist(p, q) < 76; });
        if (pad) {
          pad.used = true; pad.active = false; s.relay.delivered = true;
          event(s, 'core-deliver', { playerId: p.id, propId: held.id, x: pad.x, y: pad.y });
          burst(s, 'heal', pad.x, pad.y, '#a5f6e4', 22); finish(s, 'won'); return true;
        }
        return releaseCarry(s, p, true, false);
      }
      if (held && held.kind === 'water' && held.charges < 3 &&
          s.fountains.some(function (f) { return dist(p, f) < 78; })) {
        held.charges = 3;
        event(s, 'refill', { playerId: p.id, propId: held.id });
        particle(s, 'text', p.x, p.y - 32, { text: '水桶已补满', ttl: 1, life: 1, color: '#89e1f3' });
        return true;
      }
      if (held && held.kind === 'water' && held.charges > 0) {
        held.charges -= 1;
        var cx = p.x + Math.cos(p.facing) * 72, cy = p.y + Math.sin(p.facing) * 72;
        particle(s, 'water', cx, cy, { r: 86, ttl: 0.48, life: 0.48, color: '#7cdaef' });
        var extinguished = 0;
        s.fires.forEach(function (fire) {
          if (fire.active && len(cx - fire.x, cy - fire.y) < 88 + fire.r) {
            fire.active = false; extinguished += 1; s.stats.fires += 1;
            burst(s, 'steam', fire.x, fire.y, '#b4d6d6', 10);
          }
        });
        s.enemies.forEach(function (e) { if (len(cx - e.x, cy - e.y) < 92 + e.r) e.stun = 0.7; });
        event(s, 'splash', { playerId: p.id, extinguished: extinguished });
        // Pouring also sets the bucket down, so a single action frees both hands
        // for the crate puzzle without introducing another key binding.
        releaseCarry(s, p, false);
      } else releaseCarry(s, p, !!held && held.kind === 'barrel');
      refreshProgress(s);
      return true;
    }
    var target = s.interactables.filter(function (q) { return !q.used && q.kind !== 'relay-extraction' && dist(p, q) < 76; })
      .sort(function (a, b) { return dist(p, a) - dist(p, b); })[0];
    if (target) {
      if (!target.active) {
        s.message = target.kind === 'chapter-fire' ? '炉心仍在暴走，先让守卫停下来。' :
          target.kind === 'chapter-lamp' ? '归途灯没有火种。守灯人还在等工坊的备用火。' :
          target.kind === 'cache' ? '先清理这间房的守卫，再搜索补给箱' :
          target.kind === 'extraction' ? '还缺补给：沿西侧光门返回搜索遗漏的蓝箱' : '先守住这一波，再操作信标';
        s.messageTime = 2;
        return false;
      }
      if (s.mode === 'chapter' && target.kind.indexOf('chapter-') === 0) return interactChapter(s, p, target);
      if (target.kind === 'relic') return takeRelic(s, target);
      if (target.kind === 'sluice' || target.kind === 'lift') return startRoomEvent(s, target);
      if (target.kind === 'supply-cache' && s.roomEvent && s.roomEvent.stage === 'complete' && !s.roomEvent.collected) {
        target.used = true; target.active = false; s.roomEvent.collected = true;
        alivePlayers(s).forEach(function (q) { q.hp = Math.min(q.maxHp, q.hp + 2); q.ward = 1; });
        event(s, 'supply-collected', { room: s.room.index, x: target.x, y: target.y });
        burst(s, 'heal', target.x, target.y, '#8ce6b0', 15);
        s.message = '全队恢复 2 点生命，获得一次护盾'; s.messageTime = 3; return true;
      }
      if (target.kind === 'cache') {
        if (s.mission.caches.indexOf(target.id) < 0) s.mission.caches.push(target.id);
        target.used = true; target.active = false;
        event(s, 'cache-searched', { cacheId: target.id, progress: s.mission.caches.length });
        s.message = '找回营地补给 ' + s.mission.caches.length + ' / 3'; s.messageTime = 2.5;
        burst(s, 'heal', target.x, target.y, '#89e1f3', 9);
        syncMission(s); setHint(s); return true;
      }
      if (target.kind === 'beacon') return startWave(s);
      if (target.kind === 'extraction') { target.used = true; target.active = false; finish(s, 'won'); return true; }
    }
    var nearest = s.props.filter(function (q) { return !q.destroyed && !q.carriedBy && !q.thrown &&
      dist(p, q) < 74; })
      .sort(function (a, b) { return dist(p, a) - dist(p, b); })[0];
    if (nearest) {
      p.carry = nearest.id; nearest.carriedBy = p.id; nearest.vx = 0; nearest.vy = 0;
      if (nearest.kind === 'core') {
        nearest.thrown = false; nearest.flightTime = 0; nearest.catchLock = 0; activateRelayAlarm(s);
      }
      event(s, 'pickup', { playerId: p.id, propId: nearest.id, kind: nearest.kind });
      updateCarries(s);
      return true;
    }
    var gate = s.portals.find(function (g) { return g.active && dist(p, g) < 70; });
    if (gate && s.travelCd <= 0) return enterRoom(s, gate.target);
    return false;
  }
  function updateCarries(s) {
    s.props.forEach(function (q) {
      if (!q.carriedBy) return;
      var p = s.players[q.carriedBy];
      if (!p || p.downed) { q.carriedBy = null; return; }
      var d = p.r + q.r * 0.65 + 3;
      q.x = p.x + Math.cos(p.facing) * d; q.y = p.y + Math.sin(p.facing) * d;
    });
  }
  function damagePlayer(s, p, amount, source) {
    if (!p || p.downed || p.invuln > 0 || s.status !== 'playing') return false;
    p.parryChain = 0;
    if (p.ward > 0) {
      p.ward = 0; p.invuln = 0.85;
      event(s, 'ward-block', { playerId: p.id, x: p.x, y: p.y });
      particle(s, 'counter', p.x, p.y, { r: 35, ttl: 0.3, life: 0.3, color: '#9ed8ff' }); return true;
    }
    var oldHp = p.hp;
    p.hp = Math.max(0, p.hp - amount); p.invuln = 0.85; s.stats.damage += amount;
    if (s.mode === 'relay' && p.carry === s.relay.coreId) releaseCarry(s, p, false, true);
    p.counterTime = 0; p.counterEnemy = null; p.counterKind = '';
    event(s, 'player-hit', { playerId: p.id, hp: p.hp, source: source, damage: oldHp - p.hp, x: p.x, y: p.y });
    burst(s, 'hit', p.x, p.y, '#ff8d83', 7);
    if (p.hp <= 0) {
      releaseCarry(s, p, false, true); p.downed = true; resetCombat(p);
      event(s, 'downed', { playerId: p.id });
      if (!alivePlayers(s).length) finish(s, 'lost');
    }
    return true;
  }
  function switchWeapon(s, p) {
    if (p.downed || p.switchCd > 0) return false;
    var slot = p.activeSlot === 'melee' ? 'ranged' : 'melee';
    if (slot === 'ranged' && p.rangedBroken) return false;
    p.activeSlot = slot; p.weapon = p.weapons[slot]; p.switchCd = 0.25;
    // Switching never refreshes an attack cooldown or a perfect guard window.
    p.guardWindow = 0;
    event(s, 'weapon-switch', { playerId: p.id, x: p.x, y: p.y, weapon: p.weapon, slot: slot, broken: false });
    return true;
  }
  function guardBlock(s, p, attacker, amount, source, perfect) {
    if (!p || p.downed || p.invuln > 0 || !p.guarding || p.carry || !facingEnemy(p, attacker) || s.status !== 'playing') return false;
    if (p.activeSlot === 'ranged') {
      var weapon = p.weapons.ranged, broken = random(s) < 0.1, chip = amount * 0.5, oldHp = p.hp;
      damagePlayer(s, p, chip, source);
      event(s, 'ranged-block', { playerId: p.id, enemyId: attacker.id || null, x: p.x, y: p.y,
        weapon: weapon, slot: 'ranged', perfect: !!perfect, broken: broken, damage: oldHp - p.hp });
      if (broken) {
        p.rangedBroken = true; p.activeSlot = 'melee'; p.weapon = p.weapons.melee;
        p.guardWindow = 0; p.switchCd = Math.max(p.switchCd, 0.25);
        event(s, 'weapon-broken', { playerId: p.id, x: p.x, y: p.y, weapon: weapon, slot: 'ranged', broken: true });
        s.message = '远程武器损坏 · 已切换近战，本局无法再使用远程武器'; s.messageTime = 2.5;
      }
    } else {
      event(s, 'guard', { playerId: p.id, enemyId: attacker.id || null, x: p.x, y: p.y });
      event(s, 'melee-block', { playerId: p.id, enemyId: attacker.id || null, weapon: 'blade', damage: 0, x: p.x, y: p.y });
    }
    particle(s, 'spark', p.x, p.y, { r: 17, ttl: 0.18, life: 0.18, color: p.activeSlot === 'ranged' ? '#efc389' : '#b5cbd3' });
    return true;
  }
  function hitFeedback(s, e, amount, owner, weapon) {
    var recent = (s.combatEvents || []).filter(function (entry) {
      return entry.type === 'enemy-hit' && entry.enemyId === e.id && entry.playerId === (s.players[owner] ? owner : null) &&
        entry.weapon === weapon && s.time - entry.time < 0.075;
    }).pop();
    if (recent) {
      recent.amount += amount; recent.x = e.x; recent.y = e.y;
      var fresh = s.events.find(function (entry) { return entry.id === recent.id; });
      if (fresh) { fresh.amount = recent.amount; fresh.x = e.x; fresh.y = e.y; }
    } else event(s, 'enemy-hit', { enemyId: e.id, playerId: s.players[owner] ? owner : null,
      weapon: weapon || null, amount: amount, x: e.x, y: e.y });
  }
  function openWeakpoint(s, e, owner, source) {
    if (e.hp <= 0) return;
    e.weakTime = 1.6;
    event(s, 'weakpoint-open', { enemyId: e.id, playerId: s.players[owner] ? owner : null,
      weapon: null, source: source, x: e.x, y: e.y });
  }
  function breakPosture(s, e, owner) {
    e.posture = 0; e.stagger = Math.max(e.stagger, 1); e.rhythm = null; e.windup = 0; e.chargeTime = 0;
    if (!/^(duelist|brute|pyromancer|boss)$/.test(e.kind)) e.stun = Math.max(e.stun, 1);
    e.attackCd = Math.max(e.attackCd, 0.8); e.shieldOpen = Math.max(e.shieldOpen, 1.6);
    event(s, 'posture-break', { enemyId: e.id, playerId: s.players[owner] ? owner : null,
      weapon: 'blade', x: e.x, y: e.y });
    openWeakpoint(s, e, owner, 'posture');
  }
  function damageEnemy(s, e, amount, owner, weapon, quietHit) {
    if (e.hp <= 0) return;
    if (weapon !== undefined && !quietHit) hitFeedback(s, e, amount, owner, weapon);
    e.hp -= amount; e.flash = 0.12;
    if ((s.mode === 'random' || s.mode === 'chapter') && e.kind === 'boss' && e.hp > 0 && e.stage === 1 && e.hp <= e.maxHp * 0.5) {
      e.stage = 2; e.rhythm = null; e.stagger = 1.1; e.attackCd = 0.8; e.rhythmCycle = 0;
      s.walls = s.walls.filter(function (w) {
        var boundary = w.x <= 28 || w.y <= 28 || w.x + w.w >= W - 28 || w.y + w.h >= H - 28;
        if (!boundary) burst(s, 'wood', w.x + w.w / 2, w.y + w.h / 2, '#bcaa8d', 6);
        return boundary;
      });
      s.message = '炉心暴走 · 石柱崩塌'; s.messageTime = 2;
      event(s, 'boss-phase', { enemyId: e.id, stage: 2, x: e.x, y: e.y });
    }
    if (e.hp <= 0) {
      s.stats.kills += 1;
      if (s.players[owner]) s.players[owner].kills += 1;
      burst(s, 'enemy-death', e.x, e.y, e.kind === 'boss' ? '#ffc477' : '#ec9c8d', 12);
      event(s, 'enemy-killed', { enemyId: e.id, kind: e.kind, playerId: owner || null });
      if (s.mode === 'chapter' && e.kind === 'boss') {
        s.chapter.bossDefeated = true;
        s.message = '炉心守卫停止了暴走。备用火仍在燃烧，可以带它回营地。'; s.messageTime = 5;
        event(s, 'chapter-boss-defeated', { enemyId: e.id, x: e.x, y: e.y });
      }
      if (s.mode === 'hunt' && e.huntTarget && e.id === s.hunt.targetId) {
        s.hunt.defeated = true; s.hunt.arrival = null; s.hunt.heardFrom = null;
        event(s, 'hunt-defeated', { enemyId: e.id, room: s.room.index, x: e.x, y: e.y });
      }
      if (s.mode === 'random' || s.mode === 'chapter') {
        if (e.kind === 'boss') { if (s.mode === 'random') s.exploration.bossDefeated = true; }
        else {
          if (s.mode === 'random') s.exploration.kills += 1;
          if (e.elite && BUFFS[e.relicBuff]) {
            var available = Object.keys(BUFFS).filter(function (key) { return key !== e.relicBuff && s.runBuffs.indexOf(key) < 0; });
            var choices = s.runBuffs.indexOf(e.relicBuff) < 0 ? [e.relicBuff] : [];
            while (choices.length < 2 && available.length) choices.push(available.splice(Math.floor(random(s) * available.length), 1)[0]);
            choices.forEach(function (key, index) {
              var def = BUFFS[key], point = { id: 'drop-' + e.id + (index ? '-choice' : ''), kind: 'relic', buff: key, group: 'elite-' + e.id,
                x: clamp(e.x + (index ? 30 : -30), 66, W - 66), y: clamp(e.y, 66, H - 66), r: 18,
                label: def.label, description: def.description, active: true, used: false };
              // Place both alternatives in reachable space, including deaths beside cover.
              if (collides(s, point.x, point.y, point.r, null, true)) { point.x = e.x; point.y = e.y; }
              s.interactables.push(point);
            });
            if (choices.length) event(s, 'relic-dropped', { enemyId: e.id, buff: choices[0], x: e.x, y: e.y });
          }
          if (s.mode === 'random') awakenBoss(s);
        }
      }
    }
  }
  function clearPropCarrier(s, q) {
    Object.keys(s.players).forEach(function (key) { if (s.players[key].carry === q.id) s.players[key].carry = null; });
    q.carriedBy = null;
  }
  function destroyCrate(s, q) {
    if (q.destroyed) return;
    q.hp = 0; q.destroyed = true; clearPropCarrier(s, q);
    burst(s, 'wood', q.x, q.y, '#d6a971', 12);
  }
  function explode(s, barrel, owner, source) {
    if (barrel.destroyed) return;
    barrel.destroyed = true; clearPropCarrier(s, barrel);
    s.stats.barrels += 1;
    particle(s, 'explosion', barrel.x, barrel.y, { r: 112, ttl: 0.48, life: 0.48, color: '#ffb256' });
    burst(s, 'spark', barrel.x, barrel.y, '#ffbd69', 22);
    event(s, 'explosion', { x: barrel.x, y: barrel.y });
    event(s, 'environment-hit', { enemyId: null, playerId: s.players[owner] ? owner : null,
      weapon: null, source: source || 'explosion', target: 'prop', propId: barrel.id, x: barrel.x, y: barrel.y });
    huntNoise(s, 3, barrel.x, barrel.y);
    s.enemies.forEach(function (e) {
      if (e.hp <= 0 || dist(e, barrel) >= 112 + e.r) return;
      damageEnemy(s, e, 8, owner, null);
      event(s, 'environment-hit', { enemyId: e.id, playerId: s.players[owner] ? owner : null,
        weapon: null, source: 'explosion', target: 'enemy', amount: 8, propId: barrel.id, x: e.x, y: e.y });
      if (e.huntTarget && e.hp > 0) { e.stagger = 1.2; e.rhythm = null; e.chargeTime = 0; e.attackCd = 1; }
    });
    s.props.forEach(function (p) {
      if (p !== barrel && p.kind === 'barrel' && !p.destroyed && dist(p, barrel) < 110) {
        p.lit = true; p.fuse = p.fuse > 0 ? Math.min(p.fuse, 0.15) : 0.15;
        p.thrower = s.players[owner] ? owner : null;
      }
    });
    // The blast consumes hostile projectiles as a useful emergency tool.
    s.bullets.forEach(function (b) { if (!b.friendly && dist(b, barrel) < 115) b.dead = true; });
  }
  function shoot(s, p) {
    var scatter = p.weapon === 'scatter', n = scatter ? 5 : 1, volley = id(s, 'volley-');
    // A precision defence offers either a sword counter or a ranged follow-up.
    // Firing a gun spends that choice; it never teleports the gunner into a slash.
    p.counterTime = 0; p.counterEnemy = null; p.counterKind = '';
    for (var i = 0; i < n; i += 1) {
      var a = p.facing + (scatter ? (i - 2) * 0.115 : 0);
      s.bullets.push({ id: id(s, 'bullet-'), x: p.x + Math.cos(a) * 23,
        y: p.y + Math.sin(a) * 23, r: scatter ? 4 : 4.5,
        vx: Math.cos(a) * (scatter ? 550 : 650), vy: Math.sin(a) * (scatter ? 550 : 650),
        friendly: true, owner: p.id, damage: 1, ttl: scatter ? 0.65 : 1.3,
        weapon: scatter ? 'scatter' : 'pistol', volleyId: volley, originX: p.x, originY: p.y,
        color: s.runBuffs.indexOf('pierce') >= 0 ? '#d8bcff' : scatter ? '#ffe6a0' : '#c4fff0',
        hitsLeft: s.runBuffs.indexOf('pierce') >= 0 ? 2 : 1, hitIds: [], dead: false });
    }
    p.fireCd = scatter ? 0.54 : 0.205;
    event(s, 'shoot', { playerId: p.id, weapon: p.weapon, x: p.x, y: p.y });
    huntNoise(s, 2, p.x, p.y);
  }
  function hostileBullet(s, e, a, speed, radius) {
    speed *= s.difficulty === 2 ? 1.1 : 1;
    s.bullets.push({ id: id(s, 'bullet-'), x: e.x + Math.cos(a) * (e.r + 9),
      y: e.y + Math.sin(a) * (e.r + 9), r: radius || 6,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      friendly: false, owner: e.id, damage: 1, ttl: 4.2, color: '#ff927e', dead: false,
      weapon: null, volleyId: null, originX: e.x, originY: e.y });
  }
  function lineClear(s, a, b, radius) {
    var d = dist(a, b), n = Math.max(1, Math.ceil(d / 20));
    for (var i = 1; i < n; i += 1) {
      if (collides(s, a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n,
        radius || 4, null, true)) return false;
    }
    return true;
  }
  function meleeLineClear(s, a, b, radius) {
    if (!lineClear(s, a, b, radius)) return false;
    var n = Math.max(1, Math.ceil(dist(a, b) / 8));
    for (var i = 1; i < n; i += 1) {
      var x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n;
      if (s.props.some(function (q) { return solidProp(q) && q.id !== b.id && q.carriedBy !== a.id && !q.thrown &&
        len(q.x - x, q.y - y) < q.r + (radius || 4); })) return false;
    }
    return true;
  }
  function waypoint(s, e, target) {
    if (lineClear(s, e, target, e.r + 2)) return target;
    // A tiny grid search keeps melee guards from becoming stuck behind room pillars.
    var size = 40, cols = 24, rows = 15;
    var sx = clamp(Math.floor(e.x / size), 1, cols - 2), sy = clamp(Math.floor(e.y / size), 1, rows - 2);
    var tx = clamp(Math.floor(target.x / size), 1, cols - 2), ty = clamp(Math.floor(target.y / size), 1, rows - 2);
    var start = sy * cols + sx, end = ty * cols + tx, queue = [start], seen = {};
    var closest = start, closestDistance = Infinity;
    seen[start] = -1;
    for (var head = 0; head < queue.length && head < 360; head += 1) {
      var cur = queue[head];
      var score = len(cur % cols * size + 20 - target.x, Math.floor(cur / cols) * size + 20 - target.y);
      if (score < closestDistance) { closestDistance = score; closest = cur; }
      if (cur === end) break;
      var cx = cur % cols, cy = Math.floor(cur / cols);
      var neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
      for (var k = 0; k < neighbors.length; k += 1) {
        var nx = neighbors[k][0], ny = neighbors[k][1], key = ny * cols + nx;
        if (nx < 1 || nx >= cols - 1 || ny < 1 || ny >= rows - 1 || seen[key] !== undefined) continue;
        if (collides(s, nx * size + 20, ny * size + 20, e.r + 1, null, true)) continue;
        seen[key] = cur; queue.push(key);
      }
    }
    // A large guard cannot occupy the 60px boundary cells. Follow the nearest
    // reachable cell instead of abandoning navigation for a blocked direct line.
    var current = seen[end] === undefined ? closest : end, prev = seen[current];
    if (current === start) return e;
    while (prev !== start && prev !== -1) { current = prev; prev = seen[current]; }
    return { x: current % cols * size + 20, y: Math.floor(current / cols) * size + 20 };
  }
  function angleDelta(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
  function facingEnemy(p, e) { return Math.cos(Math.atan2(e.y - p.y, e.x - p.x) - p.facing) > 0.25; }
  function strikeContains(s, e, r, point) {
    var distance = dist(e, point);
    return distance <= r.range + point.r &&
      (r.arc >= TAU - 0.01 || Math.abs(angleDelta(Math.atan2(point.y - e.y, point.x - e.x), r.angle)) <= r.arc / 2 + 0.08) &&
      lineClear(s, e, point, 3);
  }
  function faceGuardThreat(s, p) {
    // The cue identifies the attack to answer. Mouse position should not silently
    // turn a correctly timed guard away from that close, unobstructed strike.
    var threats = s.enemies.filter(function (e) {
      return e.hp > 0 && e.rhythm && e.rhythm.type === 'combo' && e.rhythm.phase === 'windup' &&
        strikeContains(s, e, e.rhythm, p);
    }).sort(function (a, b) { return a.rhythm.remaining - b.rhythm.remaining || dist(a, p) - dist(b, p); });
    if (threats.length) p.facing = Math.atan2(threats[0].y - p.y, threats[0].x - p.x);
    else {
      var ball = s.bullets.filter(function (b) {
        return !b.friendly && b.fireball && !b.dead && dist(p, b) < 145 &&
          (p.x - b.x) * b.vx + (p.y - b.y) * b.vy > 0;
      }).sort(function (a, b) { return dist(p, a) - dist(p, b); })[0];
      if (ball) p.facing = Math.atan2(ball.y - p.y, ball.x - p.x);
    }
  }
  function grantCounter(s, p, e, kind, noPracticeHeal) {
    p.counterTime = 1.25; p.counterEnemy = e.id; p.counterKind = kind;
    p.guardWindow = 0; p.dashWindow = 0; p.guardStrain = 0; p.guardLoad = 0;
    p.guardCd = Math.min(p.guardCd, 0.12);
    if (kind === 'parry') p.parryChain = Math.min(2, (p.parryChain || 0) + 1);
    if (kind !== 'parry' && s.runBuffs.indexOf('decoy') >= 0) {
      s.decoys.push({ id: id(s, 'decoy-'), playerId: p.id, x: p.dashOriginX, y: p.dashOriginY, r: 14, ttl: 3 });
      if (s.decoys.length > 4) s.decoys.shift();
      event(s, 'decoy', { playerId: p.id, x: p.dashOriginX, y: p.dashOriginY });
    }
    if (s.practice) {
      if (kind === 'parry') s.practiceParries = (s.practiceParries || 0) + 1;
      if (!noPracticeHeal) p.hp = Math.min(p.maxHp, p.hp + 1);
    }
    e.posture = Math.min(e.maxPosture, e.posture + (kind === 'mikiri' ? 2 : 1));
    if (e.posture >= e.maxPosture) {
      breakPosture(s, e, p.id); e.stagger = Math.max(e.stagger, 1.15);
    } else if (kind !== 'parry') { e.stagger = 0.65; e.rhythm = null; }
    openWeakpoint(s, e, p.id, kind);
    var type = kind === 'parry' ? 'perfect-parry' : kind === 'mikiri' ? 'mikiri' : 'perfect-dodge';
    event(s, type, { playerId: p.id, enemyId: e.id, x: p.x, y: p.y });
    particle(s, 'counter', p.x, p.y, { r: 45, ttl: 0.3, life: 0.3, color: '#bfffee' });
  }
  function resolveRhythm(s, e, r) {
    event(s, 'rhythm-beat', { attack: r.type, beat: r.beat, beats: r.beats, enemyId: e.id, x: e.x, y: e.y });
    if (r.type === 'fireball') {
      particle(s, 'counter', e.x + Math.cos(r.angle) * (e.r + 9), e.y + Math.sin(r.angle) * (e.r + 9),
        { r: 24, ttl: 0.24, life: 0.24, color: '#ffd189' });
      hostileBullet(s, e, r.angle, 205, 12);
      var ball = s.bullets[s.bullets.length - 1];
      ball.fireball = true; ball.kind = 'fireball'; ball.reflectable = true; ball.color = '#ffd189'; ball.damage = 1;
      return;
    }
    particle(s, r.type === 'quake' ? 'shockwave' : 'slash', e.x, e.y,
      { r: r.range, angle: r.angle, arc: r.arc, ttl: 0.24, life: 0.24, color: '#ffd28f' });
    if (r.type === 'rush') {
      e.chargeX = Math.cos(r.angle); e.chargeY = Math.sin(r.angle); e.chargeTime = 0.85; e.rushHitIds = [];
      return;
    }
    if (r.targetId) s.decoys = s.decoys.filter(function (d) { return d.id !== r.targetId; });
    alivePlayers(s).forEach(function (p) {
      var currentHit = strikeContains(s, e, r, p);
      var origin = { x: p.dashOriginX, y: p.dashOriginY, r: p.r };
      var crossed = p.dashWindow > 0 && strikeContains(s, e, r, origin);
      if (!currentHit && !crossed) return;
      // Arrival protection is never converted into an earned perfect action.
      if (p.invuln > 0.3) return;
      if (r.type === 'combo' && p.guardWindow > 0 && p.guarding && facingEnemy(p, e)) {
        var rangedParry = p.activeSlot === 'ranged';
        if (rangedParry && !guardBlock(s, p, e, 1, 'combo', true)) return;
        if (!p.downed) grantCounter(s, p, e, 'parry', rangedParry); return;
      }
      if (p.dashWindow > 0) {
        var toward = Math.cos(Math.atan2(e.y - p.dashOriginY, e.x - p.dashOriginX) - Math.atan2(p.dashY, p.dashX)) > 0.55;
        if (r.type === 'thrust' && toward) { grantCounter(s, p, e, 'mikiri'); return; }
        if (r.type !== 'thrust') { grantCounter(s, p, e, 'dodge'); return; }
      }
      if (!currentHit) return;
      if (r.type === 'combo' && p.guarding && facingEnemy(p, e) && p.guardCd < 0.5) {
        p.guardLoad += 1;
        if (p.guardLoad < 3) {
          guardBlock(s, p, e, 1, 'combo', false); return;
        }
      }
      if (p.guarding) {
        p.guarding = false; p.guardWindow = 0; p.guardCd = 0.7; p.guardLoad = 0;
        event(s, 'guard-break', { playerId: p.id, enemyId: e.id, x: p.x, y: p.y });
      }
      damagePlayer(s, p, !s.practice && r.type === 'quake' ? 2 : 1, r.type);
    });
  }
  function rhythmWindup(s, e, type, beat, beats, target) {
    var duration = type === 'combo' ? beat === 1 ? 0.88 : 0.5 : type === 'thrust' ? 1.05 : type === 'quake' ? 1.3 : 1.1;
    e.rhythm = { type: type, phase: 'windup', remaining: duration, duration: duration,
      beat: beat, beats: beats, angle: Math.atan2(target.y - e.y, target.x - e.x), targetId: target.id,
      range: type === 'combo' ? 145 : type === 'thrust' ? 245 : type === 'quake' ? 450 : type === 'rush' || type === 'fireball' ? 560 : 235,
      arc: type === 'combo' ? Math.PI * 0.85 : type === 'thrust' || type === 'rush' ? 0.34 : type === 'fireball' ? 0.14 : type === 'quake' ? TAU : Math.PI * 1.65 };
    e.facing = e.rhythm.angle; e.attack = type; e.windup = 0;
    event(s, 'rhythm-windup', { attack: type, beat: beat, beats: beats, duration: duration, enemyId: e.id, x: e.x, y: e.y });
  }
  function rushMove(s, e, distance) {
    var count = Math.max(1, Math.ceil(distance / 9)), stopped = false;
    e.rushHitIds = e.rushHitIds || [];
    for (var i = 0; i < count; i += 1) {
      var dx = e.chargeX * distance / count, dy = e.chargeY * distance / count;
      // Only a prop on the actual forward path can be crushed; a nearby box
      // behind a wall or behind the beast cannot be hit by a proximity check.
      var wall = collides(s, e.x + dx, e.y + dy, e.r, e.id, true);
      var block = !wall && s.props.find(function (q) {
        return solidProp(q) && !q.thrown && len(q.x - e.x - dx, q.y - e.y - dy) < q.r + e.r - 1;
      });
      if (block) {
        event(s, 'environment-hit', { enemyId: null, playerId: null, weapon: null, source: 'rush',
          target: 'prop', propId: block.id, x: block.x, y: block.y });
        if (block.kind === 'barrel') explode(s, block, null, 'rush');
        else destroyCrate(s, block);
        stopped = true; break;
      }
      var beforeX = e.x, beforeY = e.y;
      move(s, e, dx, dy, false);
      s.enemies.forEach(function (other) {
        if (other === e || other.hp <= 0 || e.rushHitIds.indexOf(other.id) >= 0 ||
            dist(e, other) >= e.r + other.r + 3 || !lineClear(s, e, other, 3)) return;
        e.rushHitIds.push(other.id);
        damageEnemy(s, other, 3, null, null);
        move(s, other, e.chargeX * 70, e.chargeY * 70, false);
        other.stun = Math.max(other.stun, 0.6);
        event(s, 'environment-hit', { enemyId: other.id, playerId: null, weapon: null, source: 'rush',
          target: 'enemy', amount: 3, x: other.x, y: other.y });
      });
      if (len(e.x - beforeX, e.y - beforeY) < distance / count * 0.45) { stopped = true; break; }
      if (e.chargeTime <= 0 || e.hp <= 0) break;
    }
    return stopped;
  }
  function updateRhythm(s, e, target, dt) {
    e.stagger = Math.max(0, e.stagger - dt);
    if (e.stagger > 0) return true;
    var r = e.rhythm;
    if (r) {
      if (r.type === 'rush' && r.phase === 'active' && e.chargeTime > 0) {
        var speed = 430;
        e.chargeTime = Math.max(0, e.chargeTime - dt);
        var blocked = rushMove(s, e, speed * dt);
        particle(s, 'trail', e.x, e.y, { r: e.r, ttl: 0.18, life: 0.18, color: '#efaa72' });
        var decoy = s.decoys.find(function (d) { return dist(e, d) < e.r + d.r + 8; });
        if (decoy) { s.decoys = s.decoys.filter(function (d) { return d.id !== decoy.id; }); e.chargeTime = 0; }
        alivePlayers(s).forEach(function (p) {
          if (dist(e, p) >= e.r + p.r + 20) return;
          if (p.dashWindow > 0 && p.invuln <= 0.3) {
            grantCounter(s, p, e, 'dodge'); e.chargeTime = 0;
          } else if (dist(e, p) < e.r + p.r + 3 && damagePlayer(s, p, 1, 'rush')) e.chargeTime = 0;
        });
        if (blocked || e.chargeTime <= 0) {
          e.chargeTime = 0; e.stagger = blocked ? 1.7 : 0.85; e.rhythm = null; e.attackCd = 1;
          if (blocked) {
            e.posture = 0;
            particle(s, 'shockwave', e.x, e.y, { r: 85, ttl: 0.35, life: 0.35, color: '#e9c49a' });
            event(s, 'brute-wall-hit', { enemyId: e.id, x: e.x, y: e.y });
          }
        }
        return true;
      }
      r.remaining = Math.max(0, r.remaining - dt);
      if (r.remaining > 0) return true;
      if (r.phase === 'windup') {
        r.phase = 'active'; r.duration = 0.12; r.remaining = r.duration;
        resolveRhythm(s, e, r);
      } else if (r.phase === 'active') {
        if (r.beat < r.beats) rhythmWindup(s, e, r.type, r.beat + 1, r.beats, target);
        else { r.phase = 'recover'; r.duration = 0.65; r.remaining = r.duration; }
      } else { e.rhythm = null; e.attackCd = 0.55; }
      return true;
    }
    e.attackCd -= dt;
    var distance = dist(e, target), boss = e.kind === 'boss';
    var type = e.huntTarget ? ['combo', 'rush', 'quake'][e.rhythmCycle % 3] : e.kind === 'brute' ? ['rush', 'quake'][e.rhythmCycle % 2] : e.kind === 'pyromancer' ? 'fireball' :
      ['combo', 'thrust', boss && ((s.mode !== 'random' && s.mode !== 'chapter') || e.stage === 2) ? 'quake' : 'sweep'][e.rhythmCycle % 3];
    if (s.practice && (s.practiceParries || 0) < 4) type = 'combo';
    // A telegraph must start within the strike's reach. Previously a stationary
    // beginner saw slashes at ~168px even though they could only connect at 159px.
    var engageRange = type === 'combo' ? 128 : type === 'thrust' ? 250 : type === 'rush' || type === 'fireball' ? 560 : type === 'quake' ? 460 : 230;
    if (e.attackCd <= 0 && distance < engageRange && lineClear(s, e, target, e.r + 2)) {
      e.rhythmCycle += 1; rhythmWindup(s, e, type, 1, type === 'combo' ? 2 : 1, target); return true;
    }
    var approachRange = type === 'combo' ? 118 : type === 'fireball' ? 320 : type === 'rush' ? 360 : boss ? 150 : 118;
    if (distance > approachRange || !lineClear(s, e, target, e.r + 1)) {
      e.navTime -= dt;
      if (e.navTime <= 0) { var wp = waypoint(s, e, target); e.navX = wp.x; e.navY = wp.y; e.navTime = 0.35; }
      var dx = e.navX - e.x, dy = e.navY - e.y, length = len(dx, dy) || 1;
      move(s, e, dx / length * e.speed * dt, dy / length * e.speed * dt, false);
      e.facing = Math.atan2(target.y - e.y, target.x - e.x);
    }
    return true;
  }
  function meleeAttack(s, p, counter) {
    if (counter) {
      var foe = s.enemies.find(function (e) { return e.id === p.counterEnemy && e.hp > 0; });
      if (foe && dist(p, foe) <= 178 + foe.r && meleeLineClear(s, p, foe, 7)) {
        var angle = Math.atan2(foe.y - p.y, foe.x - p.x), gap = Math.max(0, dist(p, foe) - p.r - foe.r - 8);
        move(s, p, Math.cos(angle) * Math.min(85, gap), Math.sin(angle) * Math.min(85, gap), false);
        if (dist(p, foe) <= 112 + foe.r && meleeLineClear(s, p, foe, 7)) {
          p.facing = angle; p.meleeTime = 0.24; p.fireCd = 0.34; p.guarding = false; p.guardWindow = 0; p.guardAttackLock = 0.28;
          foe.stagger = 0.7; foe.rhythm = null; foe.attackCd = 0.8;
          var counterKind = p.counterKind;
          p.counterTime = 0; p.counterEnemy = null; p.counterKind = '';
          damageEnemy(s, foe, 6, p.id, 'blade');
          openWeakpoint(s, foe, p.id, 'counter');
          var resonance = s.runBuffs.indexOf('resonance') >= 0;
          var riposte = s.runBuffs.indexOf('riposte') >= 0 && p.parryChain >= 2;
          if (resonance || riposte) {
            var radius = riposte ? 165 : 140;
            particle(s, riposte ? 'slash' : 'shockwave', p.x, p.y,
              { r: radius, angle: p.facing, arc: TAU, ttl: 0.32, life: 0.32, color: riposte ? '#d9bdff' : '#a8efe0' });
            s.enemies.forEach(function (other) {
              if (other.hp <= 0 || dist(p, other) > radius + other.r || !meleeLineClear(s, p, other, 3)) return;
              damageEnemy(s, other, (resonance ? 2 : 0) + (riposte ? 3 : 0), p.id, 'blade');
              if (resonance) {
                var knock = Math.atan2(other.y - p.y, other.x - p.x);
                move(s, other, Math.cos(knock) * 55, Math.sin(knock) * 55, false);
                other.stagger = Math.max(other.stagger, 0.45);
              }
            });
            if (riposte) p.parryChain = 0;
          }
          event(s, 'counterattack', { playerId: p.id, enemyId: foe.id, counterKind: counterKind, x: foe.x, y: foe.y });
          return true;
        }
      }
      return false;
    }
    p.meleeTime = 0.18; p.fireCd = 0.38;
    s.enemies.forEach(function (e) {
      if (e.hp <= 0 || dist(p, e) > 74 + e.r || Math.abs(angleDelta(Math.atan2(e.y - p.y, e.x - p.x), p.facing)) > 1.1 || !meleeLineClear(s, p, e, 5)) return;
      var shielded = e.kind === 'shield' && e.shieldOpen <= 0 && e.stun <= 0 && Math.cos(Math.atan2(p.y - e.y, p.x - e.x) - e.facing) > 0.5;
      if (!shielded) {
        damageEnemy(s, e, s.runBuffs.indexOf('pierce') >= 0 ? 3 : 2, p.id, 'blade');
        if (e.hp > 0) {
          e.posture = Math.min(e.maxPosture, e.posture + 0.5);
          if (e.posture >= e.maxPosture) breakPosture(s, e, p.id);
        }
      }
    });
    s.props.forEach(function (q) {
      if (!solidProp(q) || q.carriedBy === p.id || dist(p, q) > 74 + q.r || Math.abs(angleDelta(Math.atan2(q.y - p.y, q.x - p.x), p.facing)) > 1.1 || !meleeLineClear(s, p, q, 4)) return;
      if (q.kind === 'barrel') explode(s, q, p.id);
      else { q.hp -= 3; if (q.hp <= 0) destroyCrate(s, q); }
    });
    event(s, 'shoot', { playerId: p.id, weapon: 'blade', x: p.x, y: p.y });
    huntNoise(s, 2, p.x, p.y);
    return true;
  }
  function updateEnemies(s, dt) {
    var targets = alivePlayers(s);
    if (!targets.length) return;
    s.enemies.forEach(function (e) {
      if (e.hp <= 0) return;
      e.flash = Math.max(0, e.flash - dt); e.stun = Math.max(0, e.stun - dt);
      e.weakTime = Math.max(0, (e.weakTime || 0) - dt);
      e.shieldOpen = Math.max(0, e.shieldOpen - dt);
      if (e.stun > 0) return;
      var decoys = s.decoys.filter(function (d) { return d.ttl > 0 && dist(d, e) < 600 && lineClear(s, e, d, 4); });
      var p = (decoys.length ? decoys : targets).slice().sort(function (a, b) { return dist(a, e) - dist(b, e); })[0];
      if (e.kind === 'duelist' || e.kind === 'boss' || e.kind === 'brute' || e.kind === 'pyromancer') { updateRhythm(s, e, p, dt); return; }
      var d = dist(e, p), dx = p.x - e.x, dy = p.y - e.y;
      if (e.kind === 'charger' && e.chargeTime > 0) {
        var oldX = e.x, oldY = e.y;
        e.chargeTime = Math.max(0, e.chargeTime - dt);
        move(s, e, e.chargeX * 410 * dt, e.chargeY * 410 * dt, false);
        var hit = targets.find(function (q) { return dist(e, q) < e.r + q.r + 6; });
        if (hit) { damagePlayer(s, hit, 1, 'charge'); e.chargeTime = 0; }
        var block = s.props.find(function (q) { return solidProp(q) && dist(e, q) < e.r + q.r + 10; });
        if (block) {
          if (block.kind === 'barrel') explode(s, block, null, 'rush');
          else {
            block.hp -= 3;
            if (block.hp <= 0) {
              block.destroyed = true;
              if (block.carriedBy && s.players[block.carriedBy]) s.players[block.carriedBy].carry = null;
              block.carriedBy = null;
            }
          }
          e.chargeTime = 0;
        }
        if (len(e.x - oldX, e.y - oldY) < 410 * dt * 0.4) e.chargeTime = 0;
        if (e.chargeTime <= 0) { e.stun = 0.8; e.attackCd = 1.7; }
        particle(s, 'trail', e.x, e.y, { r: e.r, ttl: 0.18, life: 0.18, color: '#f39366' });
        return;
      }
      if (e.windup > 0) {
        e.windup -= dt;
        if (e.windup <= 0) {
          var angle = Math.atan2(e.aimY - e.y, e.aimX - e.x);
          s.decoys = s.decoys.filter(function (d) { return d.id !== e.targetId; });
          if (e.kind === 'chaser') {
            targets.forEach(function (q) {
              if (dist(e, q) < e.r + q.r + 27 && !guardBlock(s, q, e, 1, 'melee', false)) damagePlayer(s, q, 1, 'melee');
            });
            particle(s, 'slash', e.x + Math.cos(angle) * 24, e.y + Math.sin(angle) * 24,
              { r: 40, ttl: 0.2, life: 0.2, color: '#ffb095' });
            e.attackCd = 0.9;
          } else if (e.kind === 'shooter' || e.kind === 'shield') {
            hostileBullet(s, e, angle, e.kind === 'shield' ? 185 : 205); e.attackCd = e.kind === 'shield' ? 1.65 : 1.3;
            if (e.kind === 'shield') e.shieldOpen = 0.6;
          } else if (e.kind === 'charger') {
            e.chargeX = Math.cos(angle); e.chargeY = Math.sin(angle); e.chargeTime = 0.65;
            e.facing = angle; e.attackCd = 1.7;
            event(s, 'charger-charge', { enemyId: e.id });
          } else {
            if (e.attack === 'ring') {
              var count = e.hp < e.maxHp * 0.5 ? 12 : 10;
              for (var j = 0; j < count; j += 1) hostileBullet(s, e, e.phase * 0.23 + j * TAU / count, 170, 7);
            } else {
              [-0.23, 0, 0.23].forEach(function (a) { hostileBullet(s, e, angle + a, 250, 7); });
            }
            e.phase += 1; e.attackCd = e.hp < e.maxHp * 0.5 ? 0.65 : 0.95;
            event(s, 'boss-attack', { attack: e.attack });
          }
        }
        return;
      }
      e.attackCd -= dt;
      var inRange = e.kind === 'chaser' ? d < 64 : e.kind === 'charger' ? d < 520 && lineClear(s, e, p, e.r) :
        e.kind === 'boss' ? d < 900 : d < 460 && lineClear(s, e, p, 5);
      if (e.attackCd <= 0 && inRange) {
        e.windup = e.kind === 'chaser' ? 0.36 : e.kind === 'shooter' ? 0.6 : e.kind === 'shield' ? 0.85 : e.kind === 'charger' ? 0.85 : 0.78;
        e.aimX = p.x; e.aimY = p.y;
        e.targetId = p.id;
        if (e.kind !== 'shield') e.facing = Math.atan2(dy, dx);
        e.attack = e.kind === 'charger' ? 'charge' : e.kind === 'boss' && e.phase % 2 === 0 ? 'ring' : 'aim';
        event(s, 'enemy-windup', { enemyId: e.id, kind: e.kind, attack: e.attack });
        return;
      }
      var wantsMove = e.kind === 'chaser' ? d > 45 : e.kind === 'charger' ? d > 220 || !lineClear(s, e, p, e.r) :
        e.kind === 'boss' ? d > 275 : d > 275 || !lineClear(s, e, p, 5);
      if (wantsMove) {
        e.navTime -= dt;
        if (e.navTime <= 0) {
          var wp = waypoint(s, e, p); e.navX = wp.x; e.navY = wp.y; e.navTime = 0.4;
        }
        dx = e.navX - e.x; dy = e.navY - e.y;
        var l = len(dx, dy) || 1;
        if (e.kind !== 'shield') e.facing = Math.atan2(dy, dx);
        move(s, e, dx / l * e.speed * dt, dy / l * e.speed * dt, false);
      } else if (e.kind !== 'shield') e.facing = Math.atan2(dy, dx);
      if (e.kind === 'shield') {
        var delta = Math.atan2(Math.sin(Math.atan2(p.y - e.y, p.x - e.x) - e.facing),
          Math.cos(Math.atan2(p.y - e.y, p.x - e.x) - e.facing));
        e.facing += clamp(delta, -1.15 * dt, 1.15 * dt);
      }
    });
  }
  function updateBullets(s, dt) {
    var pushes = [];
    s.bullets.forEach(function (b) {
      if (b.dead) return;
      b.ttl -= dt;
      var n = Math.max(1, Math.ceil(len(b.vx, b.vy) * dt / 10));
      for (var stepIndex = 0; stepIndex < n && !b.dead; stepIndex += 1) {
        b.x += b.vx * dt / n; b.y += b.vy * dt / n;
        if (b.x < 25 || b.x > W - 25 || b.y < 25 || b.y > H - 25 ||
            s.walls.some(function (w) { return circleRect(b, w); }) ||
            s.doors.some(function (door) { return door.locked && circleRect(b, door); })) {
          b.dead = true; burst(s, 'spark', b.x, b.y, '#c7c5a8', 2); break;
        }
        var hitProp = s.props.find(function (p) { return solidProp(p) && p.carriedBy !== b.owner &&
          dist(p, b) < p.r + b.r; });
        if (hitProp) {
          b.dead = true;
          if (hitProp.kind === 'barrel') explode(s, hitProp, b.owner, b.fireball ? 'fireball' : 'explosion');
          else {
            hitProp.hp -= b.damage;
            burst(s, 'wood', b.x, b.y, '#d6a971', 4);
            if (hitProp.hp <= 0) {
              destroyCrate(s, hitProp);
            }
          }
          break;
        }
        if (b.friendly) {
          var foe = s.enemies.find(function (e) { return e.hp > 0 && (!b.hitIds || b.hitIds.indexOf(e.id) < 0) && dist(e, b) < e.r + b.r; });
          if (foe) {
            var front = foe.kind === 'shield' && foe.stun <= 0 && foe.shieldOpen <= 0 &&
              Math.cos(Math.atan2(b.y - foe.y, b.x - foe.x) - foe.facing) > 0.5;
            if (front) { b.dead = true; burst(s, 'spark', b.x, b.y, '#a9d7ff', 3); }
            else {
              var weakShot = b.weapon === 'pistol' && foe.weakTime > 0, amount = b.damage + (weakShot ? 2 : 0);
              if (weakShot) {
                foe.weakTime = 0;
                event(s, 'weakpoint-hit', { enemyId: foe.id, playerId: s.players[b.owner] ? b.owner : null,
                  weapon: 'pistol', amount: amount, source: 'pistol', x: foe.x, y: foe.y });
              }
              damageEnemy(s, foe, amount, b.owner, b.weapon || null, weakShot);
              if (b.weapon === 'scatter' && foe.hp > 0 && len(foe.x - b.originX, foe.y - b.originY) <= 190 &&
                  (foe.scatterVolleys || []).indexOf(b.volleyId) < 0) {
                foe.lastScatterVolley = b.volleyId; foe.scatterVolleys = (foe.scatterVolleys || []).concat(b.volleyId).slice(-8);
                pushes.push({ enemy: foe, bullet: b });
              }
              b.hitIds = b.hitIds || []; b.hitIds.push(foe.id);
              b.hitsLeft = (b.hitsLeft || 1) - 1; b.dead = b.hitsLeft <= 0;
            }
          }
        } else {
          var shadow = s.decoys.find(function (d) { return dist(d, b) < d.r + b.r; });
          if (shadow) { s.decoys = s.decoys.filter(function (d) { return d.id !== shadow.id; }); b.dead = true; }
          var target = !b.dead && alivePlayers(s).find(function (p) { return dist(p, b) < p.r + b.r + (b.fireball ? 9 : 0); });
          if (target) {
            if (b.fireball && target.guardWindow > 0 && target.guarding && target.invuln <= 0.3 && facingEnemy(target, b)) {
              var rangedReflection = target.activeSlot === 'ranged';
              if (rangedReflection && !guardBlock(s, target, b, b.damage, 'fireball', true)) { b.dead = true; break; }
              if (target.downed) { b.dead = true; break; }
              var caster = s.enemies.find(function (e) { return e.id === b.owner && e.hp > 0; });
              var angle = caster ? Math.atan2(caster.y - b.y, caster.x - b.x) : Math.atan2(-b.vy, -b.vx);
              b.friendly = true; b.owner = target.id; b.vx = Math.cos(angle) * 390; b.vy = Math.sin(angle) * 390;
              b.damage = 7; b.color = '#aaffdf'; b.hitsLeft = 1; b.hitIds = []; b.ttl = 3;
              if (caster) grantCounter(s, target, caster, 'parry', rangedReflection);
              else target.guardWindow = 0;
              event(s, 'fireball-reflected', { playerId: target.id, enemyId: caster ? caster.id : null, x: b.x, y: b.y });
              break;
            }
            if (dist(target, b) < target.r + b.r) {
              if (b.fireball || !guardBlock(s, target, b, b.damage, 'bullet', false)) damagePlayer(s, target, b.damage, 'bullet');
              b.dead = true;
            }
          }
        }
      }
      if (b.ttl <= 0) b.dead = true;
    });
    // Resolve knockback after this tick's pellet collisions, so one pellet's
    // impact does not erase damage from the rest of its simultaneous volley.
    pushes.forEach(function (entry) {
      var foe = entry.enemy, b = entry.bullet;
      if (foe.hp <= 0) return;
      var boss = foe.kind === 'boss' || foe.huntTarget, elite = foe.elite || /^(duelist|brute|pyromancer)$/.test(foe.kind);
      var amount = boss ? 12 : elite ? 20 : 45, angle = Math.atan2(b.vy, b.vx);
      var x = foe.x, y = foe.y;
      move(s, foe, Math.cos(angle) * amount, Math.sin(angle) * amount, false);
      if (!boss && !elite) foe.stun = Math.max(foe.stun, 0.2);
      event(s, 'scatter-push', { enemyId: foe.id, playerId: s.players[b.owner] ? b.owner : null, weapon: 'scatter',
        volleyId: b.volleyId, amount: len(foe.x - x, foe.y - y), x: foe.x, y: foe.y });
    });
    s.bullets = s.bullets.filter(function (b) { return !b.dead; });
    if (s.bullets.length > 160) s.bullets.splice(0, s.bullets.length - 160);
    s.enemies = s.enemies.filter(function (e) { return e.hp > 0; });
  }
  function catchCore(s, core) {
    var catcher = alivePlayers(s).find(function (p) {
      return !p.carry && p.guarding && !(p.id === core.thrower && core.catchLock > 0) &&
        dist(p, core) < p.r + core.r + 16 && lineClear(s, p, core, 3);
    });
    if (!catcher) return false;
    var perfect = catcher.guardWindow > 0;
    catcher.carry = core.id; core.carriedBy = catcher.id;
    core.thrown = false; core.vx = 0; core.vy = 0; core.flightTime = 0; core.catchLock = 0;
    catcher.guarding = false; catcher.guardWindow = 0;
    activateRelayAlarm(s);
    s.relay.catches += 1;
    if (perfect) { s.relay.perfectCatches += 1; catcher.relayBoost = 3; }
    event(s, 'core-catch', { playerId: catcher.id, propId: core.id, x: catcher.x, y: catcher.y, perfect: perfect });
    burst(s, 'spark', catcher.x, catcher.y, perfect ? '#fff0ac' : '#9cf3df', perfect ? 12 : 6);
    updateCarries(s); return true;
  }
  function updateCore(s, core, dt) {
    core.destroyed = false; core.lit = false; core.fuse = 0;
    core.knockCd = Math.max(0, finite(core.knockCd, 0) - dt);
    core.catchLock = Math.max(0, finite(core.catchLock, 0) - dt);
    if (core.carriedBy) return;
    if (!core.thrown && core.knockCd <= 0) {
      var knocker = s.enemies.find(function (e) {
        return e.hp > 0 && e.stun <= 0 && e.stagger <= 0 && dist(e, core) < e.r + core.r + 12;
      });
      if (knocker) {
        var away = Math.atan2(core.y - knocker.y, core.x - knocker.x);
        core.vx = Math.cos(away) * 175; core.vy = Math.sin(away) * 175;
        core.thrown = true; core.flightTime = 0.7; core.knockCd = 1.2;
        core.thrower = null; core.hitIds = [knocker.id];
        event(s, 'core-knock', { enemyId: knocker.id, propId: core.id, x: core.x, y: core.y });
      }
    }
    if (!core.thrown) return;
    core.flightTime = Math.max(0, core.flightTime - dt);
    var parts = Math.max(1, Math.ceil(Math.max(Math.abs(core.vx * dt), Math.abs(core.vy * dt)) / 6));
    if (catchCore(s, core)) return;
    for (var i = 0; i < parts && core.thrown; i += 1) {
      var dx = core.vx * dt / parts, dy = core.vy * dt / parts;
      if (!collides(s, core.x + dx, core.y, core.r, core.id, false)) core.x += dx;
      else core.vx *= -0.45;
      if (!collides(s, core.x, core.y + dy, core.r, core.id, false)) core.y += dy;
      else core.vy *= -0.45;
      if (catchCore(s, core)) return;
      var foe = s.enemies.find(function (e) {
        return e.hp > 0 && core.hitIds.indexOf(e.id) < 0 && dist(e, core) < e.r + core.r;
      });
      if (foe) {
        core.hitIds.push(foe.id); foe.stun = Math.max(foe.stun, 0.8); foe.stagger = Math.max(foe.stagger, 0.8);
        foe.rhythm = null; foe.windup = 0; foe.chargeTime = 0;
        if (core.thrower) damageEnemy(s, foe, 2, core.thrower, null);
        core.vx *= -0.32; core.vy *= -0.32; core.knockCd = 1.2;
        core.flightTime = Math.min(core.flightTime, 0.5);
        event(s, 'core-knock', { enemyId: foe.id, propId: core.id, x: core.x, y: core.y });
      }
    }
    core.vx *= Math.pow(0.34, dt); core.vy *= Math.pow(0.34, dt);
    if (core.flightTime <= 0 || len(core.vx, core.vy) < 35) {
      core.thrown = false; core.flightTime = 0; core.vx = 0; core.vy = 0;
    }
  }
  function updateProps(s, dt) {
    s.props.forEach(function (p) {
      if (p.kind === 'core' && s.relay) { updateCore(s, p, dt); return; }
      if (p.destroyed || p.carriedBy) return;
      if (p.thrown) {
        var oldX = p.x, oldY = p.y;
        var fullX = p.vx * dt, fullY = p.vy * dt;
        move(s, p, fullX, fullY, true);
        var collided = Math.abs(p.x - oldX - fullX) > 0.1 || Math.abs(p.y - oldY - fullY) > 0.1;
        var hit = s.enemies.some(function (e) { return e.hp > 0 && dist(e, p) < e.r + p.r; });
        p.vx *= Math.pow(0.45, dt); p.vy *= Math.pow(0.45, dt);
        if (collided || hit) explode(s, p, p.thrower || null);
      }
      if (p.lit && !p.destroyed) {
        p.fuse -= dt;
        if (p.fuse <= 0) explode(s, p, p.thrower || null);
      }
    });
    s.props = s.props.filter(function (p) { return !p.destroyed; });
    s.switches.forEach(function (sw) {
      sw.pressed = s.props.some(function (p) {
        return p.kind === 'crate' && !p.carriedBy && !p.thrown && dist(p, sw) < sw.r + 7;
      });
      if (sw.pressed && !s.secretOpened) {
        s.secretOpened = true; s.rooms[5].discovered = true;
        s.message = '星纹暗门已开启！'; s.messageTime = 3;
        event(s, 'secret-open'); burst(s, 'secret', 814, 163, '#f9d77f', 20);
      }
    });
    if (s.mode !== 'random' && s.room.index === 4 && s.secretOpened) {
      s.portals.forEach(function (p) { if (p.secret) p.active = true; });
      s.doors.forEach(function (d) { if (d.secret) d.locked = false; });
    }
  }
  function collectPickups(s) {
    s.pickups = s.pickups.filter(function (item) {
      var p = alivePlayers(s).find(function (q) { return q.hp < q.maxHp && dist(q, item) < q.r + item.r + 8; });
      if (!p) return true;
      p.hp = Math.min(p.maxHp, p.hp + item.amount);
      event(s, 'heal', { playerId: p.id, amount: item.amount });
      burst(s, 'heal', p.x, p.y, '#8ce6b0', 9);
      return false;
    });
  }
  function getHint(s, playerId) {
    var p = s.players[playerId || 'p1'];
    if (!p) return '';
    if (p.downed) return '等待搭档靠近按 E 救援';
    var buddy = Object.keys(s.players).map(function (key) { return s.players[key]; })
      .find(function (q) { return q.downed && q.id !== p.id && dist(q, p) < 78; });
    if (buddy) return 'E · 救起搭档';
    var held = s.props.find(function (q) { return q.id === p.carry; });
    if (held && held.kind === 'core') {
      if (s.room.index === s.relay.extractionRoom && s.interactables.some(function (q) {
        return q.kind === 'relay-extraction' && dist(p, q) < 76;
      })) return 'E · 交付炉芯';
      return 'E · 朝瞄准方向投掷炉芯';
    }
    if (held && held.kind === 'water' && held.charges < 3 &&
        s.fountains.some(function (f) { return dist(p, f) < 78; })) return 'E · 在泉眼补满水桶';
    if (held) return held.kind === 'water' ? (held.charges ? 'E · 朝瞄准方向浇水并放下' : '空桶：带回蓝色泉眼按 E 补水') :
      held.kind === 'barrel' ? 'E · 投掷炸药桶' : 'E · 放下木箱';
    var special = s.interactables.filter(function (q) { return !q.used && q.kind !== 'relay-extraction' && dist(p, q) < 76; })
      .sort(function (a, b) { return dist(p, a) - dist(p, b); })[0];
    if (special) {
      if (!special.active) return special.kind === 'chapter-fire' ? '炉心仍在暴走' :
        special.kind === 'chapter-lamp' ? '归途灯还缺火种' : special.kind === 'cache' ? '先清理守卫，再按 E 搜索补给箱' :
        special.kind === 'extraction' ? '补给尚未齐全：返回前 3 间房搜索蓝箱' : '守住当前波次后可操作信标';
      return 'E · ' + special.label + (special.kind === 'relic' && s.mode !== 'random' ? '（同组只能选一件）' : '');
    }
    var near = s.props.filter(function (q) { return !q.destroyed && !q.carriedBy && !q.thrown &&
      dist(p, q) < 74; })
      .sort(function (a, b) { return dist(p, a) - dist(p, b); })[0];
    if (near) return 'E · 搬起' + ({ crate: '木箱', barrel: '炸药桶', water: '水桶', core: '炉芯' })[near.kind];
    if (s.mode === 'relay' && s.props.some(function (q) { return q.kind === 'core' && q.thrown && dist(p, q) < 190; })) return 'K / 右键 · 接住炉芯';
    var gate = s.portals.find(function (g) { return g.active && dist(p, g) < 85; });
    if (gate) return '踏入光门 / E · ' + gate.label;
    return s.mode === 'random' || s.mode === 'relay' || s.mode === 'hunt' || s.mode === 'chapter' ? '' : s.hint;
  }
  function step(s, inputs, dt) {
    if (!s || s.status !== 'playing') return s;
    dt = clamp(finite(Number(dt), 1 / 60), 0, 0.05);
    inputs = inputs || {};
    s.events = []; s.time += dt; s.elapsed += dt;
    s.combatEvents = (s.combatEvents || []).filter(function (entry) { return s.time - entry.time <= 2; }).slice(-24);
    s.travelCd = Math.max(0, s.travelCd - dt); s.messageTime = Math.max(0, s.messageTime - dt);
    var roomBefore = s.room.index;
    Object.keys(s.players).forEach(function (key) {
      var p = s.players[key], input = inputs[key] || {};
      var dashEdge = !!input.dash && !p.prevDash, interactEdge = !!input.interact && !p.prevInteract;
      var guardEdge = !!input.guardPulse || !!input.guard && !p.prevGuard, shootEdge = !!input.shoot && !p.prevShoot;
      var switchEdge = !!input.switchPulse || !!input.switchWeapon && !p.prevSwitch;
      p.prevDash = !!input.dash; p.prevInteract = !!input.interact;
      p.prevGuard = !!input.guard; p.prevShoot = !!input.shoot; p.prevSwitch = !!input.switchWeapon;
      var oldX = p.x, oldY = p.y;
      p.invuln = Math.max(0, p.invuln - dt); p.dashCd = Math.max(0, p.dashCd - dt);
      p.fireCd = Math.max(0, p.fireCd - dt);
      p.switchCd = Math.max(0, p.switchCd - dt);
      p.guardWindow = Math.max(0, p.guardWindow - dt); p.guardCd = Math.max(0, p.guardCd - dt);
      p.guardStrain = Math.max(0, p.guardStrain - dt * 0.5);
      p.guardAttackLock = Math.max(0, p.guardAttackLock - dt);
      p.dashWindow = Math.max(0, p.dashWindow - dt); p.meleeTime = Math.max(0, p.meleeTime - dt);
      p.counterTime = Math.max(0, p.counterTime - dt);
      p.relayBoost = Math.max(0, finite(p.relayBoost, 0) - dt);
      if (p.counterTime <= 0 || !s.enemies.some(function (e) { return e.id === p.counterEnemy && e.hp > 0; })) {
        p.counterTime = 0; p.counterEnemy = null; p.counterKind = '';
      }
      if (!input.guard) p.guardLoad = Math.max(0, p.guardLoad - dt * 0.7);
      if (p.downed) return;
      var switched = switchEdge && switchWeapon(s, p);
      var aimX = finite(Number(input.aimX), p.x + Math.cos(p.facing) * 100);
      var aimY = finite(Number(input.aimY), p.y + Math.sin(p.facing) * 100);
      if (len(aimX - p.x, aimY - p.y) > 2) p.facing = Math.atan2(aimY - p.y, aimX - p.x);
      var mx = clamp(finite(Number(input.mx), 0), -1, 1), my = clamp(finite(Number(input.my), 0), -1, 1);
      var magnitude = len(mx, my);
      if (magnitude > 1) { mx /= magnitude; my /= magnitude; }
      if (!switched && guardEdge && p.guardCd <= 0 && p.guardAttackLock <= 0 && p.dashTime <= 0 && !p.carry) {
        p.guardWindow = 0.38; p.guardStrain = 0; p.guardCd = 0.2;
      }
      if (p.guardWindow > 0) faceGuardThreat(s, p);
      p.guarding = (!!input.guard || p.guardWindow > 0) && p.guardCd < 0.5 && p.guardAttackLock <= 0 && p.dashTime <= 0 && !p.carry;
      p.sneaking = (!!input.guard || p.guardWindow > 0) && p.dashTime <= 0;
      if (dashEdge && p.dashCd <= 0) {
        p.dashX = magnitude > 0.1 ? mx / (len(mx, my) || 1) : Math.cos(p.facing);
        p.dashY = magnitude > 0.1 ? my / (len(mx, my) || 1) : Math.sin(p.facing);
        p.dashTime = 0.17; p.dashCd = s.runBuffs.indexOf('swift') >= 0 ? 0.75 : 1.15; p.invuln = Math.max(p.invuln, 0.3);
        p.dashOriginX = p.x; p.dashOriginY = p.y; p.dashWindow = 0.28; p.guarding = false; p.guardWindow = 0; p.sneaking = false;
        event(s, 'dash', { playerId: key, x: p.x, y: p.y });
        huntNoise(s, 2, p.x, p.y);
      }
      if (p.dashTime > 0) {
        p.dashTime = Math.max(0, p.dashTime - dt);
        var dashSpeed = s.mode === 'relay' && p.carry === s.relay.coreId ? 380 : 570;
        move(s, p, p.dashX * dashSpeed * dt, p.dashY * dashSpeed * dt, false);
        particle(s, 'trail', p.x, p.y, { r: p.r, ttl: 0.2, life: 0.2, color: p.color });
      } else {
        var held = s.props.find(function (q) { return q.id === p.carry; });
        var speed = held ? held.kind === 'crate' ? 128 : 155 : 195;
        if (s.runBuffs.indexOf('swift') >= 0) speed *= 1.15;
        if (p.relayBoost > 0) speed *= 1.2;
        if (p.sneaking) speed *= 0.55;
        move(s, p, mx * speed * dt, my * speed * dt, false);
      }
      var usedCounter = shootEdge && p.activeSlot === 'melee' && p.counterTime > 0 && !p.carry && meleeAttack(s, p, true);
      if (!usedCounter && input.shoot && p.fireCd <= 0 && !p.guarding && !p.carry) {
        if (p.weapon === 'blade') meleeAttack(s, p, false); else shoot(s, p);
      }
      p.vx = dt > 0 ? (p.x - oldX) / dt : 0; p.vy = dt > 0 ? (p.y - oldY) / dt : 0;
      p.moving = Math.abs(p.vx) + Math.abs(p.vy) > 1;
      if (s.mode === 'hunt' && p.moving && !p.sneaking && p.dashTime <= 0 && s.time - (s.hunt.stepAt[key] || 0) >= 0.85) {
        s.hunt.stepAt[key] = s.time; huntNoise(s, 1, p.x, p.y);
      }
      if (interactEdge) interact(s, key);
    });
    if (s.room.index !== roomBefore) return s;
    updateCarries(s); updateProps(s, dt); updateHunt(s, dt); updateEnemies(s, dt); updateBullets(s, dt);
    if (s.status !== 'playing') return s;
    alivePlayers(s).forEach(function (p) {
      if (s.fires.some(function (f) { return f.active && dist(f, p) < f.r + p.r - 5; })) damagePlayer(s, p, 1, 'fire');
    });
    s.decoys = s.decoys.filter(function (d) { d.ttl -= dt; return d.ttl > 0; });
    collectPickups(s); updateRoomEvent(s); updateHoldout(s, dt); refreshProgress(s);
    s.particles = s.particles.filter(function (fx) {
      fx.ttl -= dt; fx.x += fx.vx * dt; fx.y += fx.vy * dt; return fx.ttl > 0;
    });
    if (s.status === 'playing' && s.travelCd <= 0) {
      var gate = s.portals.find(function (portal) {
        return portal.active && alivePlayers(s).some(function (p) { return dist(p, portal) < portal.r + 1; });
      });
      if (gate) enterRoom(s, gate.target);
    }
    return s;
  }
  function snapshot(s, compact) {
    var result = clone(s);
    if (compact) {
      result.roomData = {};
      result.particles = result.particles.slice(-24);
      result.events = result.events.slice(-12);
      // Cached navigation is host-only; guests only draw current positions.
      result.enemies.forEach(function (e) { delete e.navX; delete e.navY; delete e.navTime; });
    }
    return result;
  }

  return { W: W, H: H, VERSION: 1, MISSIONS: clone(MISSIONS), CHAPTER_NOTES: clone(CHAPTER_NOTES), BUFFS: clone(BUFFS), create: create, addPlayer: addPlayer,
    removePlayer: removePlayer, step: step, interact: interact, enterRoom: enterRoom,
    snapshot: snapshot, getHint: getHint };
});
