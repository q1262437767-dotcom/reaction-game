'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../adventure/engine.js');
const C = require('../adventure/campaign.js');

function expedition(seed, players = 1) {
  return E.create({ mode: 'rescue', mission: 'salvage', difficulty: 1, players, seed });
}

function tick(state, frames, input = {}) {
  for (let i = 0; i < frames; i++) E.step(state, input, 1 / 60);
}

function isolateNavigation(state) {
  // Keep the encounter geometry and foes in place while testing the routes.
  [state.enemies, ...Object.values(state.roomData).map(room => room.enemies)].forEach(foes => {
    for (const foe of foes) foe.stun = 120;
  });
}

function walkUntil(state, target, reached) {
  for (let i = 0; i < 690 && state.status === 'playing'; i++) {
    if (reached()) return;
    const player = state.players.p1;
    const dx = target.x - player.x, dy = target.y - player.y, gap = Math.hypot(dx, dy);
    tick(state, 1, { p1: gap > 1 ? { mx: dx / gap, my: dy / gap } : {} });
  }
  assert.ok(reached(), 'walk to ' + JSON.stringify(target) + ' in ' + state.room.name +
    ' from ' + state.players.p1.x + ',' + state.players.p1.y);
}

function cross(state, target) {
  const portal = state.portals.find(q => q.target === target && q.active);
  assert.ok(portal, 'an open doorway to room ' + target);
  if (portal.direction === 'north' || portal.direction === 'south') {
    const center = { x: 480, y: state.players.p1.y };
    walkUntil(state, center, () => Math.abs(state.players.p1.x - center.x) < 10);
  }
  walkUntil(state, portal, () => state.room.index === target);
}

test('solo can walk the canal and the longer track through the real exits and extract', () => {
  for (const [seed, outbound, back] of [[62, [1, 2], [1, 0]], [63, [3, 4, 5, 2], [5, 4, 3, 0]]]) {
    const state = expedition(seed);
    isolateNavigation(state);
    const pad = state.interactables.find(q => q.kind === 'rescue-extract');
    assert.equal(pad.active, false);
    for (const room of outbound) cross(state, room);
    walkUntil(state, state.rescue, () => Math.hypot(state.players.p1.x - state.rescue.x, state.players.p1.y - state.rescue.y) < 50);
    assert.equal(E.interact(state, 'p1'), true);
    assert.equal(state.rescue.guide, 'p1');
    isolateNavigation(state);
    for (const room of back) {
      if (room === 0 && state.room.index === 1) state.rescue.water = 0;
      cross(state, room);
      assert.equal(state.rescue.room, room);
    }
    walkUntil(state, pad, () => state.interactables.find(q => q.kind === 'rescue-extract').active &&
      Math.hypot(state.players.p1.x - pad.x, state.players.p1.y - pad.y) < 65);
    assert.equal(E.interact(state, 'p1'), true);
    assert.equal(state.status, 'won');
    assert.equal(state.reward.coins, 24);
    assert.equal(C.applyResult(null, state, 'walk-' + seed).reward, 24);
  }
});

test('canal current hurts inside its marked band, and a disconnected guide leaves a recoverable survivor', () => {
  const state = expedition(62, 2);
  E.enterRoom(state, 2, true, 'p2');
  Object.assign(state.players.p2, { x: state.rescue.x, y: state.rescue.y });
  assert.equal(E.interact(state, 'p2'), true);
  E.enterRoom(state, 1, true, 'p2');
  isolateNavigation(state);
  Object.assign(state.rescue, { water: 4.1 });
  Object.assign(state.players.p2, { x: 360, y: 300, invuln: 0 });
  tick(state, 1);
  assert.equal(state.players.p2.hp, 6);
  Object.assign(state.players.p2, { x: 470, y: 300, invuln: 0 });
  tick(state, 1);
  assert.equal(state.players.p2.hp, 5);
  assert.equal(state.players.p1.hp, 6);
  assert.equal(E.removePlayer(state, 'p2'), true);
  assert.equal(state.room.index, 0);
  assert.equal(state.rescue.guide, '');
  assert.equal(state.rescue.room, 1);
  E.enterRoom(state, 1, false);
  Object.assign(state.players.p1, { x: state.rescue.x, y: state.rescue.y });
  assert.equal(E.interact(state, 'p1'), true);
  assert.equal(state.rescue.guide, 'p1');
});

test('a real elite kill drops a relic and adds eight stars only after escort extraction', () => {
  const state = expedition(65);
  E.enterRoom(state, 6, true);
  const elite = state.enemies.find(e => e.id === state.rescue.eliteId);
  assert.ok(elite && elite.elite);
  Object.assign(elite, { hp: 1, x: 605, y: 300, stun: 10 });
  Object.assign(state.players.p1, { x: 535, y: 300 });
  tick(state, 25, { p1: { aimX: 605, aimY: 300, shoot: true } });
  assert.equal(state.rescue.eliteDown, true);
  const prize = state.interactables.find(q => q.kind === 'relic');
  assert.ok(prize);
  Object.assign(state.players.p1, { x: prize.x, y: prize.y });
  assert.equal(E.interact(state, 'p1'), true);
  assert.equal(state.reward, null);
  E.enterRoom(state, 2, true);
  Object.assign(state.players.p1, { x: state.rescue.x, y: state.rescue.y });
  assert.equal(E.interact(state, 'p1'), true);
  E.enterRoom(state, 0, true);
  const pad = state.interactables.find(q => q.kind === 'rescue-extract');
  Object.assign(state.players.p1, { x: pad.x, y: pad.y });
  tick(state, 30);
  assert.equal(E.interact(state, 'p1'), true);
  assert.equal(state.reward.coins, 32);
  assert.ok(C.applyResult(null, state, 'elite-extraction').profile.relics.includes(prize.buff));
});
