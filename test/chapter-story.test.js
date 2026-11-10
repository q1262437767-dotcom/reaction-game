'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../adventure/engine.js');

function party(mission) {
  return E.create({ mode: 'chapter', mission, players: 2, seed: 32, loadout: 'pistol' });
}

function travel(state, player, rooms) {
  for (const room of rooms) assert(E.enterRoom(state, room, false, player), `door to room ${room} is open`);
}

function item(state, player, kind) {
  const target = E.viewForPlayer(state, player).interactables.find(q => q.kind === kind);
  assert(target, `found ${kind} in ${player}'s room`);
  return target;
}

function use(state, player, kind) {
  const target = item(state, player, kind);
  Object.assign(state.players[player], { x: target.x, y: target.y });
  return E.interact(state, player);
}

test('lifting the intake lets the partner open the sluice in a different room', () => {
  const state = party('chapter1');
  travel(state, 'p1', [1, 2, 3]);
  travel(state, 'p2', [1, 2, 5]);
  assert.equal(use(state, 'p1', 'chapter-sluice'), false);
  assert.equal(E.enterRoom(state, 4, false, 'p1'), false);
  assert(use(state, 'p2', 'chapter-intake'));
  assert.equal(item(state, 'p1', 'chapter-sluice').active, true);
  assert(use(state, 'p1', 'chapter-sluice'));
  assert.equal(state.fires.find(f => f.chapterCooling).active, false);
  assert.equal(E.viewForPlayer(state, 'p2').chapter.phase, 'core');
  travel(state, 'p1', [4]);
  assert.equal(state.playerRooms.p2, 5);
});

test('the freed worker directs the players to the safety catch before the crane fight', () => {
  const state = party('chapter1_2');
  travel(state, 'p1', [1, 2, 5]);
  travel(state, 'p2', [1, 2, 5]);
  for (const player of Object.values(state.players)) player.invuln = 10;
  assert(use(state, 'p1', 'timber-winch'));
  for (let tick = 0; tick < 120 && state.chapter.cart.position < .99; tick++) E.step(state, {}, 1 / 60);
  travel(state, 'p2', [4]);
  assert.equal(use(state, 'p2', 'timber-brake'), false);
  travel(state, 'p2', [3]);
  assert(use(state, 'p2', 'timber-worker'));
  assert(!E.viewForPlayer(state, 'p1').enemies.some(foe => foe.timber));
  travel(state, 'p2', [4]);
  assert(use(state, 'p2', 'timber-brake'));
  assert.equal(E.viewForPlayer(state, 'p1').enemies.filter(foe => foe.timber).length, 1);
  assert.equal(state.chapter.bossDefeated, false);
});

test('two players can route the west line during a rail pulse without killing every guard', () => {
  const state = party('chapter1_3');
  travel(state, 'p1', [1, 2]);
  assert(use(state, 'p1', 'rail-repairer'));
  travel(state, 'p1', [6]);
  travel(state, 'p2', [1, 2, 6]);
  assert.equal(use(state, 'p2', 'rail-route'), false);
  assert.equal(E.enterRoom(state, 3, false, 'p2'), false);
  assert(use(state, 'p1', 'rail-switch'));
  assert(use(state, 'p2', 'rail-route'));
  assert.equal(state.rooms[6].cleared, false);
  travel(state, 'p2', [3]);
  const before = JSON.stringify(state);
  assert.equal(E.viewForPlayer(state, 'p2').chapter.railPower, 0);
  assert.equal(E.viewForPlayer(state, 'p2').chapter.feederRouted, true);
  assert.equal(JSON.stringify(state), before, 'projecting the remote boss scene does not change the feeder pulse');
  assert.equal(state.playerRooms.p1, 6);
});
