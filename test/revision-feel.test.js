'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../adventure/engine.js');
const C = require('../adventure/campaign.js');

function step(state, frames, input) {
  for (let i = 0; i < frames && state.status === 'playing'; i += 1) E.step(state, input || {}, 1 / 60);
}

function bossOf(state) {
  return state.enemies.find(enemy => enemy.kind === 'boss');
}

test('a dry courtyard wash shows the water, then staggers a patrol only when the water reaches them', () => {
  const state = E.create({ mode: 'chapter', mission: 'chapter1', seed: 2 });
  assert.equal(E.enterRoom(state, 1, true, 'p1'), true);
  const patrol = state.enemies.find(enemy => enemy.name === '巡炉刀兵');
  const hp = patrol.hp;
  patrol.x = 80;
  patrol.y = 90;
  state.players.p1.x = 268;
  state.players.p1.y = 382;
  assert.equal(E.chapterOpeningView(state).wash.ready, true);
  assert.equal(E.interact(state, 'p1'), true);
  assert.equal(E.chapterOpeningView(state).wash.active, true);
  assert.equal(patrol.weakTime || 0, 0, 'water that has not reached the patrol does not stagger it');
  step(state, 140);
  assert.equal(E.chapterOpeningView(state).wash.active, false);
  assert.match(state.message, /空地/);
  step(state, 220);
  assert.equal(E.chapterOpeningView(state).wash.ready, true);

  patrol.x = 360;
  patrol.y = 310;
  const before = patrol.x;
  assert.equal(E.interact(state, 'p1'), true);
  step(state, 2);
  assert.ok(patrol.weakTime > 1.4);
  assert.ok(patrol.washLean > 0);
  assert.ok(patrol.x > before, 'the stagger travels with the water');
  assert.equal(patrol.hp, hp);
  assert.equal(state.chapter.suppliesTaken, false);
});

test('the west pillar opens the core and the east pillar only clangs', () => {
  const west = E.create({ mode: 'chapter', mission: 'chapter1', seed: 1 });
  assert.equal(E.enterRoom(west, 4, true, 'p1'), true);
  west.players.p1.x = 760;
  west.players.p1.y = 120;
  west.players.p1.invuln = 30;
  for (let i = 0; i < 700 && west.status === 'playing' && !bossOf(west).coreExposed; i += 1) E.step(west, {}, 1 / 60);
  const exposed = bossOf(west);
  assert.equal(exposed.coreExposed, true);
  assert.match(west.message, /炉芯露出来了/);
  assert.ok(exposed.weakTime > 3);
  assert.ok(west.combatEvents.some(event => event.type === 'weakpoint-open' && event.source === 'furnace-core'));

  const east = E.create({ mode: 'chapter', mission: 'chapter1', seed: 1 });
  assert.equal(E.enterRoom(east, 4, true, 'p1'), true);
  east.players.p1.x = 760;
  east.players.p1.y = 120;
  east.players.p1.invuln = 30;
  let renamed = false;
  for (let i = 0; i < 520 && east.status === 'playing'; i += 1) {
    E.step(east, {}, 1 / 60);
    const boss = bossOf(east);
    if (!renamed && boss.rhythm && boss.rhythm.type === 'rush') {
      const wall = east.walls.find(item => item.id === 'core-pillar-west');
      wall.id = 'core-pillar-east';
      renamed = true;
    }
    if (renamed && boss.stagger > 0 && !boss.rhythm) break;
  }
  const glanced = bossOf(east);
  assert.equal(renamed, true);
  assert.notEqual(glanced.coreExposed, true);
  assert.match(east.message, /短响/);
  assert.ok(glanced.weakTime > 1 && glanced.weakTime <= 1.6);
  assert.ok(east.combatEvents.some(event => event.type === 'weakpoint-open' && event.source === 'counter'));
  assert.equal(east.combatEvents.some(event => event.type === 'weakpoint-open' && event.source === 'furnace-core'), false);
});

test('a furnace-door retry restores a fresh fight without paying the same supplies twice', () => {
  const state = E.create({ mode: 'chapter', mission: 'chapter1', seed: 4 });
  state.chapter.intakeOpen = true;
  state.chapter.sluiceOpen = true;
  state.chapter.suppliesTaken = true;
  assert.equal(E.enterRoom(state, 4, true, 'p1'), true);
  const full = bossOf(state).hp;
  state.players.p1.hp = 1;
  state.players.p1.invuln = 0;
  state.players.p1.x = 400;
  state.players.p1.y = 300;
  step(state, 700);
  assert.equal(state.status, 'lost');
  assert.equal(state.doorRetry.offered, true);
  assert.equal(state.chapter.phase, 'failed');
  assert.equal(state.chapter.suppliesTaken, true);
  const lost = C.applyResult(null, state, 'door-loss');
  assert.equal(lost.profile.missions.chapter1.clears, 0);

  assert.equal(E.restoreFurnaceDoor(state), true);
  const boss = bossOf(state);
  assert.equal(state.status, 'playing');
  assert.equal(state.players.p1.downed, false);
  assert.ok(state.players.p1.hp > 1);
  assert.equal(boss.hp, full);
  assert.equal(boss.coreOpeningPending, true);
  assert.equal(boss.rhythm, null);
  assert.equal(state.chapter.suppliesTaken, true);
  assert.notEqual(state.chapter.phase, 'failed');
  assert.equal(state.doorRetry.offered, false);
  assert.equal(state.doorRetry.attempt, 1);
  assert.equal(E.restoreFurnaceDoor(state), false);
  assert.equal(state.bullets.length, 0);
  const settled = C.applyResult(lost.profile, state, 'door-loss');
  assert.equal(settled.reward, 0, 'the same run id cannot be settled as a win while the fight is still open');
});

test('one co-op partner still standing keeps the furnace fight going', () => {
  const state = E.create({ mode: 'chapter', mission: 'chapter1', players: 2, seed: 8 });
  state.chapter.intakeOpen = true;
  state.chapter.sluiceOpen = true;
  assert.equal(E.enterRoom(state, 4, true, 'p1'), true);
  assert.equal(E.enterRoom(state, 4, true, 'p2'), true);
  state.players.p1.hp = 1;
  state.players.p1.invuln = 0;
  state.players.p1.x = 400;
  state.players.p1.y = 300;
  state.players.p2.invuln = 30;
  state.players.p2.x = 760;
  state.players.p2.y = 120;
  step(state, 700);
  assert.equal(state.status, 'playing');
  assert.equal(state.players.p1.downed, true);
  assert.equal(state.players.p2.downed, false);
  assert.equal(state.doorRetry.offered, false);
});

test('a co-op wipe restores both players at the furnace door without the checkpoint blob', () => {
  const state = E.create({ mode: 'chapter', mission: 'chapter1', players: 2, seed: 12 });
  state.chapter.intakeOpen = true;
  state.chapter.sluiceOpen = true;
  state.chapter.suppliesTaken = true;
  assert.equal(E.enterRoom(state, 4, true, 'p1'), true);
  assert.equal(E.enterRoom(state, 4, true, 'p2'), true);
  const full = bossOf(state).hp;
  for (const id of ['p1', 'p2']) {
    state.players[id].hp = 1;
    state.players[id].invuln = 0;
    state.players[id].x = 390;
    state.players[id].y = id === 'p2' ? 330 : 280;
  }
  step(state, 700);
  assert.equal(state.status, 'lost');
  assert.equal(state.doorRetry.offered, true);
  const offered = E.snapshot(E.viewForPlayer(state, 'p2'), true);
  assert.equal(offered.doorRetry.offered, true);
  assert.equal(offered._furnaceCheckpoint, undefined);
  assert.equal(E.restoreFurnaceDoor(state), true);
  assert.equal(state.status, 'playing');
  assert.equal(state.players.p1.downed, false);
  assert.equal(state.players.p2.downed, false);
  assert.equal(state.playerRooms.p1, 4);
  assert.equal(state.playerRooms.p2, 4);
  assert.equal(bossOf(state).hp, full);
  assert.equal(bossOf(state).coreOpeningPending, true);
  assert.equal(state.chapter.suppliesTaken, true);
  assert.equal(state.doorRetry.attempt, 1);
});

test('old retired loadouts, a finished archive, and a fresh guest all read without new weapons', () => {
  const retired = E.create({ mode: 'chapter', mission: 'chapter1', meleeLoadout: 'spear', rangedLoadout: 'echo', seed: 9 });
  assert.equal(retired.players.p1.weapons.melee, 'blade');
  assert.equal(retired.players.p1.weapons.ranged, 'pistol');
  const scatter = E.create({ mode: 'chapter', mission: 'chapter1', rangedLoadout: 'scatter', seed: 9 });
  assert.equal(scatter.players.p1.weapons.ranged, 'scatter');

  const finished = C.normalize({
    v: 2, coins: 80, scatter: true,
    missions: Object.fromEntries(C.CHAPTERS.map(chapter => [chapter.id, { clears: 1, bestTime: 40 }])),
    badges: C.LAMP_IDS.slice(),
    relics: ['decoy'],
    camp: { records: C.RECORD_IDS, companion: { rescued: true, name: '灰尾狐', equipped: true } }
  });
  assert.equal(finished.scatter, true);
  assert.equal(C.lampsReady(finished), true);
  assert.equal(C.canUseSpear(finished), false);
  assert.equal(C.resolveRanged('vent'), 'pistol');
  assert.ok(finished.camp.records.includes('missing-core'));

  const guest = C.normalize(null);
  assert.equal(C.canPlay(guest, 'chapter1', 1), true);
  assert.equal(guest.coins, 0);
  const departure = E.create({ mode: 'chapter', mission: 'chapter1', meleeLoadout: 'hook', rangedLoadout: 'vent', seed: 11 });
  assert.equal(departure.status, 'playing');
  assert.equal(departure.players.p1.weapons.melee, 'blade');
  assert.equal(departure.players.p1.weapons.ranged, 'pistol');
  const lost = C.applyResult(guest, {
    status: 'lost', mode: 'chapter', difficulty: 1, mission: { id: 'chapter1' },
    chapter: {
      id: 'chapter1', version: 1, phase: 'failed', clues: [],
      intakeOpen: false, sluiceOpen: false, bossDefeated: false, fireTaken: false,
      lampLit: false, suppliesTaken: false, beaconLit: false
    },
    reward: { coins: 40 }, elapsed: 12, stats: { damage: 1 }, runBuffs: []
  }, 'guest-loss');
  assert.equal(lost.reward, 0);
  assert.equal(lost.profile.runs, 1);
  const reread = C.normalize(lost.profile);
  assert.equal(reread.missions.chapter1.clears, 0);
  assert.equal(C.canPlay(reread, 'chapter1', 1), true);
});
