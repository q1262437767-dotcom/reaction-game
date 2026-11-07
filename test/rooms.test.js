'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../adventure/engine.js');
const C = require('../adventure/campaign.js');

const dt = 1 / 60;
const wire = value => JSON.parse(JSON.stringify(value));

function createParty() {
  return E.create({ mode: 'chapter', mission: 'chapter1', seed: 52, players: 2, loadout: 'pistol' });
}

function crossPortal(state, playerId, destination) {
  for (let frame = 0; frame < 90 && E.viewForPlayer(state, playerId).travelCd > 0; frame++) E.step(state, {}, dt);
  const view = E.viewForPlayer(state, playerId);
  const portal = view.portals.find(item => item.active && item.target === destination);
  assert(portal, 'the chosen exit is available from the player’s own room');
  Object.assign(state.players[playerId], { x: portal.x, y: portal.y });
  E.step(state, { [playerId]: { interact: true } }, dt);
}

test('a player can leave while their partner stays and both occupied rooms keep running', () => {
  const state = createParty();
  const start = { x: state.players.p1.x, y: state.players.p1.y, hp: state.players.p1.hp };
  crossPortal(state, 'p2', 1);
  assert.deepEqual(state.playerRooms, { p1: 0, p2: 1 });
  assert.equal(state.room.index, 0);
  assert.deepEqual({ x: state.players.p1.x, y: state.players.p1.y, hp: state.players.p1.hp }, start);
  const initialGuest = wire(E.snapshot(E.viewForPlayer(state, 'p2'), true));
  assert.equal(initialGuest.room.index, 1);
  assert.deepEqual(initialGuest.roomData, {});
  assert.equal('_split' in initialGuest, false);
  assert(Buffer.byteLength(JSON.stringify(initialGuest)) < 64 * 1024);
  const enemy = initialGuest.enemies.find(item => item.kind === 'chaser');
  const before = state.elapsed;
  state.players.p2.invuln = 5;
  for (let frame = 0; frame < 120; frame++) {
    E.step(state, { p2: { shoot: true, aimX: enemy.x, aimY: enemy.y } }, dt);
  }
  assert(Math.abs(state.elapsed - before - 2) < 1e-8, 'the world clock advances once per tick');
  const afterGuest = E.viewForPlayer(state, 'p2');
  const afterEnemy = afterGuest.enemies.find(item => item.id === enemy.id);
  assert(!afterEnemy || afterEnemy.hp < enemy.hp || afterEnemy.x !== enemy.x || afterEnemy.y !== enemy.y);
  assert.equal(state.players.p1.hp, start.hp);
  const partnerPosition = [state.players.p2.x, state.players.p2.y];
  crossPortal(state, 'p1', 1);
  assert.deepEqual(state.playerRooms, { p1: 1, p2: 1 });
  assert.deepEqual([state.players.p2.x, state.players.p2.y], partnerPosition, 'joining a room preserves its existing occupant');
});

test('hits and rescue cannot cross room boundaries at matching coordinates', () => {
  const state = createParty();
  crossPortal(state, 'p2', 1);
  Object.assign(state.players.p1, { x: 385, y: 300, invuln: 0 });
  Object.assign(state.players.p2, { x: 385, y: 300, invuln: 0, hp: 1 });
  const health = state.players.p1.hp;
  for (let frame = 0; frame < 300 && !state.players.p2.downed; frame++) E.step(state, {}, dt);
  assert(state.players.p2.downed, 'the remote room’s guards can attack its occupant');
  assert.equal(state.players.p1.hp, health);
  assert.equal(state.status, 'playing', 'a living partner in another room keeps the expedition alive');
  E.interact(state, 'p1');
  assert(state.players.p2.downed, 'rescuing somebody requires sharing a room');
});

test('guest increments update its scene and later full state retains the room assignment', () => {
  const host = createParty();
  crossPortal(host, 'p2', 1);
  let view = E.viewForPlayer(host, 'p2');
  const guest = wire(E.snapshot(view, true));
  host.players.p2.invuln = 5;
  for (let frame = 0; frame < 30; frame++) {
    E.step(host, { p2: { mx: .2, shoot: true, aimX: 700, aimY: 300 } }, dt);
    view = E.viewForPlayer(host, 'p2');
    E.applySync(guest, wire(E.syncPatch(view, false)));
  }
  assert.equal(guest.room.index, 1);
  assert.deepEqual(guest.playerRooms, { p1: 0, p2: 1 });
  assert(Math.abs(guest.players.p2.x - host.players.p2.x) < .011);
  assert.equal(guest.enemies.length, view.enemies.length);
  crossPortal(host, 'p2', 0);
  const returned = wire(E.snapshot(E.viewForPlayer(host, 'p2'), true));
  assert.equal(returned.room.index, 0);
  assert.deepEqual(returned.playerRooms, { p1: 0, p2: 0 });
});

test('room mechanisms are separate while chapter objectives stay shared', () => {
  const state = E.create({ mode: 'chapter', mission: 'chapter1_3', seed: 52, players: 2 });
  state.chapter.repairerMet = true;
  E.enterRoom(state, 6, true);
  E.enterRoom(state, 3, true, 'p2');
  assert.deepEqual(state.playerRooms, { p1: 6, p2: 3 });
  for (const id of ['p1', 'p2']) {
    const control = E.viewForPlayer(state, id).interactables.find(item => item.kind === 'rail-switch');
    Object.assign(state.players[id], { x: control.x, y: control.y });
  }
  assert(E.interact(state, 'p1'));
  assert.equal(E.viewForPlayer(state, 'p1').chapter.railPower, 3);
  assert.equal(E.viewForPlayer(state, 'p2').chapter.railPower, 0);
  assert(E.interact(state, 'p2'));
  assert.equal(E.viewForPlayer(state, 'p1').chapter.railPower, 3);
  assert.equal(E.viewForPlayer(state, 'p2').chapter.railPower, 3);
  E.enterRoom(state, 2, true, 'p1');
  assert.equal(E.viewForPlayer(state, 'p2').chapter.railPower, 3, 'one person leaving cannot turn off the other room’s rail');
});

test('one player leaving does not drop their partner’s carried prop', () => {
  const state = createParty();
  E.enterRoom(state, 1, true);
  state.players.p1.invuln = state.players.p2.invuln = 5;
  const crate = state.props.find(item => item.kind === 'crate');
  Object.assign(state.players.p1, { x: crate.x, y: crate.y });
  assert(E.interact(state, 'p1'));
  assert.equal(state.players.p1.carry, crate.id);
  crossPortal(state, 'p2', 0);
  assert.equal(state.players.p1.carry, crate.id);
  assert.equal(state.props.find(item => item.id === crate.id).carriedBy, 'p1');
});

test('a shared story completion settles once from either player’s view', () => {
  const state = E.create({ mode: 'chapter', mission: 'chapter1_3', seed: 52, players: 2 });
  state.chapter.repairerMet = true;
  state.chapter.bossDefeated = true;
  state.rooms[6].cleared = true;
  E.enterRoom(state, 4, true, 'p2');
  const car = E.viewForPlayer(state, 'p2').interactables.find(item => item.kind === 'rail-car');
  Object.assign(state.players.p2, { x: car.x, y: car.y });
  assert(E.interact(state, 'p2'));
  assert.equal(state.status, 'won');
  for (const id of ['p1', 'p2']) {
    const view = wire(E.snapshot(E.viewForPlayer(state, id), true));
    assert.equal(view.room.index, 4);
    const result = C.applyResult({}, view, 'shared-room-win');
    assert.equal(result.reward, 60);
    assert.equal(result.profile.missions.chapter1_3.clears, 1);
    assert.equal(C.applyResult(result.profile, view, 'shared-room-win').duplicate, true);
  }
});
