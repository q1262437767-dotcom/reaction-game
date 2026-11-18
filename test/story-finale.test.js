'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../adventure/engine.js');

function scenario(players, sevenReady = false) {
  return E.create({ mode: 'chapter', mission: 'chapter5_2', players, seed: 61, unlocks: { sevenReady } });
}

function tick(s, seconds, inputs = {}) {
  for (let i = 0; i < Math.ceil(seconds * 60) && s.status === 'playing'; i++) E.step(s, inputs, 1 / 60);
}

function use(s, kind, id = 'p1', match = () => true) {
  const item = E.viewForPlayer(s, id).interactables.find(q => q.kind === kind && match(q));
  assert.ok(item, kind);
  Object.assign(s.players[id], { x: item.x, y: item.y });
  return E.interact(s, id);
}

function cross(s, room, id) {
  tick(s, 1);
  const gate = E.viewForPlayer(s, id).portals.find(q => q.target === room && q.active);
  assert.ok(gate, 'reachable portal to room ' + room);
  Object.assign(s.players[id], { x: gate.x, y: gate.y });
  assert.equal(E.interact(s, id), true);
  assert.equal(E.viewForPlayer(s, id).room.index, room);
}

function walkNear(s, target, range) {
  const startRoom = s.room.index;
  for (let frame = 0; frame < 430 && s.room.index === startRoom && s.status === 'playing'; frame++) {
    const { x, y } = s.players.p1;
    const dx = target.x - x, dy = target.y - y;
    const distance = Math.hypot(dx, dy);
    if (distance < range) return;
    E.step(s, { p1: { mx: dx / distance, my: dy / distance } }, 1 / 60);
  }
  assert.ok(Math.hypot(target.x - s.players.p1.x, target.y - s.players.p1.y) < range, 'walk to ' + target.label);
}

const normal = q => q.ending === 'normal';
const truth = q => q.ending === 'true';

test('the split team authorizes only at low pulse, needs seven lamps, and loses the window if it waits', () => {
  const s = scenario(2);
  assert.equal(use(s, 'story-order', 'p1', normal), false);
  assert.match(E.getHint(s, 'p1'), /击退衡石/);
  cross(s, 1, 'p2');
  cross(s, 3, 'p2');
  s.chapter.pulse = 6;
  assert.equal(use(s, 'story-switch', 'p2'), false);
  assert.equal(s.chapter.link, 0);
  s.chapter.pulse = 0;
  assert.equal(use(s, 'story-switch', 'p2'), true);
  assert.equal(s.chapter.linkLeft, 16);
  assert.equal(use(s, 'story-order', 'p1', truth), false);
  assert.match(E.getHint(s, 'p1'), /七盏秘灯/);
  for (const e of E.viewForPlayer(s, 'p1').enemies.concat(E.viewForPlayer(s, 'p2').enemies)) e.stun = 30;
  tick(s, 16.1);
  assert.equal(s.chapter.link, 0);
  assert.equal(use(s, 'story-order', 'p1', normal), false);
  s.chapter.pulse = 0;
  assert.equal(use(s, 'story-switch', 'p2'), true);
  assert.equal(use(s, 'story-order', 'p1', normal), true);
  assert.equal(s.status, 'won');
  assert.equal(s.chapter.ending, 'normal');
  assert.ok(E.viewForPlayer(s, 'p1').enemies.some(e => e.storyBoss && e.hp > 0));
});

test('a solo player can return through the authored route and use the re-lit order', () => {
  const s = scenario(1, true);
  cross(s, 1, 'p1');
  cross(s, 3, 'p1');
  for (const scene of Object.values(s.roomData)) for (const e of scene.enemies) e.stun = 30;
  s.chapter.pulse = 0;
  assert.equal(use(s, 'story-switch'), true);
  for (const room of [1, 0]) {
    walkNear(s, s.portals.find(g => g.target === room), 60);
    assert.equal(E.interact(s, 'p1'), true);
    assert.equal(s.room.index, room);
  }
  walkNear(s, s.interactables.find(truth), 60);
  assert.ok(s.chapter.linkLeft > 4, 'allow time for combat and hesitation on the way back');
  assert.equal(E.interact(s, 'p1'), true);
  assert.equal(s.chapter.ending, 'true');
});

test('defeating Hengshi permanently opens the orders even after the ash warning', () => {
  const s = scenario(2, true);
  assert.equal(use(s, 'story-smash'), true);
  assert.equal(s.chapter.ending, 'warn');
  const heng = s.enemies.find(e => e.kind === 'wardenblade');
  Object.assign(heng, { hp: 1, x: 640, y: 425, stun: 2 });
  Object.assign(s.players.p1, { x: 550, y: 425 });
  tick(s, 0.4, { p1: { aimX: 640, aimY: 425, shoot: true } });
  assert.equal(s.chapter.phase, 'down');
  assert.equal(s.chapter.link, 0);
  assert.equal(use(s, 'story-order', 'p1', truth), true);
  assert.equal(s.chapter.ending, 'true');
  assert.equal(s.status, 'won');
});
