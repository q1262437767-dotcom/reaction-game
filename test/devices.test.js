'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../adventure/engine.js');
const C = require('../adventure/campaign.js');
const D = require('../adventure/devices.js');

function step(state, frames) {
  for (let i = 0; i < frames && state.status === 'playing'; i += 1) E.step(state, {}, 1 / 60);
}

function play(mission, room) {
  const state = E.create({ mode: 'chapter', mission: mission, seed: 3 });
  assert.equal(E.enterRoom(state, room, true, 'p1'), true);
  return state;
}

function standOn(state, item) {
  state.players.p1.x = item.x;
  state.players.p1.y = item.y;
  state.players.p1.invuln = 30;
}

test('each of the twenty named sections has one device verb', () => {
  assert.equal(C.CHAPTERS.length, 20);
  const verbs = new Set();
  C.CHAPTERS.forEach(section => {
    const entry = D.verb(section.id);
    assert.ok(entry, section.id);
    assert.equal(entry.id, section.id);
    assert.ok(entry.verb && entry.label && entry.summary);
    assert.ok(!verbs.has(entry.verb), entry.verb);
    verbs.add(entry.verb);
  });
  assert.equal(D.verb('chapter5').verb, 'try-lamp');
  assert.equal(D.verb('chapter1').existing, true);
  assert.equal(D.verb('chapter3_4').verb, 'inspection-link');
});

test('a lamp ward shows an empty light, then opens a 破绽 only when the patrol steps in', () => {
  const state = play('chapter2', 1);
  const device = state.interactables.find(item => item.verb === 'lamp-ward');
  const patrol = state.enemies.find(enemy => enemy.storyRole === 'snuff');
  const shade = state.enemies.find(enemy => enemy.storyRole === 'shade');
  patrol.x = 80; patrol.y = 80; patrol.stun = 8;
  shade.x = device.x + 20; shade.y = device.y; shade.stun = 8;
  standOn(state, device);
  assert.equal(E.interact(state, 'p1'), true);
  step(state, 3);
  assert.equal(patrol.weakTime || 0, 0);
  assert.equal(shade.weakTime || 0, 0, 'the ward light does not catch a shade');
  assert.ok(device.zoneUntil > state.time);
  patrol.stun = 0;
  patrol.x = device.x + 16;
  patrol.y = device.y;
  step(state, 2);
  assert.ok(patrol.weakTime > 1.2);
  assert.match(state.message, /破绽/);
});

test('the yard gate can slam empty, and a listener vent is what startles the hall', () => {
  const yard = play('chapter2_2', 1);
  const gate = yard.interactables.find(item => item.verb === 'gate-slam');
  yard.enemies.forEach(enemy => { enemy.x = 80; enemy.y = 80; enemy.stun = 9; });
  standOn(yard, gate);
  assert.equal(E.interact(yard, 'p1'), true);
  step(yard, 120);
  assert.ok(yard.enemies.every(enemy => !(enemy.weakTime > 0)));
  assert.match(yard.message, /落空/);

  const hall = play('chapter3_2', 1);
  const vent = hall.interactables.find(item => item.verb === 'vent-hush');
  const listener = hall.enemies.find(enemy => enemy.storyRole === 'listen');
  hall.enemies.forEach(enemy => { enemy.stun = 4; });
  listener.x = vent.x + 12;
  listener.y = vent.y;
  standOn(hall, vent);
  assert.equal(hall.chapter.alerted, false);
  assert.equal(E.interact(hall, 'p1'), true);
  step(hall, 2);
  assert.equal(hall.chapter.alerted, true);
  assert.ok(listener.weakTime > 1);
});

test('a low-tide pillar opens a real 破绽 and a high tide only clangs', () => {
  const low = play('chapter4', 1);
  low.chapter.pulse = 1;
  const pillar = low.interactables.find(item => item.verb === 'low-pillar');
  const foe = low.enemies.find(enemy => enemy.kind === 'pulseling');
  foe.x = pillar.x + 10; foe.y = pillar.y; foe.stun = 4;
  standOn(low, pillar);
  assert.equal(E.interact(low, 'p1'), true);
  step(low, 2);
  assert.ok(foe.weakTime > 1.2);
  assert.match(low.message, /破绽/);

  const high = play('chapter4', 1);
  high.chapter.pulse = 5;
  const hot = high.interactables.find(item => item.verb === 'low-pillar');
  const pulse = high.enemies.find(enemy => enemy.kind === 'pulseling');
  pulse.x = hot.x + 10; pulse.y = hot.y; pulse.stun = 4;
  standOn(high, hot);
  assert.equal(E.interact(high, 'p1'), true);
  step(high, 2);
  assert.ok(pulse.weakTime > 0 && pulse.weakTime <= 0.7);
  assert.match(high.message, /碰响/);
});

test('the furnace mouth refuses a high-tide vent, and the try-lamp is not an ending', () => {
  const mouth = play('chapter4_2', 4);
  mouth.chapter.pulse = 5.2;
  const vent = mouth.interactables.find(item => item.verb === 'mouth-vent');
  standOn(mouth, vent);
  assert.equal(E.interact(mouth, 'p1'), false);
  assert.match(mouth.message, /高潮/);
  assert.equal(vent.zoneUntil || 0, 0);
  assert.equal(mouth.chapter.ending, '');

  const door = play('chapter5', 0);
  const trial = door.interactables.find(item => item.kind === 'story-trial');
  standOn(door, trial);
  assert.equal(E.interact(door, 'p1'), true);
  assert.equal(door.chapter.ending, '');
  assert.match(door.message, /退回待命/);
  assert.equal(door.status, 'playing');
});
