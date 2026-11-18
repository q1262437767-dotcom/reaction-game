'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../adventure/engine.js');

const create = players => E.create({ mode: 'chapter', mission: 'chapter3_4', players, seed: 13, loadout: 'blade' });
const view = (state, id) => E.viewForPlayer(state, id);

function useTerminal(state, id) {
  const control = view(state, id).interactables.find(q => q.kind === 'story-link');
  assert.ok(control);
  Object.assign(state.players[id], { x: control.x, y: control.y });
  return E.interact(state, id);
}

function tick(state, seconds) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) E.step(state, {}, 1 / 60);
}

function strike(state, id, target) {
  const p = state.players[id];
  Object.assign(p, { x: target.x - 54, y: target.y, fireCd: 0 });
  const hp = target.hp;
  E.step(state, { [id]: { shoot: true, aimX: target.x, aimY: target.y } }, 1 / 60);
  return hp - target.hp;
}

test('split terminals open the real surveyor to stronger hits and reset for the next opening', () => {
  const state = create(2);
  assert.equal(E.enterRoom(state, 1, false, 'p1'), true);
  assert.equal(E.enterRoom(state, 1, false, 'p2'), true);
  assert.equal(E.enterRoom(state, 2, false, 'p2'), true);
  const boss = view(state, 'p2').enemies.find(e => e.kind === 'surveyor');

  const ordinaryDamage = strike(state, 'p2', boss);
  assert.ok(ordinaryDamage > 0);
  assert.equal(useTerminal(state, 'p1'), true);
  assert.equal(useTerminal(state, 'p1'), false);
  assert.equal(state.chapter.linkLeft, 12);
  assert.equal(useTerminal(state, 'p2'), true);
  assert.equal(state.chapter.link, 2);
  assert.equal(boss.weakTime, 6);
  assert.ok(boss.stagger > 0);
  assert.equal(boss.windup, 0);
  assert.equal(view(state, 'p1').room.index, 1);
  assert.equal(view(state, 'p2').room.index, 2);
  assert.equal(useTerminal(state, 'p2'), false);
  assert.ok(strike(state, 'p2', boss) > ordinaryDamage);

  assert.equal(E.enterRoom(state, 1, false, 'p2'), true);
  tick(state, 6.1);
  assert.equal(state.chapter.link, 0);
  assert.equal(boss.weakTime, 0, 'empty room must not freeze the weakpoint');
  assert.equal(useTerminal(state, 'p1'), true);
  assert.equal(E.enterRoom(state, 2, false, 'p2'), true);
  assert.equal(useTerminal(state, 'p2'), true);
  assert.equal(boss.weakTime, 6);
});

test('one terminal times out with no opening and the players can retry from the other end', () => {
  const state = create(2);
  assert.equal(E.enterRoom(state, 1, false, 'p1'), true);
  assert.equal(useTerminal(state, 'p1'), true);
  tick(state, 12.1);
  assert.equal(state.chapter.link, 0);
  assert.equal(state.chapter.anchor, -1);
  const boss = state.roomData[2].enemies.find(e => e.kind === 'surveyor');
  assert.equal(boss.weakTime, 0);

  assert.equal(E.enterRoom(state, 1, false, 'p2'), true);
  assert.equal(E.enterRoom(state, 2, false, 'p2'), true);
  assert.equal(useTerminal(state, 'p2'), true);
  assert.equal(useTerminal(state, 'p1'), true);
  assert.equal(boss.weakTime, 6, 'the outer player can complete the link from their own room');
});

test('solo ally crosses through the gate and walks to the control before it can finish the link', () => {
  const state = create(1);
  assert.equal(E.enterRoom(state, 1, false, 'p1'), true);
  assert.equal(E.enterRoom(state, 2, false, 'p1'), true);
  assert.equal(useTerminal(state, 'p1'), true);
  assert.equal(state.chapter.link, 1);
  let crossed = false, enteredAt = null;
  for (let frame = 0; frame < 12 * 60 && state.chapter.link === 1; frame++) {
    E.step(state, {}, 1 / 60);
    if (!crossed && state.railAlly.roomIndex === 1) {
      crossed = true;
      enteredAt = frame;
      assert.equal(state.chapter.link, 1, 'arriving through a door cannot operate the terminal yet');
    }
    if (state.chapter.link === 2) assert.ok(frame > enteredAt + 12);
  }
  assert.ok(crossed);
  assert.equal(state.chapter.link, 2);
  assert.ok(view(state, 'p1').enemies.find(e => e.kind === 'surveyor').weakTime > 5.9);
});
