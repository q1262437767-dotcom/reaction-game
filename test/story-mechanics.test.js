'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../adventure/engine.js');
const C = require('../adventure/campaign.js');

function create(mission, players = 1) {
  return E.create({ mode: 'chapter', mission, players, seed: 60 });
}

function playerView(s, id) {
  return E.viewForPlayer(s, id);
}

function use(s, kind, id = 'p1', match = () => true) {
  const item = playerView(s, id).interactables.find(q => q.kind === kind && match(q));
  assert.ok(item, kind);
  Object.assign(s.players[id], { x: item.x, y: item.y });
  return E.interact(s, id);
}

function tick(s, frames, input = {}) {
  for (let i = 0; i < frames; i++) E.step(s, input, 1 / 60);
}

function neutralizeFoes(s) {
  [s.enemies, ...Object.values(s.roomData).map(room => room.enemies)].forEach(list => {
    for (const foe of list) foe.stun = 200;
  });
}

function until(s, ready, limit = 5400) {
  for (let i = 0; !ready() && i < limit && s.status === 'playing'; i++) tick(s, 1);
  assert.ok(ready(), JSON.stringify(s.chapter));
}

test('both physical routes use the signal and deliver the car before rewarding the run', () => {
  for (const route of [1, 2]) {
    const s = create('chapter4_2', 2);
    neutralizeFoes(s);
    assert.equal(use(s, 'story-switch', 'p1', q => q.pair === route), true);
    assert.equal(use(s, 'story-drive'), true);
    tick(s, 60);
    assert.ok(Math.abs(s.chapter.cartX - 338) < .01);
    assert.equal(use(s, 'story-drive'), true);
    const held = s.chapter.cartX;
    assert.equal(E.enterRoom(s, route, false, 'p2'), true);
    tick(s, 60);
    assert.equal(s.chapter.cartX, held);
    assert.equal(s.chapter.cartRoom, 0);
    assert.equal(s.chapter.cartHp, 14);
    assert.equal(use(s, 'story-drive'), true);
    until(s, () => s.chapter.cartRoom !== 0);
    assert.equal(s.chapter.cartRoom, route);
    assert.equal(E.enterRoom(s, 3, false, 'p2'), true);
    until(s, () => s.chapter.cartRoom === 3 && s.chapter.cartX === 740);
    tick(s, 180);
    assert.equal(s.chapter.cartRoom, 3);
    assert.equal(s.chapter.cartX, 740);
    s.chapter.pulse = 5;
    assert.equal(use(s, 'story-switch', 'p2'), false);
    s.chapter.pulse = 0;
    assert.equal(use(s, 'story-switch', 'p2'), true);
    assert.equal(E.enterRoom(s, 4, false, 'p2'), true);
    assert.equal(E.enterRoom(s, 5, false, 'p2'), true);
    assert.equal(use(s, 'story-goal', 'p2'), false);
    assert.equal(s.status, 'playing');
    until(s, () => s.chapter.cartRoom === 5 && s.chapter.cartX === 680);
    assert.ok(s.chapter.cartHp > 0);
    assert.equal(use(s, 'story-goal', 'p2'), true);
    assert.equal(s.status, 'won');
    assert.equal(C.validStoryChapter(s.chapter, s.status, 'chapter4_2'), true);
  }
});

test('only heat at the actual car location damages it and a stalled car can fail the run', () => {
  const s = create('chapter4_2', 2);
  neutralizeFoes(s);
  E.enterRoom(s, 4, true, 'p2');
  s.chapter.pulse = 5;
  tick(s, 30);
  assert.equal(s.chapter.cartHp, 14, 'scouting in the hot room leaves the car intact');
  assert.equal(s.chapter.cartRoom, 0);
  Object.assign(s.chapter, { cartRoom: 4, cartX: 500, pulse: 5, cartHp: 1 });
  E.enterRoom(s, 5, true, 'p2');
  until(s, () => s.status === 'lost', 60);
  assert.equal(s.chapter.cartHp, 0, 'heat keeps damaging the stopped car in an empty room');
  assert.match(s.message, /运芯车/);
});

test('the west-bank valve raises a real deck and both banks have a usable return route', () => {
  const s = create('chapter3');
  neutralizeFoes(s);
  assert.equal(E.enterRoom(s, 1, false), true);
  Object.assign(s.players.p1, { x: 310, y: 300 });
  tick(s, 95, { p1: { mx: 1 } });
  assert.ok(s.players.p1.x < 390, 'dry trench blocks movement');
  assert.equal(E.enterRoom(s, 0, false), true);
  assert.equal(use(s, 'story-valve'), true);
  assert.equal(E.enterRoom(s, 1, false), true);
  assert.deepEqual(s.props.map(p => p.y), [300, 300, 300]);
  Object.assign(s.players.p1, { x: 310, y: 300 });
  tick(s, 116, { p1: { mx: 1 } });
  assert.ok(s.players.p1.x > 625, 'player walks over the deck');
  assert.equal(use(s, 'story-valve'), true);
  assert.equal(use(s, 'story-valve'), true);
  assert.deepEqual(s.props.map(p => p.y), [430, 430, 430]);
  assert.equal(use(s, 'story-valve'), true, 'east bank can raise the deck again');
  Object.assign(s.players.p1, { x: 650, y: 300 });
  tick(s, 116, { p1: { mx: -1 } });
  assert.ok(s.players.p1.x < 335);
  assert.equal(E.enterRoom(s, 0, false), true);
  assert.equal(use(s, 'story-valve'), true);
  assert.equal(use(s, 'story-valve'), true);
  assert.equal(E.enterRoom(s, 1, false), true);
  tick(s, 60);
  const portal = s.portals.find(q => q.target === 4);
  Object.assign(s.players.p1, { x: portal.x, y: portal.y });
  assert.equal(E.interact(s, 'p1'), true, 'low-water exit is reachable from the west bank');
  assert.equal(E.enterRoom(s, 1, false), true);
  assert.ok(s.players.p1.x < 370, 'return spawns on the bank');
});

test('deep water affects only an actor and lamp actually in the basin', () => {
  const s = create('chapter3', 2);
  neutralizeFoes(s);
  assert.equal(use(s, 'story-valve'), true);
  assert.equal(use(s, 'story-valve'), true);
  E.enterRoom(s, 2, true, 'p2');
  Object.assign(s.chapter, { lit: true, bearer: 'p1', oil: 100 });
  Object.assign(s.players.p2, { x: 660, y: 180, invuln: 0 });
  tick(s, 70);
  assert.equal(s.players.p2.hp, 6, 'dry shore is safe');
  Object.assign(s.players.p2, { x: 660, y: 420, invuln: 0 });
  tick(s, 70);
  assert.ok(s.players.p2.hp < 6, 'the basin is hazardous');
  assert.equal(s.chapter.lit, true, 'a distant team member keeps their lamp');
  s.chapter.bearer = 'p2';
  tick(s, 1);
  assert.equal(s.chapter.lit, false, 'the submerged carrier loses their light');
});
