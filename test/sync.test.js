'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../adventure/engine.js');

function wire(value) {
  return JSON.parse(JSON.stringify(value));
}

function fight(state, frames) {
  for (let i = 0; i < frames; i += 1) {
    E.step(state, {
      p1: { mx: i % 40 < 20 ? 1 : -0.5, my: 0.2, aimX: 480, aimY: 300, shoot: i % 4 === 0, guard: i % 30 > 24 },
      p2: { mx: -0.4, my: i % 24 < 12 ? 1 : -1, aimX: 200, aimY: 280, shoot: i % 5 === 0 }
    }, 1 / 60);
  }
  return state;
}

function near(actual, expected, limit) {
  assert.equal(typeof actual, 'number');
  assert.ok(Number.isFinite(actual));
  assert.ok(Math.abs(actual - expected) <= limit, actual + ' vs ' + expected);
}

test('incremental sync survives a JSON round trip and a later full snapshot', () => {
  const host = E.create({ mode: 'story', players: 2, seed: 7, mission: 'ember', difficulty: 1 });
  E.enterRoom(host, 1);
  fight(host, 40);
  let guest = wire(E.snapshot(host, true));
  assert.deepEqual(guest.roomData, {});
  let linkage = E.linkageStamp(host);
  let dropped = false;

  for (let frame = 0; frame < 25; frame += 1) {
    fight(host, 2);
    const stampChanged = E.networkStamp(host) !== E.networkStamp(guest);
    if (stampChanged) {
      guest = wire(E.snapshot(host, true));
      linkage = E.linkageStamp(host);
      continue;
    }
    const skip = E.linkageStamp(host) === linkage;
    const patch = E.syncPatch(host, skip);
    if (skip) {
      assert.equal(patch.walls, undefined);
      assert.equal(patch.doors, undefined);
      assert.equal(patch.pickups, undefined);
    }
    const encoded = JSON.stringify({ type: 'sync', state: patch });
    if (!dropped) {
      dropped = true;
      continue;
    }
    if (!skip) linkage = E.linkageStamp(host);
    E.applySync(guest, wire(JSON.parse(encoded).state));
    near(guest.players.p1.x, host.players.p1.x, 0.011);
    near(guest.players.p1.y, host.players.p1.y, 0.011);
    near(guest.players.p1.hp, host.players.p1.hp, 0.011);
    assert.equal(guest.enemies.length, host.enemies.length);
    guest.enemies.forEach((enemy) => {
      assert.equal('navX' in enemy, false);
      assert.equal('navY' in enemy, false);
    });
  }

  host.walls[0].x += 4;
  assert.notEqual(E.linkageStamp(host), linkage);
  const moved = wire(E.syncPatch(host, false));
  assert.ok(Array.isArray(moved.walls));
  E.applySync(guest, moved);
  assert.equal(guest.walls[0].x, host.walls[0].x);

  guest = wire(E.snapshot(host, true));
  near(guest.players.p1.x, host.players.p1.x, 0.011);
  assert.equal(guest.walls[0].x, host.walls[0].x);
  assert.equal(Object.keys(guest.roomData).length, 0);
});

test('the same seed steps the same way', () => {
  function play(seed) {
    const state = E.create({ mode: 'story', players: 2, seed, mission: 'ember' });
    E.enterRoom(state, 1);
    fight(state, 50);
    return {
      x: state.players.p1.x,
      y: state.players.p1.y,
      hp: state.players.p1.hp,
      enemies: state.enemies.map((enemy) => [enemy.kind, enemy.hp, enemy.x, enemy.y])
    };
  }
  assert.deepEqual(play(7), play(7));
});
