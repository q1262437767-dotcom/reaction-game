'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../adventure/engine.js');
const dt = 1 / 60;

function investigate() {
  const state = E.create({ mode: 'chapter', mission: 'chapter1_3', seed: 14, loadout: 'pistol' });
  const player = state.players.p1;
  const start = [player.x, player.y, player.hp];
  const visited = new Set([state.railAlly.roomIndex]);
  let frames = 0;
  for (; frames < 5400; frames++) {
    E.step(state, {}, dt);
    const ally = state.railAlly;
    assert.equal(state.status, 'playing');
    assert(ally && !ally.downed, 'the authored investigation route is feasible for the AI');
    visited.add(ally.roomIndex);
    if (ally.task === 'rendezvous' && ally.roomIndex === 2 && state.chapter.clues.includes('rail-order')) {
      frames++;
      break;
    }
  }
  assert(frames < 5400, 'the AI can complete its first objective without player movement');
  assert.deepEqual([player.x, player.y, player.hp], start);
  assert.equal(state.playerRooms.p1, 0);
  assert.equal(state.room.index, 0);
  assert(Math.abs(state.elapsed - frames * dt) < .000001, 'both occupied rooms share one world clock');
  assert(visited.has(1) && visited.has(5) && visited.has(2));
  return state;
}

test('阿禾 investigates a different room and waits for the player’s story interaction', () => {
  const state = investigate();
  for (let frame = 0; frame < 120; frame++) E.step(state, {}, dt);
  assert.equal(state.railAlly.task, 'rendezvous');
  assert.equal(state.railAlly.roomIndex, 2);
  assert.equal(state.chapter.repairerMet, false);
  const aid = E.viewForPlayer(state, 'p1').roomData;
  assert.deepEqual(aid, {});
  E.enterRoom(state, 2, true, 'p1');
  const repairer = state.interactables.find(item => item.kind === 'rail-repairer');
  Object.assign(state.players.p1, { x: repairer.x, y: repairer.y });
  assert(E.interact(state, 'p1'));
  for (let frame = 0; frame < 600 && state.railAlly.roomIndex !== 6; frame++) E.step(state, {}, dt);
  assert.equal(state.railAlly.roomIndex, 6);
  assert.equal(state.railAlly.task, 'feeder');
  assert.equal(state.playerRooms.p1, 2, 'the AI cannot drag the player into its destination');
});

test('a human can replace a remotely working AI and its discovered clue survives', () => {
  const state = investigate();
  E.addPlayer(state, 'p2');
  assert(!state.railAlly);
  assert.deepEqual(state.playerRooms, { p1: 0, p2: 0 });
  assert(state.chapter.clues.includes('rail-order'));
  for (const view of [E.viewForPlayer(state, 'p1'), E.viewForPlayer(state, 'p2')]) {
    assert(!view.bullets.some(bullet => bullet.railAlly));
    const packet = JSON.stringify(E.snapshot(view, true));
    assert(!packet.includes('"rail-ally"'));
    assert(Buffer.byteLength(packet) < 64 * 1024);
  }
  assert(E.removePlayer(state, 'p2'));
  assert(state.railAlly);
  assert(state.chapter.clues.includes('rail-order'));
  assert.notEqual(state.railAlly.task, 'investigate', 'resuming solo should continue the established assignment');
});
