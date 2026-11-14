'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../adventure/engine.js');
const Story = require('../adventure/story.js');

const SIGNATURE = ['mistwarden', 'shadeling', 'listener', 'program', 'pulseling', 'echoguard', 'surveyor', 'grandfurnace', 'wardenblade'];

function create(mission, extra) {
  return E.create(Object.assign({ mode: 'chapter', mission, players: 1, seed: 8, loadout: 'blade' }, extra));
}

function enter(state, index) {
  assert.equal(E.enterRoom(state, index, false), true);
}

test('later chapters keep their ids and grow signature encounters', () => {
  const ids = Story.ids();
  for (const id of ['chapter2', 'chapter2_2', 'chapter2_3', 'chapter2_4', 'chapter3', 'chapter3_2', 'chapter3_3', 'chapter3_4', 'chapter4', 'chapter4_2', 'chapter4_3', 'chapter4_4', 'chapter5', 'chapter5_2', 'chapter5_3', 'secret_unlisted']) {
    assert.ok(ids.includes(id));
    const state = create(id);
    assert.equal(state.chapter.version, 1);
    assert.equal(Object.keys(state.chapter).length, 19);
    state.rooms.forEach(room => {
      room.neighbors.forEach(next => {
        assert.ok(state.rooms[next], id + ' missing room ' + next);
        assert.ok(state.rooms[next].neighbors.includes(room.index), id + ' door ' + room.index + ' -> ' + next);
      });
    });
    for (let n = 0; n < 20 && state.status === 'playing'; n += 1) E.step(state, {}, 1 / 60);
    assert.equal(state.status, 'playing');
  }
  const kinds = new Set();
  for (const id of Story.ids()) {
    const state = create(id);
    state.rooms.forEach(room => (state.roomData[room.index].enemies || []).forEach(enemy => kinds.add(enemy.kind)));
  }
  SIGNATURE.forEach(kind => assert.ok(kinds.has(kind), kind));
  const finale = create('chapter5_2');
  assert.ok(finale.rooms.length >= 5);
  assert.equal(finale.enemies.find(enemy => enemy.storyBoss).kind, 'wardenblade');
  assert.ok(finale.interactables.some(item => item.kind === 'story-smash'));
  const calm = create('chapter5_3');
  assert.equal(calm.rooms.every(room => !(calm.roomData[room.index].enemies || []).length), true);
  assert.ok(calm.interactables.some(item => item.kind === 'story-lantern'));
});

test('a gust can be parried or dodged, and otherwise blows the lantern out', () => {
  const state = create('chapter2');
  enter(state, 1);
  const foe = state.enemies.find(enemy => enemy.kind === 'mistwarden');
  const player = state.players.p1;
  player.x = foe.x - 46; player.y = foe.y; player.facing = 0; player.invuln = 0;
  foe.facing = Math.PI; foe.aimX = player.x; foe.aimY = player.y;
  state.chapter.lit = true; state.chapter.oil = 80; state.chapter.bearer = 'p1';
  foe.windup = 0.01; foe.attack = 'gust'; foe.stun = 0;
  E.step(state, { p1: { guard: true, aimX: foe.x, aimY: foe.y } }, 1 / 60);
  assert.equal(state.chapter.lit, true);
  assert.equal(player.hp, 6);
  assert.ok(foe.stun > 0);

  foe.stun = 0; foe.windup = 0.01; foe.attack = 'gust'; foe.facing = Math.PI;
  player.invuln = 0; player.dashWindow = 0.2; player.hp = 6;
  state.chapter.lit = true; state.chapter.oil = 80;
  E.step(state, { p1: { aimX: foe.x, aimY: foe.y } }, 1 / 60);
  assert.equal(state.chapter.lit, true);
  assert.equal(player.hp, 6);

  foe.stun = 0; foe.windup = 0.01; foe.attack = 'gust'; foe.facing = Math.PI;
  player.invuln = 0; player.dashWindow = 0; player.guarding = false;
  state.chapter.lit = true; state.chapter.oil = 80;
  E.step(state, { p1: { aimX: 0, aimY: player.y } }, 1 / 60);
  assert.equal(state.chapter.lit, false);
  assert.equal(player.hp, 5);
});

test('pulse enemies wait out the low beat, and deep water shorts a soaked machine', () => {
  const rails = create('chapter4');
  enter(rails, 1);
  const pulse = rails.enemies.find(enemy => enemy.kind === 'pulseling');
  const player = rails.players.p1;
  player.x = pulse.x - 36; player.y = pulse.y;
  rails.chapter.pulse = 0.2;
  rails.enemies.forEach(enemy => { enemy.attackCd = 0; });
  for (let n = 0; n < 90; n += 1) E.step(rails, {}, 1 / 60);
  assert.ok(rails.chapter.pulse < 4);
  assert.equal(rails.enemies.some(enemy => enemy.kind === 'pulseling' && (enemy.windup > 0 || enemy.attack === 'slam')), false);
  assert.equal(player.hp, 6);
  rails.chapter.pulse = 4.1;
  rails.enemies.forEach(enemy => { enemy.attackCd = 0; enemy.windup = 0; });
  let telegraphed = false;
  for (let n = 0; n < 40 && !telegraphed; n += 1) {
    E.step(rails, {}, 1 / 60);
    telegraphed = rails.enemies.some(enemy => enemy.kind === 'pulseling' && enemy.windup > 0 && enemy.attack === 'slam');
  }
  assert.equal(telegraphed, true);

  const canal = create('chapter3');
  enter(canal, 1);
  canal.chapter.water = 1;
  enter(canal, 2);
  canal.chapter.water = 2;
  canal.players.p1.x = 480; canal.players.p1.y = 200;
  const soaked = canal.enemies.filter(enemy => enemy.storyRole === 'damp');
  assert.ok(soaked.length >= 2);
  E.step(canal, {}, 1 / 60);
  soaked.forEach(enemy => assert.ok(enemy.stun > 0));
  assert.equal(canal.players.p1.hp, 6);
});

function fight(state, boss) {
  let sawPhase = 1;
  let stuckX = state.players.p1.x, stuckY = state.players.p1.y, stuck = 0;
  for (let frame = 0; frame < 14000 && boss.hp > 0 && state.status === 'playing'; frame += 1) {
    const player = state.players.p1;
    const dx = boss.x - player.x, dy = boss.y - player.y;
    const far = Math.hypot(dx, dy) > 70 + boss.r;
    const defend = boss.stun <= 0 && boss.stagger <= 0 && (boss.windup > 0 || boss.chargeTime > 0);
    let mx = 0, my = 0;
    if (far && !defend) {
      mx = Math.max(-1, Math.min(1, dx / 64));
      my = Math.max(-1, Math.min(1, dy / 64));
      if (Math.hypot(player.x - stuckX, player.y - stuckY) < 0.35) {
        stuck += 1;
        if (stuck > 8) { mx = 0.15; my = 1; }
      } else stuck = 0;
      stuckX = player.x; stuckY = player.y;
    }
    E.step(state, { p1: { mx, my, aimX: boss.x, aimY: boss.y, guard: defend, shoot: !defend } }, 1 / 60);
    if ((boss.stage || 1) > sawPhase) sawPhase = boss.stage;
  }
  return sawPhase;
}

test('story bosses change phase and a scripted player can beat them', () => {
  const heart = create('chapter5_2');
  const heng = heart.enemies.find(enemy => enemy.kind === 'wardenblade');
  assert.equal(heng.storyBoss, true);
  assert.equal(heng.stage, 1);
  heart.players.p1.x = heng.x - 70;
  heart.players.p1.y = heng.y;
  heart.players.p1.invuln = 0;
  const phases = fight(heart, heng);
  assert.ok(phases >= 3, 'phases ' + phases + ' hp ' + heng.hp);
  assert.ok(heng.hp <= 0);
  assert.equal(heart.status, 'playing');
  assert.equal(heart.chapter.phase, 'down');
  assert.equal(heart.players.p1.downed, false);

  const echo = create('chapter2_4');
  enter(echo, 1);
  enter(echo, 2);
  const lamp = echo.enemies.find(enemy => enemy.kind === 'echoguard');
  echo.players.p1.x = lamp.x - 70;
  echo.players.p1.y = lamp.y;
  echo.players.p1.invuln = 0;
  assert.ok(fight(echo, lamp) >= 3);
  assert.ok(lamp.hp <= 0);
  assert.equal(echo.chapter.phase, 'down');

  const furnace = create('chapter4_4');
  enter(furnace, 1);
  const core = furnace.enemies.find(enemy => enemy.kind === 'grandfurnace');
  furnace.players.p1.x = core.x - 80;
  furnace.players.p1.y = core.y;
  furnace.players.p1.invuln = 0;
  assert.ok(fight(furnace, core) >= 3);
  assert.ok(core.hp <= 0);
  assert.equal(furnace.chapter.phase, 'down');

  const pair = create('chapter5_2', { players: 2 });
  const coop = pair.enemies.find(enemy => enemy.kind === 'wardenblade');
  assert.ok(coop.maxHp > heng.maxHp);
  coop.windup = 0.01; coop.attack = 'slash'; coop.facing = Math.PI;
  const leader = pair.players.p1;
  leader.x = coop.x - 40; leader.y = coop.y; leader.invuln = 0;
  E.step(pair, { p1: { guard: true, aimX: coop.x, aimY: coop.y }, p2: {} }, 1 / 60);
  assert.ok(coop.stun > 0);
  assert.equal(leader.hp, 6);
});
