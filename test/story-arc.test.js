'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const C = require('../adventure/campaign.js');
const E = require('../adventure/engine.js');

function blank(id, extra) {
  return Object.assign({
    id, version: 1, phase: 'complete', clues: [], oil: 40, lit: true, bearer: 'p1', hung: -1,
    water: 0, pulse: 1, link: 0, linkLeft: 0, cartHp: 14, cartRoom: 0, cartX: 180,
    ending: '', alerted: false, lamp: '', anchor: -1
  }, extra);
}

function win(id, chapter, extra) {
  return Object.assign({
    status: 'won', mode: 'chapter', difficulty: 1, mission: { id },
    chapter, reward: { coins: 9999 }, elapsed: 30, stats: { damage: 1 }, runBuffs: []
  }, extra);
}

const lamps = ['explorer', 'letter', 'wellblue', 'archive', 'unlisted', 'private', 'echo'];

test('later sections stay locked until the previous one is cleared', () => {
  assert.equal(C.canPlay(null, 'chapter2', 1), false);
  assert.equal(C.canPlay({ v: 2, missions: { chapter1_4: { clears: 1 } } }, 'chapter2', 1), false);
  const afterFifth = { v: 2, missions: { chapter1: { clears: 1 }, chapter1_2: { clears: 1 }, chapter1_3: { clears: 1 }, chapter1_4: { clears: 1 }, chapter1_5: { clears: 1 } } };
  assert.equal(C.canPlay(afterFifth, 'chapter2', 1), true);
  assert.equal(C.canPlay(afterFifth, 'chapter2', 2), false);
  assert.equal(C.canPlay(afterFifth, 'chapter2_2', 1), false);
  assert.equal(C.chapterProgress(afterFifth).nextChapter, null);
  assert.equal(C.chapterProgress(afterFifth).arcNext, 'chapter2');
  const opened = C.applyResult(afterFifth, win('chapter2', blank('chapter2')), 'ch2');
  assert.equal(opened.reward, 55);
  assert.equal(opened.profile.missions.chapter2.clears, 1);
  assert.equal(C.canPlay(opened.profile, 'chapter2_2', 1), true);
  assert.equal(C.applyResult(opened.profile, win('chapter2', blank('chapter2', { phase: 'arrive' })), 'bad-ch2').profile.runs, opened.profile.runs);
});

test('story validation rejects a broken chapter and still pays a clean loss nothing', () => {
  for (const chapter of [
    blank('chapter3', { extra: true }),
    blank('chapter3', { clues: ['nope'] }),
    blank('chapter3', { lamp: 'echo' }),
    blank('chapter3', { oil: 120 }),
    blank('chapter3', { ending: 'normal' }),
    blank('chapter5_2', { ending: 'warn' })
  ]) {
    assert.equal(C.validStoryChapter(chapter, 'won', chapter.id), false);
    assert.equal(C.applyResult(null, win(chapter.id, chapter), 'bad-' + chapter.id).reward, 0);
  }
  const loss = win('chapter3', blank('chapter3', { phase: 'failed' }), { status: 'lost' });
  const settled = C.applyResult(null, loss, 'ch3-loss');
  assert.equal(settled.reward, 0);
  assert.equal(settled.profile.runs, 1);
  assert.equal(settled.profile.missions.chapter3.clears, 0);
});

test('chapter badges, secret lamps, and the three endings settle once', () => {
  let profile = { v: 2, badges: lamps.filter(id => id !== 'echo'), relics: ['decoy'], camp: { companion: { rescued: true, name: '灰尾狐', equipped: true }, records: C.RECORD_IDS } };
  for (const id of ['chapter2', 'chapter2_2', 'chapter2_3']) {
    profile = C.applyResult(profile, win(id, blank(id)), id).profile;
  }
  const north = C.applyResult(profile, win('chapter2_4', blank('chapter2_4', { lamp: '' })), 'ch2-done');
  assert.ok(north.newBadges.includes('northlight'));
  profile = north.profile;
  for (const id of ['chapter3', 'chapter3_2', 'chapter3_3']) profile = C.applyResult(profile, win(id, blank(id, id === 'chapter3_2' ? { lamp: 'archive' } : {})), id).profile;
  assert.ok(profile.badges.includes('archive'));
  const rethread = C.applyResult(profile, win('chapter3_4', blank('chapter3_4')), 'ch3-done');
  assert.ok(rethread.newBadges.includes('rethread'));
  profile = rethread.profile;
  for (const id of ['chapter4', 'chapter4_2', 'chapter4_3']) {
    profile = C.applyResult(profile, win(id, blank(id, id === 'chapter4_3' ? { lamp: 'private' } : {})), id).profile;
  }
  assert.ok(profile.badges.includes('private'));
  const core = C.applyResult(profile, win('chapter4_4', blank('chapter4_4')), 'ch4-done');
  assert.ok(core.newBadges.includes('coresafe'));
  profile = C.applyResult(core.profile, win('chapter5', blank('chapter5', { lamp: 'echo' })), 'echo').profile;
  assert.ok(profile.badges.includes('echo'));
  assert.equal(C.lampsReady(profile), true);
  const forged = C.applyResult({ v: 2, badges: [] }, win('chapter5_2', blank('chapter5_2', { ending: 'true' })), 'forged-true');
  assert.equal(forged.reward, 0);
  assert.equal(forged.profile.missions.chapter5_2.clears, 0);
  const normal = C.applyResult(profile, win('chapter5_2', blank('chapter5_2', { ending: 'normal' })), 'normal-end');
  assert.equal(normal.reward, 70);
  assert.ok(normal.newBadges.includes('hearth'));
  assert.equal(normal.profile.badges.includes('sevenlamps'), false);
  const truth = C.applyResult(normal.profile, win('chapter5_2', blank('chapter5_2', { ending: 'true' })), 'true-end');
  assert.ok(truth.newBadges.includes('sevenlamps'));
  const ash = C.applyResult(truth.profile, win('chapter5_2', blank('chapter5_2', { ending: 'ash' })), 'ash-end');
  assert.ok(ash.newBadges.includes('ashlamp'));
  assert.equal(C.validStoryChapter(blank('chapter5_2', { phase: 'choice', ending: 'warn' }), 'playing', 'chapter5_2'), true);
  assert.equal(C.validStoryChapter(blank('chapter5_2', { phase: 'choice', ending: 'warn' }), 'won', 'chapter5_2'), false);
});

test('the hidden line needs every listed condition and does not block the main road', () => {
  const base = {
    v: 2,
    badges: ['explorer'],
    relics: ['decoy'],
    camp: { companion: { rescued: true, name: '灰尾狐', equipped: true }, records: C.RECORD_IDS.slice(0, 10) },
    missions: { chapter2_4: { clears: 1 } }
  };
  assert.equal(C.canPlay(base, 'secret_unlisted', 1), false);
  assert.equal(C.canPlay(base, 'chapter3', 1), true);
  const ready = C.normalize(Object.assign({}, base, { camp: Object.assign({}, base.camp, { records: C.RECORD_IDS }) }));
  assert.equal(C.secretOpen(ready), true);
  assert.equal(C.canPlay(ready, 'secret_unlisted', 1), true);
  const clear = C.applyResult(ready, win('secret_unlisted', blank('secret_unlisted', { lamp: 'unlisted' })), 'secret');
  assert.equal(clear.reward, 45);
  assert.ok(clear.newBadges.includes('unlisted'));
  assert.equal(C.canPlay(Object.assign({}, base, { camp: Object.assign({}, base.camp, { records: C.RECORD_IDS, companion: { rescued: true, name: '灰尾狐', equipped: false } }) }), 'secret_unlisted', 1), false);
});

test('replaying the last train after chapter 2 can keep the garage letter', () => {
  const chapter = {
    id: 'chapter1_5', version: 1, phase: 'complete', clues: ['train-refuge'],
    started: true, gateOpened: true, coolingStarted: true, coolingLeft: 0, cooled: true, arrived: true,
    unloaded: true, repairsLeft: 1,
    cart: { roomIndex: 7, x: 680, y: 300, hp: 12, maxHp: 14, moving: false, hitCd: 0 },
    ending: { diverted: true, stopped: true, lampLit: true, ventLeft: 0 }
  };
  const early = C.applyResult(null, win('chapter1_5', chapter, { storyFind: 'letter' }), 'too-soon');
  assert.equal(early.profile.badges.includes('letter'), false);
  const later = C.applyResult({ v: 2, missions: { chapter2: { clears: 1 } } }, win('chapter1_5', chapter, { storyFind: 'letter' }), 'letter');
  assert.ok(later.newBadges.includes('letter'));
  assert.ok(later.profile.camp.records.includes('train-refuge'));
});

test('new camp gear spends the published prices and story relics do not complete the original six', () => {
  let profile = C.normalize({ coins: 260, relics: ['pierce'] });
  for (const id of ['lampOil', 'quietSole', 'railGlove', 'dispatch']) profile = C.purchaseUpgrade(profile, id);
  assert.deepEqual(profile.camp.upgrades, ['lampOil', 'quietSole', 'railGlove', 'dispatch']);
  assert.equal(profile.coins, 0);
  const withStory = C.applyResult({ v: 2, relics: ['bluehood', 'moss', 'windfeather', 'pulsering'] }, win('chapter2', blank('chapter2'), { runBuffs: ['bluehood'] }), 'relic-run');
  assert.equal(withStory.profile.badges.includes('collector'), false);
  assert.ok(withStory.profile.relics.includes('bluehood'));
});

test('a lantern, a water gate, and a warned smash are playable with two players', () => {
  const north = E.create({ mode: 'chapter', mission: 'chapter2', players: 2, seed: 4 });
  const lamp = north.interactables.find(item => item.kind === 'story-lantern');
  north.players.p1.x = lamp.x; north.players.p1.y = lamp.y;
  assert.equal(E.interact(north, 'p1'), true);
  assert.equal(north.chapter.lit, true);
  assert.equal(E.enterRoom(north, 1, false, 'p2'), true);
  for (let frame = 0; frame < 90 && E.viewForPlayer(north, 'p2').travelCd > 0; frame++) E.step(north, {}, 1 / 60);
  assert.equal(E.enterRoom(north, 3, false, 'p2'), false);
  north.chapter.lit = false;
  E.step(north, {}, 1 / 60);
  assert.equal(E.enterRoom(north, 3, false, 'p2'), true);
  const canal = E.create({ mode: 'chapter', mission: 'chapter3', players: 2, seed: 5 });
  const valve = canal.interactables.find(item => item.kind === 'story-valve');
  canal.players.p1.x = valve.x; canal.players.p1.y = valve.y;
  assert.equal(E.interact(canal, 'p1'), true);
  assert.equal(canal.chapter.water, 1);
  const heart = E.create({ mode: 'chapter', mission: 'chapter5_2', players: 2, seed: 6, unlocks: { sevenReady: false } });
  const smash = heart.interactables.find(item => item.kind === 'story-smash');
  heart.players.p1.x = smash.x; heart.players.p1.y = smash.y;
  assert.equal(E.interact(heart, 'p1'), true);
  assert.equal(heart.status, 'playing');
  assert.equal(heart.chapter.ending, 'warn');
  assert.equal(E.interact(heart, 'p1'), true);
  assert.equal(heart.status, 'won');
  assert.equal(heart.chapter.ending, 'ash');
});
