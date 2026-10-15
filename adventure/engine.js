(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdventureEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // A deterministic, JSON-safe simulation. Positions and aim points are world pixels;
  // step's dt is seconds. Shoot is held; dash and interact are rising-edge actions.
  var W = 960, H = 600, TAU = Math.PI * 2;
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
  function player(idValue, index, weapon) {
    return { id: idValue, name: index ? '萤火搭档' : '探险队长', x: 128, y: 275 + index * 52,
      r: 14, hp: 6, maxHp: 6, weapon: weapon, color: index ? '#f5b655' : '#72dfc7',
      facing: 0, vx: 0, vy: 0, moving: false, dashCd: 0, dashTime: 0, dashX: 1, dashY: 0, invuln: 0,
      fireCd: 0, downed: false, carry: null, kills: 0, prevDash: false, prevInteract: false };
  }
  function addPlayer(s, requestedId) {
    var key = requestedId || (s.players.p1 ? 'p2' : 'p1');
    if (s.players[key]) return s.players[key];
    if (Object.keys(s.players).length >= 2) return null;
    var index = Object.keys(s.players).length;
    var p = player(key, index, s.loadout);
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
    var s = { version: 1, width: W, height: H, seed: seed, rng: seed || 1, serial: 0,
      time: 0, elapsed: 0, status: 'playing', loadout: options.loadout === 'scatter' ? 'scatter' : 'pistol',
      unlocks: clone(options.unlocks || {}), playerCount: 0, players: {}, enemies: [], bullets: [], props: [],
      particles: [], events: [], walls: [], doors: [], portals: [], fires: [], switches: [], pickups: [], fountains: [],
      room: null, roomData: {}, rooms: ROOM_DEFS.map(function (r, i) {
        return { index: i, id: r.id, name: r.name, kind: r.kind,
          cleared: r.kind === 'camp', visited: false, discovered: r.kind !== 'secret' };
      }), travelCd: 0, secretOpened: false, secretCleared: false, reward: null, rewardGranted: false,
      stats: { kills: 0, damage: 0, revives: 0, barrels: 0, fires: 0, rooms: 0 },
      hint: '', objective: '', message: '', messageTime: 0 };
    addPlayer(s, 'p1');
    if (options.players === 2) addPlayer(s, 'p2');
    enterRoom(s, 0, true);
    return s;
  }
  function prop(s, kind, x, y) {
    return { id: id(s, 'prop-'), kind: kind, x: x, y: y,
      r: kind === 'crate' ? 20 : kind === 'barrel' ? 17 : 13,
      hp: kind === 'crate' ? 9 : 1, maxHp: kind === 'crate' ? 9 : 1,
      carriedBy: null, thrown: false, vx: 0, vy: 0, fuse: 0, lit: false,
      charges: kind === 'water' ? 3 : 0, destroyed: false };
  }
  function enemy(s, kind, x, y) {
    var hp = kind === 'boss' ? (s.playerCount > 1 ? 58 : 42) : kind === 'shooter' ? 3 : 3;
    return { id: id(s, 'enemy-'), kind: kind, x: x, y: y, r: kind === 'boss' ? 34 : 16,
      hp: hp, maxHp: hp, speed: kind === 'boss' ? 43 : kind === 'chaser' ? 78 : 40,
      facing: Math.PI, attackCd: 0.65 + random(s) * 0.6, windup: 0, attack: '',
      aimX: 0, aimY: 0, phase: 0, flash: 0, stun: 0, navTime: 0, navX: x, navY: y };
  }
  function roomContent(s, index) {
    var data = { walls: [rect(0, 0, W, 28), rect(0, H - 28, W, 28),
      rect(0, 0, 28, H), rect(W - 28, 0, 28, H)],
      doors: [{ id: 'east-door', x: 916, y: 256, w: 16, h: 88, locked: false, label: '出口' }],
      portals: [], props: [], enemies: [], fires: [], switches: [], pickups: [], fountains: [] };
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
      addProp('water', 235, 400); addFire(490, 305, 35); addFire(730, 165, 29);
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
    if (defs.next !== null) data.portals.push({ id: 'next-portal', x: 884, y: 300,
      r: 26, target: defs.next, active: index === 0, label: index === 0 ? '开始探险' : '下一房间' });
    if (index > 0) data.portals.push({ id: 'back-portal', x: 70, y: 300, r: 22,
      target: index === 5 || index === 6 ? 4 : index - 1, active: false, back: true, label: '返回' });
    return data;
  }
  function saveRoom(s) {
    if (!s.room) return;
    var data = {};
    ['walls', 'doors', 'portals', 'props', 'enemies', 'fires', 'switches', 'pickups', 'fountains'].forEach(function (key) {
      data[key] = clone(s[key]);
    });
    // Carried objects travel with their owner; don't duplicate them on revisits.
    data.props = data.props.filter(function (p) { return !p.carriedBy; });
    s.roomData[s.room.index] = data;
  }
  function enterRoom(s, index, initial) {
    index = Number(index);
    if (!Number.isInteger(index) || !ROOM_DEFS[index] || s.status !== 'playing') return false;
    var carried = s.props.filter(function (p) { return p.carriedBy && !p.destroyed; });
    if (!initial) saveRoom(s);
    var data = s.roomData[index] ? clone(s.roomData[index]) : roomContent(s, index);
    ['walls', 'doors', 'portals', 'props', 'enemies', 'fires', 'switches', 'pickups', 'fountains'].forEach(function (key) {
      s[key] = data[key];
    });
    carried.forEach(function (p) { if (!s.props.some(function (q) { return q.id === p.id; })) s.props.push(p); });
    s.rooms[index].visited = true; s.rooms[index].discovered = true;
    s.room = clone(s.rooms[index]);
    s.bullets = []; s.particles = []; s.travelCd = 0.9;
    Object.keys(s.players).forEach(function (key, i) {
      var p = s.players[key]; p.x = 130; p.y = 275 + i * 52;
      p.invuln = Math.max(p.invuln, 0.9); p.dashTime = 0;
    });
    updateCarries(s); refreshProgress(s);
    event(s, 'room-enter', { room: index, name: s.room.name });
    s.message = s.room.name; s.messageTime = 2;
    return true;
  }
  function setHint(s) {
    var i = s.room.index;
    if (i === 0) {
      s.objective = '穿过东侧光门，开始一次短途探险';
      s.hint = 'WASD 移动 · 鼠标瞄准 / 按住射击 · 空格闪避 · E 搬运与使用';
    } else if (i === 4) {
      s.objective = s.room.cleared ? '进入炉心；木箱压住星纹开关可打开隐藏室' : '拿起蓝色水桶，靠近火焰按 E 浇水，开启水闸';
      s.hint = s.secretOpened ? '星纹暗门已开启：北侧光门通往隐藏星藏室' : '水桶朝瞄准方向浇水，回蓝色泉眼按 E 补满；木箱能压住金色开关';
    } else if (i === 6) {
      s.objective = '击败炉心守卫，带回星屑';
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
  function refreshProgress(s) {
    var clear = s.room.kind === 'camp' ||
      (s.room.kind === 'puzzle' ? s.fires.every(function (f) { return !f.active; }) : s.enemies.length === 0);
    if (clear && !s.rooms[s.room.index].cleared) {
      s.rooms[s.room.index].cleared = true; s.stats.rooms += 1;
      event(s, 'room-clear', { room: s.room.index });
      s.message = '房间清理完成 · 出口已开启'; s.messageTime = 2.4;
      if (s.room.kind === 'secret') {
        s.secretCleared = true;
        alivePlayers(s).forEach(function (p) { p.hp = p.maxHp; });
        event(s, 'secret-clear', { coins: 8 });
        particle(s, 'text', 480, 285, { text: '星藏补给 +8 星屑', r: 30, ttl: 2, life: 2, color: '#e4c77e' });
      } else if (s.room.kind !== 'boss' && s.room.kind !== 'puzzle') {
        s.pickups.push({ id: id(s, 'pickup-'), kind: 'heart', x: 790, y: 300, r: 14, amount: 2 });
      }
    }
    s.room.cleared = s.rooms[s.room.index].cleared;
    s.portals.forEach(function (p) { if (!p.secret) p.active = s.room.cleared; });
    s.doors.forEach(function (d) { if (!d.secret) d.locked = !s.room.cleared; });
    if (s.room.kind === 'boss' && clear && s.status === 'playing') finish(s, 'won');
    setHint(s);
  }
  function finish(s, status) {
    if (s.status !== 'playing') return;
    s.status = status;
    s.bullets = [];
    if (status === 'won' && !s.rewardGranted) {
      s.rewardGranted = true;
      s.reward = { coins: 40 + (s.secretCleared ? 12 : 0),
        secret: s.secretCleared, elapsed: Math.round(s.elapsed), kills: s.stats.kills };
      event(s, 'reward', clone(s.reward));
      s.message = '炉心已熄，探险成功！'; s.objective = '带着星屑返回营地，解锁散弹起始武器';
    } else if (status === 'lost') {
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
    if (throwing && item.kind === 'barrel') {
      item.thrown = true; item.lit = true; item.fuse = 1.15; item.thrower = p.id;
      item.vx = Math.cos(a) * 360; item.vy = Math.sin(a) * 360;
      event(s, 'throw', { playerId: p.id, propId: item.id });
    } else event(s, 'drop', { playerId: p.id, propId: item.id });
    return true;
  }
  function interact(s, playerId) {
    if (s.status !== 'playing') return false;
    var p = s.players[playerId];
    if (!p || p.downed) return false;
    var downed = Object.keys(s.players).map(function (key) { return s.players[key]; })
      .find(function (q) { return q.downed && q.id !== p.id && dist(p, q) < 78; });
    if (downed) {
      downed.downed = false; downed.hp = 3; downed.invuln = 1.8;
      downed.prevInteract = true; s.stats.revives += 1;
      event(s, 'revive', { playerId: downed.id, by: p.id });
      burst(s, 'heal', downed.x, downed.y, '#83f2b5', 12);
      return true;
    }
    if (p.carry) {
      var held = s.props.find(function (q) { return q.id === p.carry && !q.destroyed; });
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
    var nearest = s.props.filter(function (q) { return !q.destroyed && !q.carriedBy && !q.thrown &&
      dist(p, q) < 74; })
      .sort(function (a, b) { return dist(p, a) - dist(p, b); })[0];
    if (nearest) {
      p.carry = nearest.id; nearest.carriedBy = p.id; nearest.vx = 0; nearest.vy = 0;
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
    p.hp = Math.max(0, p.hp - amount); p.invuln = 0.85; s.stats.damage += amount;
    event(s, 'player-hit', { playerId: p.id, hp: p.hp, source: source });
    burst(s, 'hit', p.x, p.y, '#ff8d83', 7);
    if (p.hp <= 0) {
      releaseCarry(s, p, false, true); p.downed = true; p.dashTime = 0;
      event(s, 'downed', { playerId: p.id });
      if (!alivePlayers(s).length) finish(s, 'lost');
    }
    return true;
  }
  function damageEnemy(s, e, amount, owner) {
    if (e.hp <= 0) return;
    e.hp -= amount; e.flash = 0.12;
    if (e.hp <= 0) {
      s.stats.kills += 1;
      if (s.players[owner]) s.players[owner].kills += 1;
      burst(s, 'enemy-death', e.x, e.y, e.kind === 'boss' ? '#ffc477' : '#ec9c8d', 12);
      event(s, 'enemy-killed', { enemyId: e.id, kind: e.kind, playerId: owner || null });
    }
  }
  function explode(s, barrel, owner) {
    if (barrel.destroyed) return;
    barrel.destroyed = true; barrel.carriedBy = null;
    Object.keys(s.players).forEach(function (key) { if (s.players[key].carry === barrel.id) s.players[key].carry = null; });
    s.stats.barrels += 1;
    particle(s, 'explosion', barrel.x, barrel.y, { r: 112, ttl: 0.48, life: 0.48, color: '#ffb256' });
    burst(s, 'spark', barrel.x, barrel.y, '#ffbd69', 22);
    event(s, 'explosion', { x: barrel.x, y: barrel.y });
    s.enemies.forEach(function (e) { if (dist(e, barrel) < 112 + e.r) damageEnemy(s, e, 8, owner); });
    s.props.forEach(function (p) {
      if (p !== barrel && p.kind === 'barrel' && !p.destroyed && dist(p, barrel) < 110) {
        p.lit = true; p.fuse = p.fuse > 0 ? Math.min(p.fuse, 0.15) : 0.15;
      }
    });
    // The blast consumes hostile projectiles as a useful emergency tool.
    s.bullets.forEach(function (b) { if (!b.friendly && dist(b, barrel) < 115) b.dead = true; });
  }
  function shoot(s, p) {
    var scatter = p.weapon === 'scatter', n = scatter ? 5 : 1;
    for (var i = 0; i < n; i += 1) {
      var a = p.facing + (scatter ? (i - 2) * 0.115 : 0);
      s.bullets.push({ id: id(s, 'bullet-'), x: p.x + Math.cos(a) * 23,
        y: p.y + Math.sin(a) * 23, r: scatter ? 4 : 4.5,
        vx: Math.cos(a) * (scatter ? 550 : 650), vy: Math.sin(a) * (scatter ? 550 : 650),
        friendly: true, owner: p.id, damage: 1, ttl: scatter ? 0.65 : 1.3,
        color: scatter ? '#ffe6a0' : '#c4fff0', dead: false });
    }
    p.fireCd = scatter ? 0.54 : 0.205;
    event(s, 'shoot', { playerId: p.id, weapon: p.weapon, x: p.x, y: p.y });
  }
  function hostileBullet(s, e, a, speed, radius) {
    s.bullets.push({ id: id(s, 'bullet-'), x: e.x + Math.cos(a) * (e.r + 9),
      y: e.y + Math.sin(a) * (e.r + 9), r: radius || 6,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      friendly: false, owner: e.id, damage: 1, ttl: 4.2, color: '#ff927e', dead: false });
  }
  function lineClear(s, a, b, radius) {
    var d = dist(a, b), n = Math.max(1, Math.ceil(d / 20));
    for (var i = 1; i < n; i += 1) {
      if (collides(s, a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n,
        radius || 4, null, true)) return false;
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
    seen[start] = -1;
    for (var head = 0; head < queue.length && head < 360; head += 1) {
      var cur = queue[head];
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
    if (seen[end] === undefined) return target;
    var current = end, prev = seen[current];
    while (prev !== start && prev !== -1) { current = prev; prev = seen[current]; }
    return { x: current % cols * size + 20, y: Math.floor(current / cols) * size + 20 };
  }
  function updateEnemies(s, dt) {
    var targets = alivePlayers(s);
    if (!targets.length) return;
    s.enemies.forEach(function (e) {
      if (e.hp <= 0) return;
      e.flash = Math.max(0, e.flash - dt); e.stun = Math.max(0, e.stun - dt);
      if (e.stun > 0) return;
      var p = targets.slice().sort(function (a, b) { return dist(a, e) - dist(b, e); })[0];
      var d = dist(e, p), dx = p.x - e.x, dy = p.y - e.y;
      if (e.windup > 0) {
        e.windup -= dt;
        if (e.windup <= 0) {
          var angle = Math.atan2(e.aimY - e.y, e.aimX - e.x);
          if (e.kind === 'chaser') {
            targets.forEach(function (q) { if (dist(e, q) < e.r + q.r + 27) damagePlayer(s, q, 1, 'melee'); });
            particle(s, 'slash', e.x + Math.cos(angle) * 24, e.y + Math.sin(angle) * 24,
              { r: 40, ttl: 0.2, life: 0.2, color: '#ffb095' });
            e.attackCd = 0.9;
          } else if (e.kind === 'shooter') {
            hostileBullet(s, e, angle, 205); e.attackCd = 1.3;
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
      var inRange = e.kind === 'chaser' ? d < 64 : e.kind === 'boss' ? d < 900 : d < 460 && lineClear(s, e, p, 5);
      if (e.attackCd <= 0 && inRange) {
        e.windup = e.kind === 'chaser' ? 0.36 : e.kind === 'shooter' ? 0.6 : 0.78;
        e.aimX = p.x; e.aimY = p.y; e.facing = Math.atan2(dy, dx);
        e.attack = e.kind === 'boss' && e.phase % 2 === 0 ? 'ring' : 'aim';
        event(s, 'enemy-windup', { enemyId: e.id, kind: e.kind, attack: e.attack });
        return;
      }
      var wantsMove = e.kind === 'chaser' ? d > 45 : e.kind === 'boss' ? d > 275 : d > 275 || !lineClear(s, e, p, 5);
      if (wantsMove) {
        e.navTime -= dt;
        if (e.navTime <= 0) {
          var wp = waypoint(s, e, p); e.navX = wp.x; e.navY = wp.y; e.navTime = 0.4;
        }
        dx = e.navX - e.x; dy = e.navY - e.y;
        var l = len(dx, dy) || 1;
        e.facing = Math.atan2(dy, dx); move(s, e, dx / l * e.speed * dt, dy / l * e.speed * dt, false);
      } else e.facing = Math.atan2(dy, dx);
    });
  }
  function updateBullets(s, dt) {
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
          if (hitProp.kind === 'barrel') explode(s, hitProp, b.owner);
          else {
            hitProp.hp -= b.damage;
            burst(s, 'wood', b.x, b.y, '#d6a971', 4);
            if (hitProp.hp <= 0) {
              hitProp.destroyed = true;
              if (hitProp.carriedBy && s.players[hitProp.carriedBy]) s.players[hitProp.carriedBy].carry = null;
              hitProp.carriedBy = null;
            }
          }
          break;
        }
        if (b.friendly) {
          var foe = s.enemies.find(function (e) { return e.hp > 0 && dist(e, b) < e.r + b.r; });
          if (foe) { damageEnemy(s, foe, b.damage, b.owner); b.dead = true; }
        } else {
          var target = alivePlayers(s).find(function (p) { return dist(p, b) < p.r + b.r; });
          if (target) { damagePlayer(s, target, b.damage, 'bullet'); b.dead = true; }
        }
      }
      if (b.ttl <= 0) b.dead = true;
    });
    s.bullets = s.bullets.filter(function (b) { return !b.dead; });
    if (s.bullets.length > 260) s.bullets.splice(0, s.bullets.length - 260);
    s.enemies = s.enemies.filter(function (e) { return e.hp > 0; });
  }
  function updateProps(s, dt) {
    s.props.forEach(function (p) {
      if (p.destroyed || p.carriedBy) return;
      if (p.thrown) {
        var oldX = p.x, oldY = p.y;
        var fullX = p.vx * dt, fullY = p.vy * dt;
        move(s, p, fullX, fullY, true);
        var collided = Math.abs(p.x - oldX - fullX) > 0.1 || Math.abs(p.y - oldY - fullY) > 0.1;
        var hit = s.enemies.some(function (e) { return e.hp > 0 && dist(e, p) < e.r + p.r; });
        p.vx *= Math.pow(0.45, dt); p.vy *= Math.pow(0.45, dt);
        if (collided || hit) explode(s, p, p.thrower || 'p1');
      }
      if (p.lit && !p.destroyed) {
        p.fuse -= dt;
        if (p.fuse <= 0) explode(s, p, p.thrower || 'p1');
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
    if (s.room.index === 4 && s.secretOpened) {
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
    if (held && held.kind === 'water' && held.charges < 3 &&
        s.fountains.some(function (f) { return dist(p, f) < 78; })) return 'E · 在泉眼补满水桶';
    if (held) return held.kind === 'water' ? (held.charges ? 'E · 朝瞄准方向浇水并放下' : '空桶：带回蓝色泉眼按 E 补水') :
      held.kind === 'barrel' ? 'E · 投掷炸药桶' : 'E · 放下木箱';
    var near = s.props.filter(function (q) { return !q.destroyed && !q.carriedBy && !q.thrown &&
      dist(p, q) < 74; })
      .sort(function (a, b) { return dist(p, a) - dist(p, b); })[0];
    if (near) return 'E · 搬起' + ({ crate: '木箱', barrel: '炸药桶', water: '水桶' })[near.kind];
    var gate = s.portals.find(function (g) { return g.active && dist(p, g) < 85; });
    if (gate) return '踏入光门 / E · ' + gate.label;
    return s.hint;
  }
  function step(s, inputs, dt) {
    if (!s || s.status !== 'playing') return s;
    dt = clamp(finite(Number(dt), 1 / 60), 0, 0.05);
    inputs = inputs || {};
    s.events = []; s.time += dt; s.elapsed += dt;
    s.travelCd = Math.max(0, s.travelCd - dt); s.messageTime = Math.max(0, s.messageTime - dt);
    var roomBefore = s.room.index;
    Object.keys(s.players).forEach(function (key) {
      var p = s.players[key], input = inputs[key] || {};
      var dashEdge = !!input.dash && !p.prevDash, interactEdge = !!input.interact && !p.prevInteract;
      p.prevDash = !!input.dash; p.prevInteract = !!input.interact;
      var oldX = p.x, oldY = p.y;
      p.invuln = Math.max(0, p.invuln - dt); p.dashCd = Math.max(0, p.dashCd - dt);
      p.fireCd = Math.max(0, p.fireCd - dt);
      if (p.downed) return;
      var aimX = finite(Number(input.aimX), p.x + Math.cos(p.facing) * 100);
      var aimY = finite(Number(input.aimY), p.y + Math.sin(p.facing) * 100);
      if (len(aimX - p.x, aimY - p.y) > 2) p.facing = Math.atan2(aimY - p.y, aimX - p.x);
      var mx = clamp(finite(Number(input.mx), 0), -1, 1), my = clamp(finite(Number(input.my), 0), -1, 1);
      var magnitude = len(mx, my);
      if (magnitude > 1) { mx /= magnitude; my /= magnitude; }
      if (dashEdge && p.dashCd <= 0) {
        p.dashX = magnitude > 0.1 ? mx / (len(mx, my) || 1) : Math.cos(p.facing);
        p.dashY = magnitude > 0.1 ? my / (len(mx, my) || 1) : Math.sin(p.facing);
        p.dashTime = 0.17; p.dashCd = 1.15; p.invuln = Math.max(p.invuln, 0.25);
        event(s, 'dash', { playerId: key, x: p.x, y: p.y });
      }
      if (p.dashTime > 0) {
        p.dashTime = Math.max(0, p.dashTime - dt);
        move(s, p, p.dashX * 570 * dt, p.dashY * 570 * dt, false);
        particle(s, 'trail', p.x, p.y, { r: p.r, ttl: 0.2, life: 0.2, color: p.color });
      } else {
        var held = s.props.find(function (q) { return q.id === p.carry; });
        var speed = held ? held.kind === 'crate' ? 128 : 155 : 195;
        move(s, p, mx * speed * dt, my * speed * dt, false);
      }
      if (input.shoot && p.fireCd <= 0) shoot(s, p);
      p.vx = dt > 0 ? (p.x - oldX) / dt : 0; p.vy = dt > 0 ? (p.y - oldY) / dt : 0;
      p.moving = Math.abs(p.vx) + Math.abs(p.vy) > 1;
      if (interactEdge) interact(s, key);
    });
    if (s.room.index !== roomBefore) return s;
    updateCarries(s); updateProps(s, dt); updateEnemies(s, dt); updateBullets(s, dt);
    if (s.status !== 'playing') return s;
    alivePlayers(s).forEach(function (p) {
      if (s.fires.some(function (f) { return f.active && dist(f, p) < f.r + p.r - 5; })) damagePlayer(s, p, 1, 'fire');
    });
    collectPickups(s); refreshProgress(s);
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
  function snapshot(s) { return clone(s); }

  return { W: W, H: H, VERSION: 1, create: create, addPlayer: addPlayer,
    removePlayer: removePlayer, step: step, interact: interact, enterRoom: enterRoom,
    snapshot: snapshot, getHint: getHint };
});
